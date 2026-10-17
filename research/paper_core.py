"""Pure paper ledger. No exchange credentials or order execution."""
import math
BAR=14400000
FEE=.001

def account(last_closed,capital=1000.):
 return {'initial':capital,'cash':capital,'position':None,'lastClosed':last_closed,'lastEntryTime':None,'realized':0.,'closed':[]}

def step(state,bar,signal,signal_atr,atr,rule,events,recorded_at,entry_only=False,down=False):
 t=int(bar['t'])
 if not entry_only and t<=state['lastClosed']:return
 def event(kind,**values):events.append({'kind':kind,'time':t,'recordedAt':recorded_at,'reconstructed':recorded_at-t>BAR,'model':rule['id'],**values})
 def sell(qty,price,reason):
  pos=state['position'];pnl=qty*(price-pos['entry'])-qty*pos['entry']*FEE-qty*price*FEE
  state['cash']+=qty*price*(1-FEE);state['realized']+=pnl;pos['qty']-=qty;pos['pnl']+=pnl
  event('EXIT',price=price,qty=qty,reason=reason,pnl=pnl,entryTime=pos['entryTime'])
  if pos['qty']<1e-10:
   state['closed'].append({'entryTime':pos['entryTime'],'exitTime':t,'pnl':pos['pnl'],'returnOnEntryEquity':pos['pnl']/pos['entryEquity']});state['position']=None
 if state['position'] and rule.get('cross') and down:sell(state['position']['qty'],bar['o'],'EMA_CROSS')
 if not state['position'] and signal and state['lastEntryTime']!=t and math.isfinite(signal_atr) and signal_atr>0:
  entry=bar['o'];dist=rule['stopA']*signal_atr;qty=min(.01*state['cash']/dist,state['cash']/(entry*(1+FEE)))
  if qty>0:
   eq=state['cash'];state['cash']-=qty*entry*(1+FEE)
   state['position']={'entryTime':t,'entry':entry,'entryEquity':eq,'qty':qty,'originalQty':qty,'stop':entry-dist,'tp1':entry+dist,'tpDone':False,'pnl':0.}
   state['lastEntryTime']=t;event('ENTRY',price=entry,qty=qty,stop=entry-dist,tp1=None if rule['no_tp1'] else entry+dist)
 if entry_only:return
 pos=state['position']
 if pos:
  if bar['l']<=pos['stop']:sell(pos['qty'],min(bar['o'],pos['stop']),'STOP')
  else:
   if not rule['no_tp1'] and not pos['tpDone'] and bar['h']>=pos['tp1']:
    sell(pos['originalQty']*.5,pos['tp1'],'TP1');pos=state['position']
    if pos:pos['tpDone']=True;pos['stop']=max(pos['stop'],pos['entry'])
   pos=state['position']
   if pos and not rule['no_time'] and (t-pos['entryTime'])//BAR>=300:sell(pos['qty'],bar['c'],'TIME')
  pos=state['position']
  if pos and not rule.get('cross') and (rule['no_tp1'] or pos['tpDone']) and math.isfinite(atr):pos['stop']=max(pos['stop'],bar['c']-rule['trail']*atr)
 state['lastClosed']=t

def mark(state,price):
 pos=state['position'];equity=state['cash']+(pos['qty']*price if pos else 0.)
 return {'initial':state['initial'],'equity':equity,'return':equity/state['initial']-1,'realized':state['realized'],'open':bool(pos),'position':pos,'closed':len(state['closed']),'wins':sum(x['pnl']>0 for x in state['closed']),'winRate':sum(x['pnl']>0 for x in state['closed'])/len(state['closed']) if state['closed'] else None}
