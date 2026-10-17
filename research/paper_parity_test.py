"""Verify all paper models against independent backtests before final liquidation."""
import unittest
import numpy as np
import pandas as pd
import review_suite as r
from paper_core import account,step,mark,BAR

class Parity(unittest.TestCase):
 def test_all_models_match_independent_cash_curves(self):
  rng=np.random.default_rng(1017);n=1600;t=np.arange(n)*BAR+r.a.ts_ms('2020-01-01')
  close=100*np.exp(np.cumsum(rng.normal(.0005,.012,n)));op=np.r_[close[0],close[:-1]]
  d=r.a.indicators(pd.DataFrame({'t':t,'o':op,'h':np.maximum(op,close)*1.012,'l':np.minimum(op,close)*.988,'c':close,'v':rng.uniform(100,250,n)}))
  for model in r.MODELS:
   expected=r.run(d,model,pd.Timestamp('2020-01-01',tz='UTC'),pd.to_datetime(t[-1]+BAR,unit='ms',utc=True))
   q,p=r.prepare(d,model);sig=r.signals(d,model);down=((d.ema50<d.ema200)&(d.ema50.shift(1)>=d.ema200.shift(1))).to_numpy()
   rule={'id':model,'stopA':p.stopA,'trail':p.trail,'no_tp1':p.no_tp1,'no_time':p.no_time,'cross':model=='EMA50_200'}
   acc=account(int(t[0]-BAR),capital=1.);events=[]
   for k in range(n-1):
    b={field:float(d.iloc[k][field]) for field in ['t','o','h','l','c']}
    step(acc,b,bool(sig[k-1]) if k else False,float(d.atr.iloc[k-1]) if k else float('nan'),float(d.atr.iloc[k]),rule,events,int(t[k]+BAR),down=bool(down[k-1]) if k else False)
    self.assertAlmostEqual(mark(acc,float(d.c.iloc[k]))['equity'],expected['curve'][k],places=9,msg=model+' at '+str(k))
if __name__=='__main__':unittest.main()
