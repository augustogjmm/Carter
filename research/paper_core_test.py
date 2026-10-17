import unittest
from paper_core import account,step,mark,BAR

RULE={'id':'PCS','stopA':1.5,'trail':2.5,'no_tp1':False,'no_time':False}
def bar(t,o=100,h=101,l=99,c=100):return dict(t=t,o=o,h=h,l=l,c=c)
class PaperTests(unittest.TestCase):
 def test_stop_priority_cash_and_idempotency(self):
  state=account(-BAR);events=[];step(state,bar(0,h=105,l=95),True,1,1,RULE,events,BAR)
  self.assertEqual([x['kind'] for x in events],['ENTRY','EXIT']);self.assertEqual(events[-1]['reason'],'STOP')
  self.assertAlmostEqual(mark(state,100)['equity']-1000,sum(x.get('pnl',0) for x in events))
  step(state,bar(0,h=105,l=95),True,1,1,RULE,events,BAR);self.assertEqual(len(events),2)
 def test_next_open_persists_without_duplicate_or_forced_terminal(self):
  state=account(-BAR);events=[]
  step(state,bar(0),True,1,1,RULE,events,60000,entry_only=True)
  step(state,bar(0),True,1,1,RULE,events,120000,entry_only=True)
  self.assertEqual(len(events),1);self.assertTrue(mark(state,100)['open'])
  step(state,bar(0,h=102,l=99,c=101),True,1,1,RULE,events,BAR)
  self.assertEqual(events[-1]['reason'],'TP1');self.assertAlmostEqual(state['position']['stop'],100)
  step(state,bar(BAR,o=98,h=101,l=97),False,1,1,RULE,events,2*BAR)
  self.assertEqual(events[-1]['price'],98);self.assertEqual(len(state['closed']),1)
  self.assertAlmostEqual(state['cash']-1000,state['realized'])
 def test_contado_limit_includes_fee(self):
  state=account(-BAR);events=[];step(state,bar(0),True,.001,1,RULE,events,0,entry_only=True)
  self.assertGreaterEqual(state['cash'],-1e-8);self.assertLessEqual(state['position']['qty']*100*1.001,1000+1e-8)
if __name__=='__main__':unittest.main()
