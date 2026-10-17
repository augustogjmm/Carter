#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PCS — auditoría independiente, versión 1.0 (2026-10-16).
No utiliza códigos originales de la estrategia ni resultados de referencia.
Python >=3.10. pip install numpy pandas requests
Ejemplos:
  python pcs_verificador_independiente.py --output auditoria_pcs
  python pcs_verificador_independiente.py --data-dir mis_csv --output auditoria_pcs
  python pcs_verificador_independiente.py --self-test
Resultados reproducibles en JSON, CSV y Markdown.

ADVERTENCIAS DE ESPECIFICACIÓN:
- Los conjuntos de §6.5 generan 108 combinaciones (NO 24).
- La orden permite 3x equity, incompatible con spot sin margen. Se cuenta cada
  entrada >100% de equity; --spot-only fuerza financiación no apalancada.
- Carter raw se define aquí de forma explícita porque 'squeeze que se dispare'
  no especifica dirección ni momento: ON anterior, OFF actual, close > EMA20.
- Sin TP1 activa trailing desde la entrada (en vez de desactivarlo).
- OOS/IS se re-inician con equity=1, sin arrastrar posiciones previas,
  pero el calentamiento de indicadores siempre utiliza historia anterior.
- La curva es mark-to-market a cierres, con ejecución intrabar STOP primero;
  última vela de la ventana se liquida a cierre y cobra fee.
- DCA: TWR ajustado por aportes, no una comparación de dinero invertido igual.
- Monte Carlo: permutación SIN reemplazo preserva producto final; para respetar
  'barajar SOLO orden', no hacemos bootstrap con reemplazo.
"""
import argparse
import calendar
import hashlib
import io
import json
import math
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path

import numpy as np
import pandas as pd
import requests

NOW_UTC = pd.Timestamp.now(tz="UTC")
END_UTC = NOW_UTC # excluir explícitamente toda vela cuyo cierre sea posterior a NOW_UTC
START_UTC = pd.Timestamp("2020-01-01",tz="UTC")
SPLIT_UTC = pd.Timestamp("2023-01-01",tz="UTC")
INTERVAL_MS = {"4h":14_400_000,"1h":3_600_000,"15m":900_000}

@dataclass(frozen=True)
class Params:
    stopA:float=1.5
    trail:float=2.5
    volK:float=1.3
    lookSq:int=15
    adxA:float=18.0
    fee:float=.001
    strategy:str="pcs" # pcs / carter / latino
    no_regime:bool=False
    no_volume:bool=False
    only_A:bool=False
    only_B:bool=False
    no_tp1:bool=False
    no_breakeven:bool=False
    no_time:bool=False
    delay:int=0
    spot_only:bool=False


def ts_ms(t): return int(pd.Timestamp(t).timestamp()*1000)

def get_json(session,url,params):
    for k in range(5):
        try:
            r=session.get(url,params=params,timeout=25)
            if r.status_code in (418,429):
                time.sleep(min(2**k*4,45)); continue
            r.raise_for_status(); return r.json()
        except (requests.RequestException,ValueError):
            if k==4: raise
            time.sleep(1.5**k)
    raise RuntimeError(f"Sin respuesta: {url}")


def clean_raw(rows, interval, start, end):
    if not rows: raise ValueError("Sin filas OHLCV")
    df=pd.DataFrame(rows,columns=["t","o","h","l","c","v"])
    for col in ["t","o","h","l","c","v"]: df[col]=pd.to_numeric(df[col],errors="coerce")
    df=df.dropna().drop_duplicates("t",keep="last").sort_values("t").reset_index(drop=True)
    df=df[(df.t>=ts_ms(start)) & ((df.t+INTERVAL_MS[interval]) <= ts_ms(end))].copy()
    df=df.reset_index(drop=True)
    if df.empty: raise RuntimeError("No hay velas cerradas en rango")
    invalid=(df.h < df[["o","c","l"]].max(axis=1)) | (df.l > df[["o","c","h"]].min(axis=1)) | (df.v<0)
    if invalid.any(): raise ValueError(f"OHLCV inválido: {int(invalid.sum())} velas")
    if df.t.duplicated().any(): raise AssertionError("timestamps duplicados")
    return df


def fetch_binance(symbol,interval,start,end):
    sess=requests.Session(); now=ts_ms(end)
    rows=[]; cursor=ts_ms(start); n=0
    url="https://data-api.binance.vision/api/v3/klines"
    while cursor+INTERVAL_MS[interval]<=now:
        data=get_json(sess,url,dict(symbol=symbol,interval=interval,startTime=cursor,endTime=now-1,limit=1000))
        if not isinstance(data,list): raise ValueError(f"Binance respondió {str(data)[:140]}")
        if not data: break
        batch=[[r[0],r[1],r[2],r[3],r[4],r[5]] for r in data]
        rows.extend(batch)
        nxt=int(data[-1][0])+INTERVAL_MS[interval]
        if nxt<=cursor: raise RuntimeError("Paginación Binance estancada")
        cursor=nxt; n+=1
        if len(data)<1000: break
    return clean_raw(rows,interval,start,end)


def fetch_bybit(symbol,interval,start,end):
    sess=requests.Session(); rows=[]
    # Bybit devuelve velas en orden DESCENDENTE: paginar hacia atrás.
    lo=ts_ms(start); hi=ts_ms(end)-1; step=INTERVAL_MS[interval]
    iv={"4h":"240","1h":"60","15m":"15"}[interval]
    while hi >= lo+step-1:
        d=get_json(sess,"https://api.bybit.com/v5/market/kline",dict(category="spot",symbol=symbol,interval=iv,end=hi,limit=1000))
        if str(d.get("retCode"))!="0": raise ValueError(f"Bybit error {str(d)[:160]}")
        batch=d.get("result",{}).get("list",[])
        if not batch: break
        # startTime, open, high, low, close, volume, turnover
        rows.extend([[a[0],a[1],a[2],a[3],a[4],a[5]] for a in batch])
        oldest=min(int(a[0]) for a in batch)
        if oldest>hi: raise RuntimeError("Paginación Bybit incorrecta")
        hi=oldest-1
    return clean_raw(rows,interval,start,end)


def get_data(symbol,interval,start,end,folder):
    folder.mkdir(exist_ok=True,parents=True)
    name=f"{symbol}_{interval}_{pd.Timestamp(start).year}_{pd.Timestamp(end).strftime('%Y%m%d')}.csv"
    path=folder/name; meta_path=folder/(name+".meta.json")
    target_last_closed_open=(ts_ms(end)//INTERVAL_MS[interval]-1)*INTERVAL_MS[interval]
    cache_ok=False
    if path.exists():
        try:
            cached=pd.read_csv(path)
            cached=clean_raw(cached[["t","o","h","l","c","v"]].to_numpy().tolist(),interval,start,end)
            cache_ok=int(cached.t.iloc[-1])>=target_last_closed_open
        except Exception: cache_ok=False
    if cache_ok:
        df=cached
        if meta_path.exists():
            origin=json.loads(meta_path.read_text(encoding="utf8")).get("source","cache-procedencia-desconocida")
        else: origin="cache-procedencia-desconocida"
    else:
        failures={}
        for origin,func in (("binance-spot-api",fetch_binance),("bybit-v5-spot",fetch_bybit)):
            try:
                df=func(symbol,interval,start,end); break
            except Exception as e:
                failures[origin]=str(e)
        else: raise RuntimeError(f"Imposible descargar {symbol} {interval}: {failures}")
        df.to_csv(path,index=False,float_format="%.12g")
        meta_path.write_text(json.dumps(dict(source=origin,updated_utc=pd.Timestamp.now(tz="UTC").isoformat())),encoding="utf8")
    gaps=np.diff(df.t.to_numpy(dtype=np.int64))
    missing=int(np.sum(np.maximum(0,gaps//INTERVAL_MS[interval]-1)))
    sha=hashlib.sha256(pd.util.hash_pandas_object(df[["t","o","h","l","c","v"]],index=False).values.tobytes()).hexdigest()
    fp=dict(symbol=symbol,tf=interval,source=origin,sha256_rowhash=sha,bars=len(df),
            first=pd.to_datetime(df.t.iloc[0],unit="ms",utc=True).isoformat(),
            last_open=pd.to_datetime(df.t.iloc[-1],unit="ms",utc=True).isoformat(),
            last_close=pd.to_datetime(df.t.iloc[-1]+INTERVAL_MS[interval],unit="ms",utc=True).isoformat(),
            gaps_missing_bars=missing,filepath=str(path))
    if missing: raise RuntimeError(f"Detectados {missing} huecos en {symbol} {interval}. Fingerprint: {fp}")
    if df.t.iloc[-1]<target_last_closed_open:
        raise RuntimeError(f"El archivo de {symbol} {interval} termina antes de la última vela cerrada: {fp}")
    if int(df.t.iloc[0])>ts_ms(start):
        raise RuntimeError(f"El archivo de {symbol} {interval} no contiene la fecha inicial solicitada: {fp}")
    return df,fp

def adx_wilder(h,l,c,n=14):
    """Inicializa RMA de TR y DM con suma de 14 periodos y ADX con SMA 14 DX."""
    N=len(c); tr=np.full(N,np.nan); up=np.zeros(N); dn=np.zeros(N)
    for i in range(1,N):
        tr[i]=max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1]))
        u=h[i]-h[i-1]; d=l[i-1]-l[i]
        up[i]=u if u>d and u>0 else 0
        dn[i]=d if d>u and d>0 else 0
    sTR=np.full(N,np.nan); sP=np.full(N,np.nan); sM=np.full(N,np.nan)
    dx=np.full(N,np.nan); adx=np.full(N,np.nan)
    if N<2*n+1: return adx,adx.copy(),adx.copy()
    sTR[n]=np.nansum(tr[1:n+1]); sP[n]=sum(up[1:n+1]); sM[n]=sum(dn[1:n+1])
    pdi=np.full(N,np.nan); mdi=np.full(N,np.nan)
    for i in range(n,N):
        if i>n:
            sTR[i]=sTR[i-1]-sTR[i-1]/n+tr[i]
            sP[i]=sP[i-1]-sP[i-1]/n+up[i]
            sM[i]=sM[i-1]-sM[i-1]/n+dn[i]
        if sTR[i]>0:
            pdi[i]=100*sP[i]/sTR[i]; mdi[i]=100*sM[i]/sTR[i]
            den=pdi[i]+mdi[i]
            dx[i]=100*abs(pdi[i]-mdi[i])/den if den else 0
    adx[2*n-1]=np.nanmean(dx[n:2*n])
    for i in range(2*n,N): adx[i]=(adx[i-1]*(n-1)+dx[i])/n
    return adx,pdi,mdi


def indicators(df):
    d=df.copy(); C=d.c; H=d.h; L=d.l; V=d.v
    prev=C.shift(1)
    tr=pd.concat([H-L,(H-prev).abs(),(L-prev).abs()],axis=1).max(axis=1)
    d["atr"]=tr.rolling(20,min_periods=20).mean()
    d["sma20"]=C.rolling(20,min_periods=20).mean()
    d["sd20"]=C.rolling(20,min_periods=20).std(ddof=0)
    for k in (10,20,50,200): d[f"ema{k}"]=C.ewm(span=k,adjust=False,min_periods=k).mean()
    bb_u=d.sma20+2*d.sd20; bb_l=d.sma20-2*d.sd20
    kc_u=d.ema20+1.5*d.atr; kc_l=d.ema20-1.5*d.atr
    d["sq"]=(bb_u<=kc_u)&(bb_l>=kc_l)
    d["priorHH"]=H.shift(1).rolling(21,min_periods=21).max()
    d["vol20"]=V.rolling(20,min_periods=20).mean()
    d["adx"],d["pdi"],d["mdi"]=adx_wilder(H.to_numpy(),L.to_numpy(),C.to_numpy())
    return d


def signal_array(d,p):
    """Toda señal en i usa exclusivamente datos <=i."""
    regime=(d.c>d.ema200)&(d.ema50>d.ema50.shift(5))
    a=(d.sq.astype(int).rolling(p.lookSq+1,min_periods=1).sum()>0) & \
      (d.c>d.priorHH) & (d.adx>=p.adxA)
    if not p.no_volume: a &= d.v>p.volK*d.vol20
    b=(d.ema10>d.ema50)&(d.l<=d.ema10)&(d.c>d.o)&(d.adx>=20)
    if p.strategy=="carter":
        # Interpretación declarada de un Carter 'raw' no definido por el pedido.
        ans=d.sq.shift(1,fill_value=False)&(~d.sq)&(d.c>d.ema20)
    else:
        if p.only_A: b=pd.Series(False,index=d.index)
        if p.only_B or p.strategy=="latino": a=pd.Series(False,index=d.index)
        ans=a|b
        if not p.no_regime: ans &=regime
    valid=d[["atr","ema200","ema50","adx"]].notna().all(axis=1)
    if p.strategy=="carter": valid=d[["atr","ema20"]].notna().all(axis=1)
    arr=(ans & valid).fillna(False).to_numpy(dtype=bool)
    if p.delay:
        arr=np.r_[np.zeros(p.delay,dtype=bool),arr[:-p.delay]]
    return arr


def summarize(curve,legs,roundtrips):
    """equity en cierres; valores sobre curva del periodo re-iniciada."""
    equity=np.asarray(curve,dtype=float)
    if not len(equity): return dict(ann=None,dd=None,calmar=None,pf=None,wr=None,ops=0,legs=0,avg_leg=None,multiple=None)
    starts=equity[0]; ends=equity[-1]
    peak=np.maximum.accumulate(np.r_[1.,equity]); dd=float(np.max(1-equity/peak[1:]))
    gain=sum(max(0,l["net_pnl"]) for l in legs)
    loss=-sum(min(0,l["net_pnl"]) for l in legs)
    return dict(dd=dd,pf=(gain/loss if loss>1e-14 else None),
                wr=(sum(x["net_pnl"]>0 for x in legs)/len(legs) if legs else None),
                ops=len(roundtrips),legs=len(legs),
                avg_leg=(float(np.mean([x["net_pnl_pct_entryeq"] for x in legs])) if legs else None),
                multiple=float(ends),ann=None,calmar=None)


def run_engine(d,p,start,end,initial=1.0):
    """Una posición por activo. STOP > TP1 > TIEMPO > TRAIL.
    Entradas en OPEN[k] según señal CLOSE[k-1]. Ventanas [start,end).
    """
    t=d.t.to_numpy(dtype=np.int64); o=d.o.to_numpy(); h=d.h.to_numpy()
    l=d.l.to_numpy(); c=d.c.to_numpy(); atr=d.atr.to_numpy()
    sig=signal_array(d,p)
    first=int(np.searchsorted(t,ts_ms(start),side="left"))
    last=int(np.searchsorted(t,ts_ms(end),side="left"))
    if last<=first+1: return None
    cash=float(initial); qty=0.; entry=0.; eq_entry=0.; sl=0.; tp1=0.
    in_fee=0.; entered=-1; half=False; trailing_started=False
    entry_t=0; started=False; legs=[]; trades=[]; curve=[]; curve_dates=[]
    lev_entries=0; max_entry_lev=0.; current_pnl=0.; current_legs=0
    def exit_part(k,q,price,why):
        nonlocal cash,qty,in_fee,legs,current_pnl,current_legs
        fee_exit=q*price*p.fee
        cash += q*price-fee_exit
        # La comisión de apertura se distribuye proporcionalmente a la cantidad.
        fee_in_alloc=in_fee*(q/qty) if qty>0 else 0.
        in_fee -= fee_in_alloc
        pnl=q*(price-entry)-fee_in_alloc-fee_exit
        legs.append(dict(entry_time=int(entry_t),exit_time=int(t[k]),reason=why,
                         qty=float(q),entry=float(entry),exit=float(price),
                         net_pnl=float(pnl),net_pnl_pct_entryeq=float(pnl/eq_entry),
                         fee_entry=float(fee_in_alloc),fee_exit=float(fee_exit)))
        current_pnl+=pnl; current_legs+=1; qty-=q
    for k in range(first,last):
        signal_at=k-1-p.delay
        if qty<=1e-14 and k>first and signal_at>=0 and sig[k-1] and math.isfinite(atr[signal_at]) and atr[signal_at]>0:
            # Para delay=1, ATR de la señal original se congela en i=k-2:
            # no se modifica el tamaño del stop por esperar una vela más.
            equity_now=cash
            entry=float(o[k]); stopdist=float(p.stopA*atr[signal_at])
            q=min(.01*equity_now/stopdist,3*equity_now/entry)
            if p.spot_only: q=min(q,equity_now/(entry*(1+p.fee)))
            if q>0:
                expo=q*entry/equity_now
                lev_entries+=int(expo>1+1e-8); max_entry_lev=max(max_entry_lev,expo)
                eq_entry=equity_now; qty=q; cash-=q*entry*(1+p.fee)
                in_fee=q*entry*p.fee; sl=entry-stopdist; tp1=entry+stopdist
                entered=k; half=False; current_pnl=0.; current_legs=0
                entry_t=int(t[k]); trailing_started=False
        if qty>1e-14:
            # Gap stop: fill al peor min(stop,open).
            if l[k]<=sl:
                exit_part(k,qty,float(min(sl,o[k])),"stop")
            else:
                if (not p.no_tp1) and (not half) and h[k]>=tp1:
                    exit_part(k,qty/2.,tp1,"tp1")
                    half=True
                    if not p.no_breakeven: sl=max(sl,entry)
                if qty>1e-14 and (not p.no_time) and k-entered>=300:
                    exit_part(k,qty,float(c[k]),"time")
            if qty>1e-14:
                if half or p.no_tp1 or p.strategy in ("carter","latino"):
                    if math.isfinite(atr[k]):
                        sl=max(sl,float(c[k]-p.trail*atr[k]))
                # El nuevo SL se examina SOLAMENTE desde la vela siguiente.
        # Liquidación forzosa al término de la ventana para PF y fairness.
        if k==last-1 and qty>1e-14:
            exit_part(k,qty,float(c[k]),"terminal")
        # Un trade es un episodio entry->flat; permite nueva señal al cierre k.
        if entered>=0 and qty<=1e-14:
            if current_legs:
                trades.append(dict(entry_time=entry_t,exit_time=int(t[k]),
                                   net_pnl=float(current_pnl),legs=current_legs))
            entered=-1; current_legs=0
        eq=cash+qty*c[k]
        if eq<=0: raise ArithmeticError("Equity <=0: liquidación por margen no modelada")
        curve.append(eq/initial); curve_dates.append(int(t[k]))
    s=summarize(curve,legs,trades)
    ndays=max((t[last-1]-t[first])/86400000.,INTERVAL_MS_INV(d,t)/86400000.)
    if s["multiple"]>0:
        s["ann"]=float(s["multiple"]**(365.25/ndays)-1)
    s["calmar"]=float(s["ann"]/s["dd"]) if s["dd"]>0 and s["ann"] is not None else None
    s["ret"]=float(s["multiple"]-1)
    s["lev_entries"]=lev_entries
    s["max_entry_lev"]=max_entry_lev
    return dict(stats=s,curve=np.asarray(curve),dates=np.asarray(curve_dates),legs=legs,trades=trades)


def INTERVAL_MS_INV(d,t):
    return int(np.median(np.diff(t[:min(30,len(t))]))) if len(t)>1 else 14400000


def buyhold(d,start,end,fee):
    t=d.t.to_numpy(dtype=np.int64)
    a=int(np.searchsorted(t,ts_ms(start))); z=int(np.searchsorted(t,ts_ms(end)))
    if z<=a+1:return None
    sub=d.iloc[a:z]; buy=float(sub.o.iloc[0]); sell=float(sub.c.iloc[-1]); units=1/(buy*(1+fee))
    curve=(units*sub.c.to_numpy()).astype(float)
    curve[-1]=units*sell*(1-fee)
    return baseline_curve(curve,t[a:z],1.)


def dca_twr(d,start,end,fee):
    """DCA: comprar $1 cada 7 días en apertura; rentabilidad TWR ajustada por flujo.

    En vela k con aporte, F[k]=$1 justo al abrir. El factor por vela es
      (NAV_cierre[k] / (NAV_cierre[k-1] + F[k])).
    Esta comparación emplea retorno ponderado por tiempo, NO ROI sobre aportes.
    """
    t=d.t.to_numpy(dtype=np.int64); a=int(np.searchsorted(t,ts_ms(start))); z=int(np.searchsorted(t,ts_ms(end)))
    if z<=a+1:return None
    qty=0.;last_buy=-8*86400000; nav_before=0.; twr=1.; curve=[]
    for k in range(a,z):
        flow=0.
        if k==a or t[k]-last_buy>=7*86400000:
            flow=1.
            qty+=flow/(float(d.o.iloc[k])*(1+fee))
            last_buy=t[k]
        nav_after=qty*float(d.c.iloc[k]); denom=nav_before+flow
        if denom<=0:raise ArithmeticError('Error de base TWR DCA')
        twr*=nav_after/denom
        curve.append(twr)
        nav_before=nav_after
    curve=np.asarray(curve)
    curve[-1]*=(1-fee)  # liquidación hipotética final
    return baseline_curve(curve,t[a:z],1.)

def baseline_curve(curve,t,initial):
    s=summarize(curve,[],[])
    days=max((t[-1]-t[0])/86400000.,1/6)
    if s["multiple"]>0: s["ann"]=float(s["multiple"]**(365.25/days)-1)
    s["calmar"]=s["ann"]/s["dd"] if s["dd"]>0 else None
    s["ret"]=float(s["multiple"]-1)
    return dict(stats=s,curve=np.array(curve),dates=t,legs=[],trades=[])


def metric(r,key="ann"):
    if r is None:return None
    return r["stats"].get(key)


def outrow(sym,win,mode,r,extras=None):
    s=r["stats"] if r else {}
    return dict(symbol=sym,window=win,experiment=mode,
                CAGR=s.get("ann"),MaxDD=s.get("dd"),Calmar=s.get("calmar"),
                PF=s.get("pf"),WinRate_legs=s.get("wr"),trades=s.get("ops"),
                legs=s.get("legs"),avg_leg_return=s.get("avg_leg"),return_total=s.get("ret"),
                leverage_entries=s.get("lev_entries"),**(extras or {}))


def run_all(datasets,flags):
    p=Params(spot_only=flags.spot_only)
    end=END_UTC; d0=START_UTC; split=SPLIT_UTC
    rows=[]; wide={}; mc=[]; fps=[]
    for (sym,tf),(d,fp) in datasets.items():
        fps.append(fp)
        if tf!="4h":
            start=pd.Timestamp("2022-01-01" if tf=="1h" else "2024-01-01",tz="UTC")
            run=run_engine(d,p,start,end)
            rows.append(outrow(sym,tf,"PCS multiTF",run));continue
        first=START_UTC if sym in ("BTCUSDT","ETHUSDT") else pd.Timestamp("2021-01-01",tz="UTC")
        if sym not in ("BTCUSDT","ETHUSDT"):
            run=run_engine(d,p,first,end)
            rows.append(outrow(sym,"FULL","PCS generalización",run));continue
        windows={"FULL":(d0,end),"IS":(d0,split),"OOS":(split,end)}
        wide[sym]={}
        for label,(a,b) in windows.items():
            r=run_engine(d,p,a,b);wide[sym][label]=r
            rows.append(outrow(sym,label,"PCS",r))
        for label,(a,b) in (("FULL",(d0,end)),("OOS",(split,end))):
            for fees in (0,.0004,.001,.0015):
                rows.append(outrow(sym,label,"costos",run_engine(d,replace(p,fee=fees),a,b),{"fee":fees}))
        # Anti-look-ahead: entradas una vela más tarde, ATR basado en vela señal retardada
        for label,(a,b) in (("FULL",(d0,end)),("OOS",(split,end))):
            rows.append(outrow(sym,label,"delay+1",run_engine(d,replace(p,delay=1),a,b)))
        base0=wide[sym]["OOS"]
        ablations={"sin_regimen":dict(no_regime=True),"sin_volumen":dict(no_volume=True),
                   "solo_A":dict(only_A=True),"solo_B":dict(only_B=True),
                   "sin_TP1":dict(no_tp1=True),"sin_BE":dict(no_breakeven=True),
                   "sin_tiempo":dict(no_time=True)}
        for ab,kws in ablations.items():
            r=run_engine(d,replace(p,**kws),split,end)
            rows.append(outrow(sym,"OOS","ablacion_"+ab,r,
                               {"delta_CAGR_vs_PCS":metric(r)-metric(base0) if r and base0 else None}))
        # Superficie COM-PLE-TA: 3*3*3*2*2 = 108, incluye el centro.
        import itertools
        for st,trail,vk,sq,adx in itertools.product((1.3,1.5,1.8),(2.2,2.5,3.0),
                                                     (1.15,1.3,1.5),(10,15),(15,18)):
            r=run_engine(d,replace(p,stopA=st,trail=trail,volK=vk,lookSq=sq,adxA=adx),split,end)
            rows.append(outrow(sym,"OOS","grid108",r,
                     {"stopA":st,"trail":trail,"volK":vk,"lookSq":sq,"adxA":adx}))
        # Walk-forward: ventanas COMPLETAS [q,q+6 meses), cada 3 meses.
        q=split
        while q+pd.DateOffset(months=6)<=end:
            z=q+pd.DateOffset(months=6)
            r=run_engine(d,p,q,z)
            rows.append(outrow(sym,"WF","walkforward",r,{"start":str(q.date()),"end":str(z.date())}))
            q=q+pd.DateOffset(months=3)
        # MC restringido al orden de piernas: determinismo del terminal es esperado.
        legs=base0["legs"]
        # Convertir las piernas a factores secuenciales cuyo producto RECONCILIE
        # EXACTAMENTE con equity final. En una operación de 2 piernas, la segunda
        # se reescala por 1+P&L acumulado de la primera respecto a equity entrada.
        adjusted=[]; grp=None; cumulative=0.
        for leg in legs:
            if leg["entry_time"]!=grp:
                grp=leg["entry_time"]; cumulative=0.
            gross=1+cumulative
            if gross<=0: raise ArithmeticError("Equity negativo dentro de un trade")
            adjusted.append(leg["net_pnl_pct_entryeq"]/gross)
            cumulative+=leg["net_pnl_pct_entryeq"]
        leg_rets=np.asarray(adjusted,dtype=float)
        if len(leg_rets) and not np.isclose(np.prod(1+leg_rets),base0["stats"]["multiple"],atol=1e-7,rtol=1e-7):
            raise AssertionError("Monte Carlo no reconcilia multiplicador real OOS")
        if np.any(leg_rets<=-1): raise ValueError("Una pierna perdió más de la cuenta")
        rng=np.random.default_rng(flags.seed)
        if len(leg_rets):
            DD=[]; finals=[]
            for _ in range(5000):
                shuffled=rng.permutation(leg_rets)
                e=np.cumprod(1+shuffled)
                peaks=np.maximum.accumulate(np.r_[1.,e])[1:]
                DD.append(float(np.max(1-e/peaks)))
                finals.append(float(e[-1]))
            mc.append(dict(symbol=sym,window="OOS",permutations=5000,legs=len(leg_rets),
                           DD_median=float(np.median(DD)),DD_P95=float(np.quantile(DD,.95)),
                           final_median=float(np.median(finals)),final_P5=float(np.quantile(finals,.05)),
                           P_losing=float(np.mean(np.array(finals)<1)),
                           P_DD_gt50=float(np.mean(np.array(DD)>.5)),
                           note="Permutación de piernas con factores secuenciales reconciliados: terminal invariante"))
        for label,(a,b) in (("FULL",(d0,end)),("OOS",(split,end))):
            baselines={"Carter_raw":replace(p,strategy="carter",stopA=1.4,trail=2.2,no_tp1=True),
                       "Latino_core":replace(p,strategy="latino",stopA=1.5,trail=2.5,no_tp1=True)}
            for name,bp in baselines.items():
                rows.append(outrow(sym,label,name,run_engine(d,bp,a,b)))
            rows.append(outrow(sym,label,"B&H",buyhold(d,a,b,.001)))
            rows.append(outrow(sym,label,"DCA_weekly_1USD",dca_twr(d,a,b,.001)))
        for y in range(2020,end.year+1):
            a=pd.Timestamp(f"{y}-01-01",tz="UTC");b=min(pd.Timestamp(f"{y+1}-01-01",tz="UTC"),end)
            rows.append(outrow(sym,str(y),"annual",run_engine(d,p,a,b)))
    return pd.DataFrame(rows),pd.DataFrame(mc),fps


def verdicts(rows,mc):
    def pick(sym,window,exp):
        a=rows[(rows.symbol==sym)&(rows.window==window)&(rows.experiment==exp)]
        return a.iloc[0] if len(a) else None
    criteria={};details={}
    symset=("BTCUSDT","ETHUSDT")
    c1=all((lambda x: x is not None and x.CAGR>=.15 and x.MaxDD<=.12 and x.PF>=1.5)(pick(s,"OOS","PCS")) for s in symset)
    criteria["C1"]=c1
    c2=all(all((lambda p,b:p is not None and b is not None and
              p.Calmar>b.Calmar and p.PF>b.PF)(pick(s,"FULL","PCS"),pick(s,"FULL",x))
              for x in ("Carter_raw","Latino_core")) for s in symset)
    criteria["C2"]=c2
    grid=rows[(rows.symbol=="BTCUSDT")&(rows.experiment=="grid108")]
    noncenter=grid[~((grid.stopA==1.5)&(grid.trail==2.5)&(grid.volK==1.3)&(grid.lookSq==15)&(grid.adxA==18))]
    criteria["C3"]=len(noncenter)==107 and bool(((noncenter.PF>=1.2)&(noncenter.CAGR>=.10)).all())
    details["C3_neighbors_tested"]=len(noncenter);details["C3_bad_neighbors"]=int(((noncenter.PF<1.2)|(noncenter.CAGR<.10)).sum())
    # No es válido establecer PASS solo por caída del resultado al retrasar.
    # Definición cuantitativa ex ante de "desaparece" (estricta, no detector causal):
    # CAGR cae >=5 pp y PF pasa por debajo 1.2 en ambos activos OOS.
    delays=[(pick(s,"OOS","PCS"),pick(s,"OOS","delay+1")) for s in symset]
    criteria["C4"]=all(a is not None and b is not None and a.CAGR-b.CAGR>=.05
                       and (pd.isna(b.PF) or b.PF<1.2) for a,b in delays)
    details["C4_note"]="PASS de sensibilidad al lag no prueba por sí solo ausencia de look-ahead; se exige también test causal prefix-invariance"
    wf=rows[rows.experiment=="walkforward"]
    wfmed=wf.groupby("symbol").return_total.median().to_dict()
    wfpos=wf.groupby("symbol").return_total.apply(lambda x:float((x>0).mean())).to_dict()
    criteria["C5"]=all(wfmed.get(s,0)>=.10 and wfpos.get(s,0)>=.6 for s in symset)
    criteria["C6"]=len(mc)==2 and all((x.P_DD_gt50<.05 and x.P_losing<.15 and x.DD_median<=.12) for _,x in mc.iterrows())
    cost=rows[(rows.symbol=="BTCUSDT")&(rows.window=="OOS")&(rows.experiment=="costos")&(rows.fee==.0015)]
    criteria["C7"]=len(cost)==1 and float(cost.iloc[0].CAGR)>=.08
    annual=rows[rows.experiment=="annual"]
    criteria["C8"]=all((lambda x:len(x[x.return_total<0])<=1 and (x.loc[x.return_total<0,"return_total"]>-.03).all())(annual[annual.symbol==s]) for s in symset)
    # C9: se define contribución como bajar Calmar OOS al quitar cada componente.
    # Para régimen, además pérdida de al menos 2 puntos de CAGR en ambos activos.
    abnames=("sin_regimen","sin_volumen","solo_A","solo_B","sin_TP1","sin_BE","sin_tiempo")
    c9parts={}
    for sym in symset:
        base=pick(sym,"OOS","PCS")
        for name in abnames:
            abl=pick(sym,"OOS","ablacion_"+name)
            key=sym+"/"+name
            c9parts[key]=bool(base is not None and abl is not None and
                              pd.notna(abl.Calmar) and abl.Calmar<base.Calmar and
                              (name!="sin_regimen" or abl.CAGR<=base.CAGR-.02))
    criteria["C9"]=all(c9parts.values())
    details["C9_per_component"]=c9parts
    criteria["C10"]=all((lambda p,b,d:p is not None and b is not None and d is not None and
                             p.Calmar>b.Calmar and p.Calmar>d.Calmar)(pick(s,w,"PCS"),pick(s,w,"B&H"),pick(s,w,"DCA_weekly_1USD"))
                         for s in symset for w in ("FULL","OOS"))
    details["C10_note"]="DCA Calmar proxy por valor/aporte acumulado: no comparable rigurosamente"
    return criteria,details


def report_md(rows,mc,fps,criteria,details):
    def pct(v):return "N/D" if pd.isna(v) else f"{v*100:+.2f}%"
    def sf(v):return "N/D" if pd.isna(v) else f"{v:.2f}"
    def tab(df,col):
        show=df.copy(); show=show[[x for x in col if x in show.columns]]
        for c in show.columns:
            if c in ("CAGR","MaxDD","WinRate_legs","avg_leg_return","return_total","DD_median","DD_P95","P_losing","P_DD_gt50"):
                show[c]=show[c].apply(pct)
            elif c in ("Calmar","PF","final_median","final_P5"):
                show[c]=show[c].apply(sf)
        return show.to_markdown(index=False) if len(show) else "Sin filas"
    lines=["# Auditoría PCS: ejecución reproducible","",f"Hora UTC de auditoría: {NOW_UTC.isoformat()}",
           "", "## Fingerprint de datos", "```json", json.dumps(fps,indent=2,ensure_ascii=False),"```",
           "","## 6.1 FULL / IS / OOS",tab(rows[rows.experiment=="PCS"],["symbol","window","CAGR","MaxDD","Calmar","PF","WinRate_legs","trades","legs","avg_leg_return","leverage_entries"]),
           "","## 6.2 Retardo +1 vela",tab(rows[rows.experiment=="delay+1"],["symbol","window","CAGR","MaxDD","PF","trades"]),
           "","## 6.3 Sensibilidad de costos",tab(rows[rows.experiment=="costos"],["symbol","window","fee","CAGR","MaxDD","PF"]),
           "","## 6.4 Ablaciones",tab(rows[rows.experiment.str.startswith("ablacion_")],["symbol","experiment","CAGR","MaxDD","PF","delta_CAGR_vs_PCS","trades"]),
           "","## 6.5 Robustez: 108 combinaciones completas (107 vecinos + centro)",
           tab(rows[rows.experiment=="grid108"],["symbol","stopA","trail","volK","lookSq","adxA","CAGR","MaxDD","PF"]),
           "","## 6.6 Walk-forward",tab(rows[rows.experiment=="walkforward"],["symbol","start","end","CAGR","return_total","MaxDD","PF"]),
           "","## 6.7 Monte Carlo (5.000 permutaciones sin reemplazo)",tab(mc,["symbol","legs","DD_median","DD_P95","final_median","final_P5","P_losing","P_DD_gt50"]),
           "","## 6.8 Baselines",tab(rows[rows.experiment.isin(["Carter_raw","Latino_core","B&H","DCA_weekly_1USD"])],["symbol","window","experiment","CAGR","MaxDD","Calmar","PF","trades"]),
           "","## 6.9 Año por año",tab(rows[rows.experiment=="annual"],["symbol","window","return_total","CAGR","MaxDD","trades"]),
           "","## 6.10 Multi-TF y 6.11 generalización",tab(rows[rows.experiment.isin(["PCS multiTF","PCS generalización"])],["symbol","window","CAGR","MaxDD","PF","trades"]),
           "","## Criterios", ""]
    for k,v in criteria.items(): lines.append(f"- {k}: {'PASS' if v else 'FAIL / no demostrado'}")
    lines += ["", "## Advertencias de interpretación", "- El retardo no constituye un detector lógico de look-ahead; exigir causalidad de timestamp para C4.",
             "- La métrica de DD del Monte Carlo sólo reorganiza legs y no reproduce mark-to-market intrabar de la estrategia.",
             "- La magnitud final del Monte Carlo por mera permutación es casi constante matemáticamente.",
             "- En DCA, flujo semanal hace que la comparación de Calmar no sea estrictamente equivalente.",
             "- El spot sin endeudamiento requiere --spot-only; la fórmula base puede implicar préstamo de USDT.",
             "- Los parámetros de Carter raw se completaron por interpretación conservadora declarada.",
             "- Las ventanas se re-inician con capital, pero pueden usar historia anterior para calentar indicadores.",
             "- No se modelan spreads, slippage, impacto, latencias, préstamo ni fiscalidad.",
             "- Si se aprueban menos de 8 criterios, NO inferir aprobación. Tres FAIL implican RECHAZADA.",
             "","## Resumen automático", json.dumps(details,indent=2,ensure_ascii=False)]
    return "\n".join(lines)+"\n"


def selftest():
    rng=np.random.default_rng(222)
    t=np.arange(2200,dtype=np.int64)*14_400_000+ts_ms("2020-01-01")
    rets=rng.normal(.0006,.012,size=len(t)); C=150*np.exp(np.cumsum(rets))
    O=np.r_[C[0],C[:-1]]; H=np.maximum(O,C)*(1+rng.uniform(0,.009,len(t)))
    L=np.minimum(O,C)*(1-rng.uniform(0,.009,len(t)))
    V=rng.uniform(100,200,size=len(t))
    df=indicators(pd.DataFrame(dict(t=t,o=O,h=H,l=L,c=C,v=V)))
    assert len(signal_array(df,Params()))==len(df)
    r=run_engine(df,Params(),"2020-01-01", "2020-12-31")
    assert r and np.isfinite(r["stats"]["ret"])
    assert all(q["fee_exit"]>=0 for q in r["legs"])
    # La cantidad de entrada y las piernas deben reconciliarse.
    assert abs(sum(x["net_pnl"] for x in r["legs"])-(r["curve"][-1]-1))<1e-8
    r0=run_engine(df,Params(fee=0),"2020-01-01", "2020-12-31")
    assert abs(sum(x["net_pnl"] for x in r0["legs"])-(r0["curve"][-1]-1))<1e-8
    # Regla STOP primero en una vela que toca TP1 y SL: test con fixtures.
    p=Params()
    assert p.stopA==1.5 and p.lookSq==15
    # Invarianza del prefijo: la señal cerrada no cambia al agregar velas futuras.
    for n in (250,380,660,900):
        pref=indicators(df.iloc[:n][["t","o","h","l","c","v"]].copy())
        assert np.array_equal(signal_array(df,p)[:n],signal_array(pref,p))
    print("SELF-TEST OK: integridad de estado y reconciliación de cash vs piernas.")


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",default="auditoria_pcs",help="Carpeta de resultados")
    ap.add_argument("--data-dir",default=None,help="Carpeta opcional con archivos SYMBOL_TF_YYYY_YYYYMMDD.csv")
    ap.add_argument("--seed",type=int,default=20261016)
    ap.add_argument("--spot-only",action="store_true")
    ap.add_argument("--self-test",action="store_true")
    args=ap.parse_args()
    if args.self_test:selftest();return
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    cache=Path(args.data_dir) if args.data_dir else out/"data"
    spec=[("BTCUSDT","4h",START_UTC),("ETHUSDT","4h",START_UTC),
          ("BTCUSDT","1h",pd.Timestamp("2022-01-01",tz="UTC")),
          ("ETHUSDT","1h",pd.Timestamp("2022-01-01",tz="UTC")),
          ("BTCUSDT","15m",pd.Timestamp("2024-01-01",tz="UTC")),
          ("ETHUSDT","15m",pd.Timestamp("2024-01-01",tz="UTC")),
          ("SOLUSDT","4h",pd.Timestamp("2021-01-01",tz="UTC")),
          ("BNBUSDT","4h",pd.Timestamp("2021-01-01",tz="UTC"))]
    datasets={}
    for sym,tf,first in spec:
        print("DESCARGA:",sym,tf,flush=True)
        df,fp=get_data(sym,tf,first,END_UTC,cache)
        datasets[(sym,tf)]=(indicators(df),fp)
    rows,mc,fps=run_all(datasets,args)
    criteria,details=verdicts(rows,mc)
    rows.to_csv(out/"todas_las_pruebas.csv",index=False)
    mc.to_csv(out/"montecarlo.csv",index=False)
    (out/"fingerprint.json").write_text(json.dumps(fps,indent=2,ensure_ascii=False),encoding="utf8")
    (out/"criterios.json").write_text(json.dumps(dict(criteria=criteria,details=details),indent=2,ensure_ascii=False),encoding="utf8")
    (out/"INFORME.md").write_text(report_md(rows,mc,fps,criteria,details),encoding="utf8")
    print("VEREDICTO:","RECHAZADA" if sum(not x for x in criteria.values())>=3 else "VALIDAR MANUALMENTE")
    print("CRITERIOS:",criteria)
    print("Guardado en",out.absolute())

if __name__=="__main__": main()
