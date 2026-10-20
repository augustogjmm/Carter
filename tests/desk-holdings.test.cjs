const test=require('node:test'),a=require('node:assert/strict'),H=require('../desk-holdings.js');
const pos=(quantity)=>[{symbol:'BTCUSDT',quantity,basis:quantity*100,avgPrice:100}];
const order=(id,stop,target)=>({id,symbol:'BTCUSDT',filledQty:1,ticket:{stop,target}});
const buy=(id,qty,at)=>({kind:'BUY',symbol:'BTCUSDT',orderId:id,quantity:qty,at});
const sell=(qty,at)=>({kind:'SELL',symbol:'BTCUSDT',quantity:qty,at});
test('fully closed historical operation cannot contaminate levels of reopened holding',()=>{
 const o=[order('OLD',75,115),order('NEW',91,135)];
 const f=[buy('OLD',1,1),sell(1,2),buy('NEW',.8,3)];
 const r=H.current('BTCUSDT',pos(.8),o,f);
 a.equal(r.stop,91);a.equal(r.target,135);a.equal(r.levelSource,'CURRENT_CYCLE');
});
test('mixed new orders with ambiguous exit references suppress invented stop and target',()=>{
 const r=H.current('BTCUSDT',pos(1.5),[order('A',80,120),order('B',90,130)],
 [buy('A',1,1),buy('B',1,2),sell(.5,3)]);
 a.equal(r.stop,null);a.equal(r.target,null);a.equal(r.levelsVerified,false);
});
test('single order partial exit preserves its reference levels',()=>{
 const r=H.current('BTCUSDT',pos(.6),[order('A',95,120)],[buy('A',1,1),sell(.4,2)]);
 a.equal(r.stop,95);a.equal(r.target,120);a.equal(r.levelsVerified,true);
});
test('no position or inconsistent fill history fails closed',()=>{
 a.equal(H.current('BTCUSDT',pos(0),[],[]),null);
 const r=H.current('BTCUSDT',pos(1),[order('A',90,110)],[buy('A',.9,1)]);
 a.equal(r.stop,null);a.equal(r.target,null);
});