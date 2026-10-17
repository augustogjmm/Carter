"""A second, declared hypothesis. Select on IS before testing one model elsewhere."""
import hashlib,json
from dataclasses import replace
from pathlib import Path
import numpy as np
import pandas as pd
import review_suite as base

ROOT=Path(__file__).resolve().parent.parent
PATH=ROOT/'research/mtf_protocol.json';P=json.loads(PATH.read_text());OUT=ROOT/'data/mtf-study';OUT.mkdir(parents=True,exist_ok=True)
SPLIT=pd.Timestamp('2023-01-01',tz='UTC');RECENT=pd.Timestamp('2025-01-01',tz='UTC')

def daily_filter(d):
 x=d[['t','o','h','l','c','v']].copy();x['day']=(x.t//86400000).astype('int64')
 daily=x.groupby('day',sort=True).agg(c=('c','last'),bars=('t','size'),first=('t','min'),last=('t','max'))
 daily=daily[(daily.bars==6)&(daily['last']-daily['first']==5*14400000)].copy()
 e50=daily.c.ewm(span=50,adjust=False,min_periods=50).mean();e200=daily.c.ewm(span=200,adjust=False,min_periods=200).mean()
 daily['ok']=((daily.c>e200)&(e50>e50.shift(5))).fillna(False)
 daily['availableAt']=(daily.index.to_numpy(dtype=np.int64)+1)*86400000
 left=pd.DataFrame({'availableAt':d.t.to_numpy(dtype=np.int64)+14400000})
 merged=pd.merge_asof(left,daily[['availableAt','ok']].reset_index(drop=True).sort_values('availableAt'),on='availableAt',direction='backward')
 return merged.ok.eq(True).to_numpy()

def signal(d,v):
 regime=(d.c>d.ema200)&(d.ema50>d.ema50.shift(5));kind=v['entry']
 if kind=='DC21':raw=regime&(d.c>d.priorHH)
 elif kind=='DC55':raw=regime&(d.c>d.h.shift(1).rolling(55,min_periods=55).max())
 elif kind=='SQ':raw=regime&d.sq.shift(1,fill_value=False)&(~d.sq)&(d.c>d.ema20)
 elif kind=='A':raw=base.a.signal_array(d,replace(base.a.Params(),only_A=True))
 elif kind=='B':raw=base.a.signal_array(d,replace(base.a.Params(),only_B=True))
 else:raw=base.a.signal_array(d,base.a.Params())
 return np.asarray(raw,dtype=bool)&daily_filter(d)

def run(d,v,start,end,fee=.001):
 original=base.a.signal_array;sig=signal(d,v)
 try:
  base.a.signal_array=lambda frame,params:sig
  result=base.a.run_engine(d,replace(base.a.Params(),spot_only=True,no_tp1=not v['partial'],trail=v['trail'],fee=fee),start,end)
 finally:base.a.signal_array=original
 assert abs(sum(t['net_pnl'] for t in result['trades'])-(result['curve'][-1]-1))<1e-7
 return result

def causal_test(d,symbol):
 checks=[]
 for n in [500,1500,5000,len(d)-2,len(d)]:
  prefix=base.a.indicators(d.iloc[:n][['t','o','h','l','c','v']])
  for v in P['variants']:
   equal=np.array_equal(signal(d,v)[:n],signal(prefix,v));assert equal,'Daily look-ahead: '+v['id']
   checks.append({'symbol':symbol,'model':v['id'],'prefix':n,'pass':bool(equal)})
 return checks

def main():
 datasets={};fps=[];rows=[];checks=[]
 for sym in P['trainingAssets']:
  d,fp=base.data(sym);datasets[sym]=d;fps.append(fp);checks+=causal_test(d,sym)
  start=pd.to_datetime(d.t.iloc[0],unit='ms',utc=True)
  for v in P['variants']:rows.append(base.a.outrow(sym,'IS',v['id'],run(d,v,start,SPLIT)))
 scores={v['id']:min(next(r['Calmar'] if r['Calmar'] is not None else -1e9 for r in rows if r['symbol']==s and r['experiment']==v['id']) for s in P['trainingAssets']) for v in P['variants']}
 chosen=max(P['variants'],key=lambda v:scores[v['id']]);print('LOCKED ON IS',chosen['id'],scores,flush=True)
 for sym in P['heldoutAssets']:
  d,fp=base.data(sym);datasets[sym]=d;fps.append(fp);checks+=causal_test(d,sym)
 boot=[];gates={};holdout={}
 for sym,d in datasets.items():
  for label,start,end,fee in [('VALIDATION',SPLIT,RECENT,.001),('RECENT',RECENT,base.a.END_UTC,.001),('OOS_REVIEW',SPLIT,base.a.END_UTC,.001),('STRESS',SPLIT,base.a.END_UTC,.002)]:
   result=run(d,chosen,start,end,fee);rows.append(base.a.outrow(sym,label,chosen['id'],result))
   if label=='OOS_REVIEW':boot.append({'symbol':sym,**base.bootstrap(result['trades'])})
   original=base.a.run_engine(d,replace(base.a.Params(),spot_only=True,fee=fee),start,end);rows.append(base.a.outrow(sym,label,'PCS_REFERENCE',original))
  print('TESTED',sym,flush=True)
 frame=pd.DataFrame(rows)
 def one(s,w):return frame[(frame.symbol==s)&(frame.window==w)&(frame.experiment==chosen['id'])].iloc[0]
 for s in P['trainingAssets']:
  o=one(s,'OOS_REVIEW');r=one(s,'RECENT');c=one(s,'STRESS')
  gates[s]={'originalPerformance':bool(o.CAGR>=.15 and o.MaxDD<=.12 and o.PF>=1.5),'recent':bool(r.CAGR>=.10 and r.MaxDD<=.15 and r.PF>=1.2 and r.trades>=20),'costStress':bool(c.CAGR>=.08 and c.PF>=1.2)}
 for s in P['heldoutAssets']:
  r=one(s,'OOS_REVIEW');holdout[s]=bool(r.CAGR>0 and r.PF>=1.2 and r.MaxDD<=.20 and r.trades>=20)
 eligible=all(all(x.values()) for x in gates.values()) and sum(holdout.values())>=3
 result={'completed':True,'generatedAt':base.a.NOW_UTC.isoformat(),'protocol':P,'protocolSha256':hashlib.sha256(PATH.read_bytes()).hexdigest(),'selectedOnIS':chosen['id'],'scores':scores,'gates':gates,'heldoutPass':holdout,'eligibleForPromotion':eligible,'causality':checks,'bootstrap':boot,'fingerprints':fps,'rows':json.loads(frame.to_json(orient='records')),'decision':'CANDIDATO RETROSPECTIVO' if eligible else 'HIPÓTESIS NO APROBADA; NO SE MODIFICA PCS'}
 frame.to_csv(OUT/'results.csv',index=False);(OUT/'summary.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,allow_nan=False));(OUT/'PROTOCOL.json').write_text(PATH.read_text())
 print(json.dumps({'chosen':chosen['id'],'eligible':eligible,'gates':gates,'heldout':holdout}),flush=True)
if __name__=='__main__':main()
