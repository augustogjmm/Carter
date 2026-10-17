"""Fixed comparative experiment; no iterative parameter search or test-based selection."""
import hashlib,json,math
from dataclasses import replace
from pathlib import Path
import numpy as np
import pandas as pd
import pcs_verificador_independiente as a

ROOT=Path(__file__).resolve().parent.parent
PROTOCOL=json.loads((ROOT/'research/review_protocol.json').read_text())
OUT=ROOT/'data/review';OUT.mkdir(parents=True,exist_ok=True)
CACHE=ROOT/'review_cache';CACHE.mkdir(exist_ok=True)
MODELS=[x['id'] for x in PROTOCOL['models']]
SPLIT=pd.Timestamp('2023-01-01',tz='UTC');RECENT=pd.Timestamp('2025-01-01',tz='UTC')

def data(sym):
 start=pd.Timestamp('2020-01-01' if sym in ['BTCUSDT','ETHUSDT'] else '2021-01-01',tz='UTC')
 try: df,fp=a.get_data(sym,'4h',start,a.END_UTC,CACHE)
 except RuntimeError as e:
  if not str(e).startswith('Detectados '):raise
  p=CACHE/f'{sym}_4h_{start.year}_{a.END_UTC.strftime("%Y%m%d")}.csv';df=pd.read_csv(p)
  fp={'symbol':sym,'bars':len(df),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'gaps':[]}
  diff=np.diff(df.t.to_numpy(dtype=np.int64))
  for i in np.flatnonzero(diff!=14400000):fp['gaps'].append({'before':int(df.t.iloc[i]),'after':int(df.t.iloc[i+1]),'missing':int(diff[i]//14400000-1)})
 return a.indicators(df),fp

def prepare(d,model):
 p=a.Params(spot_only=True)
 if model=='PCS':return d,p
 if model=='PCS_A':return d,replace(p,only_A=True)
 if model=='PCS_TRAIL':return d,replace(p,no_tp1=True)
 if model=='CARTER_RAW':return d,replace(p,strategy='carter',stopA=1.4,trail=2.2,no_tp1=True)
 if model=='LATINO':return d,replace(p,strategy='latino',no_tp1=True)
 if model=='DONCHIAN21':
  # Reuse independent execution, not its signal calculation: isolate the custom
  # Boolean signal through the documented Carter branch's squeeze transition.
  q=d.copy();condition=(q.c>q.ema200)&(q.ema50>q.ema50.shift(5))&(q.c>q.priorHH)
  q.attrs['custom_signal']=condition.fillna(False).to_numpy()
  return q,replace(p,no_tp1=True)
 return d,replace(p,stopA=3,no_tp1=True,no_time=True)

def run(d,model,start,end,fee=.001):
 if model=='EMA50_200':return cross(d,start,end,fee)
 q,p=prepare(d,model);p=replace(p,fee=fee)
 if model!='DONCHIAN21':return a.run_engine(q,p,start,end)
 original=a.signal_array
 try:
  a.signal_array=lambda frame,params:frame.attrs['custom_signal']
  return a.run_engine(q,p,start,end)
 finally:a.signal_array=original

def signals(d,model):
 if model=='EMA50_200':return ((d.ema50>d.ema200)&(d.ema50.shift(1)<=d.ema200.shift(1))).fillna(False).to_numpy()
 q,p=prepare(d,model)
 return q.attrs['custom_signal'] if model=='DONCHIAN21' else a.signal_array(q,p)

def cross(d,start,end,fee):
 t=d.t.to_numpy(dtype=np.int64);first=int(np.searchsorted(t,a.ts_ms(start)));last=int(np.searchsorted(t,a.ts_ms(end)))
 up=(d.ema50>d.ema200)&(d.ema50.shift(1)<=d.ema200.shift(1));down=(d.ema50<d.ema200)&(d.ema50.shift(1)>=d.ema200.shift(1))
 cash=1.;qty=0.;entry=0.;entryeq=0.;sl=0.;entryt=0;legs=[];trades=[];curve=[];dates=[]
 for k in range(first,last):
  row=d.iloc[k]
  if qty and k>first and down.iloc[k-1]:price=float(row.o)
  elif qty and row.l<=sl:price=float(min(row.o,sl))
  else:price=None
  if price is not None:
   pnl=qty*(price-entry)-qty*entry*fee-qty*price*fee;cash+=qty*price*(1-fee)
   legs.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'net_pnl_pct_entryeq':pnl/entryeq})
   trades.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'legs':1});qty=0
  if not qty and k>first and up.iloc[k-1] and math.isfinite(d.atr.iloc[k-1]):
   entry=float(row.o);dist=3*float(d.atr.iloc[k-1]);entryeq=cash
   qty=min(.01*cash/dist,cash/(entry*(1+fee)));cash-=qty*entry*(1+fee);sl=entry-dist;entryt=int(row.t)
   # Entry-bar stop is evaluated immediately; signal itself is from k-1.
   if row.l<=sl:
    price=min(sl,float(row.o));pnl=qty*(price-entry)-qty*entry*fee-qty*price*fee;cash+=qty*price*(1-fee)
    legs.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'net_pnl_pct_entryeq':pnl/entryeq});trades.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'legs':1});qty=0
  if qty and k==last-1:
   price=float(row.c);pnl=qty*(price-entry)-qty*entry*fee-qty*price*fee;cash+=qty*price*(1-fee)
   legs.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'net_pnl_pct_entryeq':pnl/entryeq});trades.append({'entry_time':entryt,'exit_time':int(row.t),'net_pnl':pnl,'legs':1});qty=0
  curve.append(cash+qty*row.c);dates.append(int(row.t))
 stats=a.summarize(curve,legs,trades);days=(t[last-1]+14400000-t[first])/86400000
 stats.update(ann=stats['multiple']**(365.25/days)-1,ret=stats['multiple']-1)
 stats['calmar']=stats['ann']/stats['dd'] if stats['dd'] else None
 return {'stats':stats,'curve':np.array(curve),'dates':np.array(dates),'legs':legs,'trades':trades}

def bootstrap(trades,seed=20261017):
 # Full trades, with replacement and contiguous blocks of 5, not permuted legs.
 if len(trades)<20:return {'available':False,'trades':len(trades)}
 # Reconstruct sequential trade returns from the reconciled cash PnL.
 equity=1.;returns=[]
 for trade in trades:returns.append(trade['net_pnl']/equity);equity+=trade['net_pnl']
 rr=np.asarray(returns);rng=np.random.default_rng(seed);dd=[];terminal=[]
 for _ in range(5000):
  path=[]
  while len(path)<len(rr):
   j=int(rng.integers(0,len(rr)));path.extend(rr[(j+np.arange(5))%len(rr)].tolist())
  e=np.cumprod(1+np.asarray(path[:len(rr)]));peak=np.maximum.accumulate(np.r_[1.,e])[1:]
  dd.append(float(np.max(1-e/peak)));terminal.append(float(e[-1]))
 return {'available':True,'trades':len(rr),'block':5,'paths':5000,'p95DD':float(np.quantile(dd,.95)),'p05Multiple':float(np.quantile(terminal,.05)),'lossFrequency':float(np.mean(np.array(terminal)<1)),'limitation':'Trade-close bootstrap, not intratrade mark-to-market and not a calibrated future probability'}

def main():
 datasets={};fingerprints=[];rows=[];boot=[];causal=[]
 for sym in PROTOCOL['assets']:
  d,fp=data(sym);datasets[sym]=d;fingerprints.append(fp)
  for n in [250,500,1000,5000,len(d)]:
   prefix=a.indicators(d.iloc[:n][['t','o','h','l','c','v']])
   for model in MODELS:
    equal=np.array_equal(signals(d,model)[:n],signals(prefix,model))
    causal.append({'symbol':sym,'model':model,'bars':n,'prefixInvariant':bool(equal)})
    assert equal,'Causal prefix mismatch: '+model
  windows={'FULL':(pd.to_datetime(d.t.iloc[0],unit='ms',utc=True),a.END_UTC),'IS':(pd.to_datetime(d.t.iloc[0],unit='ms',utc=True),SPLIT),'VALIDATION':(SPLIT,RECENT),'RECENT':(RECENT,a.END_UTC),'OOS_REVIEW':(SPLIT,a.END_UTC)}
  for model in MODELS:
   for win,(start,end) in windows.items():
    result=run(d,model,start,end)
    assert abs(sum(t['net_pnl'] for t in result['trades'])-(result['curve'][-1]-1))<1e-7,'Cash reconciliation failed: '+model
    rows.append(a.outrow(sym,win,model,result))
    if win=='OOS_REVIEW':boot.append({'symbol':sym,'model':model,**bootstrap(result['trades'])})
   rows.append(a.outrow(sym,'STRESS',model,run(d,model,SPLIT,a.END_UTC,.002)))
   q=SPLIT
   while q+pd.DateOffset(months=6)<=a.END_UTC:
    end=q+pd.DateOffset(months=6);rows.append(a.outrow(sym,'WF',model,run(d,model,q,end),{'start':str(q.date()),'end':str(end.date())}));q=end
  for win,(start,end) in windows.items():
   rows.append(a.outrow(sym,win,'B&H',a.buyhold(d,start,end,.001)))
   rows.append(a.outrow(sym,win,'DCA',a.dca_twr(d,start,end,.001)))
  rows.append(a.outrow(sym,'STRESS','B&H',a.buyhold(d,SPLIT,a.END_UTC,.002)))
  rows.append(a.outrow(sym,'STRESS','DCA',a.dca_twr(d,SPLIT,a.END_UTC,.002)))
  print('COMPLETE',sym,flush=True)
 frame=pd.DataFrame(rows);frame.to_csv(OUT/'comparison.csv',index=False)
 def one(sym,model,win):return frame[(frame.symbol==sym)&(frame.experiment==model)&(frame.window==win)].iloc[0]
 scores={model:min(float(one(sym,model,'IS').Calmar) if pd.notna(one(sym,model,'IS').Calmar) else -1e9 for sym in ['BTCUSDT','ETHUSDT']) for model in MODELS}
 selected=max(MODELS,key=lambda model:scores[model]);gates={}
 for model in MODELS:
  g={}
  for sym in ['BTCUSDT','ETHUSDT']:
   o=one(sym,model,'OOS_REVIEW');r=one(sym,model,'RECENT');s=one(sym,model,'STRESS')
   g[sym]={'originalPerformance':bool(o.CAGR>=.15 and o.MaxDD<=.12 and o.PF>=1.5),'recent':bool(r.CAGR>=.10 and r.MaxDD<=.15 and r.PF>=1.2 and r.trades>=20),'costStress':bool(s.CAGR>=.08 and s.PF>=1.2)}
  gates[model]=g
 approved=all(all(g.values()) for g in gates[selected].values())
 result={'completed':True,'generatedAt':a.NOW_UTC.isoformat(),'protocol':PROTOCOL,'protocolSha256':hashlib.sha256((ROOT/'research/review_protocol.json').read_bytes()).hexdigest(),'selectedOnIS':selected,'selectionScores':scores,'eligibleForPromotion':approved,'gates':gates,'rows':json.loads(frame.to_json(orient='records')),'bootstrap':boot,'causality':causal,'fingerprints':fingerprints,
 'decision':'CANDIDATO RETROSPECTIVO; requiere seguimiento prospectivo' if approved else 'NINGÚN REEMPLAZO AUTORIZADO POR LA REGLA PREDEFINIDA',
 'notes':['No se reelige el ganador usando RECENT','Las métricas OOS previas ya se habían observado: no son validación ciega','C4 original confunde sensibilidad al retardo con causalidad; la prueba de prefijos se reporta por separado','Cuatro activos no validan todo el top 50','PCS original y su dictamen se conservan']}
 (OUT/'summary.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,allow_nan=False))
 (OUT/'PROTOCOL.json').write_text(json.dumps(PROTOCOL,indent=2,ensure_ascii=False))
 print(json.dumps({'selectedOnIS':selected,'eligible':approved,'gates':gates},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
