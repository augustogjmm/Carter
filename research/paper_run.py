"""Prospective paper observation from the user's request onward; never sends orders."""
import hashlib,json
from pathlib import Path
import numpy as np
import review_suite as review
from paper_core import account,step,mark,BAR

ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'data/paper';OUT.mkdir(parents=True,exist_ok=True)
START=1792244227000  # 2026-10-17T13:37:07Z; historical data before this is warm-up only.
protocol_hash=hashlib.sha256((ROOT/'research/review_protocol.json').read_bytes()).hexdigest()
now=review.a.ts_ms(review.a.NOW_UTC)
path=OUT/'state.json'
state=json.loads(path.read_text()) if path.exists() else {'startAt':START,'protocolSha256':protocol_hash,'accounts':{},'events':[]}
if state['protocolSha256']!=protocol_hash:raise RuntimeError('Frozen paper protocol changed; refusing silent reset')
summary=[]
for sym in review.PROTOCOL['assets']:
 d,fp=review.data(sym)
 # Actual current candle open is only a paper entry price; its unfinished high,
 # low, close and volume never enter indicators or a confirmed signal.
 raw=review.a.get_json(review.a.requests.Session(),'https://data-api.binance.vision/api/v3/klines',{'symbol':sym,'interval':'4h','limit':2})
 forming=[r for r in raw if int(r[0])+BAR>now and int(r[0])<=now]
 current={'t':int(forming[-1][0]),'o':float(forming[-1][1])} if forming else None
 for model in review.MODELS:
  key=sym+'/'+model;acc=state['accounts'].setdefault(key,account((START//BAR-1)*BAR))
  sig=review.signals(d,model);q,p=review.prepare(d,model)
  rule={'id':model,'stopA':p.stopA,'trail':p.trail,'no_tp1':p.no_tp1,'no_time':p.no_time,'cross':model=='EMA50_200'}
  down=((d.ema50<d.ema200)&(d.ema50.shift(1)>=d.ema200.shift(1))).to_numpy()
  first=int(np.searchsorted(d.t.to_numpy(),acc['lastClosed'],side='right'))
  for k in range(first,len(d)):
   if k==0:continue
   b={name:float(d.iloc[k][name]) for name in ['t','o','h','l','c']};before=len(state['events'])
   step(acc,b,bool(sig[k-1]) and b['t']>=START,float(d.atr.iloc[k-1]),float(d.atr.iloc[k]),rule,state['events'],now,down=bool(down[k-1]))
   for event in state['events'][before:]:event['symbol']=sym
  if current and current['t']>=START and current['t']==int(d.t.iloc[-1])+BAR:
   before=len(state['events']);step(acc,current,bool(sig[-1]),float(d.atr.iloc[-1]),float(d.atr.iloc[-1]),rule,state['events'],now,entry_only=True,down=bool(down[-1]))
   for event in state['events'][before:]:event['symbol']=sym
  price=current['o'] if current else float(d.c.iloc[-1])
  summary.append({'symbol':sym,'model':model,'markPrice':price,'markAt':current['t'] if current else int(d.t.iloc[-1])+BAR,**mark(acc,price)})
result={'generatedAt':review.a.NOW_UTC.isoformat(),'startAt':START,'protocolSha256':protocol_hash,'mode':'PAPER_ONLY','accounts':summary,'events':state['events'][-200:],'totalEvents':len(state['events']),'minimumMonths':3,'minimumClosedPerAsset':20,'promoted':False,'status':'RECOLECTANDO DATOS PROSPECTIVOS','notes':['No órdenes ni capital real','No reinicia el historial ni ajusta parámetros','Señales anteriores al inicio excluidas; historia previa solo calienta indicadores','Los fills en apertura son simulados con precio real; ejecuciones tardías se identifican como reconstruidas','Las posiciones abiertas se marcan a la apertura actual observada; no es cotización tick actual','Muestra mínima no implica aprobación automática']}
path.write_text(json.dumps(state,ensure_ascii=False,allow_nan=False));(OUT/'summary.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,allow_nan=False))
print(json.dumps({'mode':result['mode'],'startAt':START,'accounts':len(summary),'events':len(state['events'])}),flush=True)
