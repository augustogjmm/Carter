const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../desk-paper.js'),S=require('../desk-scenario.js'),E=require('../tl-engine.js');
test('paper read separates hypothetical results from personal holdings',()=>{
 const now=Date.UTC(2026,9,20,16);
 const x=P.inspect({generatedAt:new Date(now-60000).toISOString(),mode:'PAPER_ONLY',
 accounts:[{symbol:'BTCUSDT',model:'LATINO',open:false,equity:1000,return:0,closed:0,markAt:now},
 {symbol:'SOLUSDT',model:'CARTER_RAW',open:true,position:{entry:101,qty:2,stop:98,tp1:104},markPrice:103,equity:1004,return:.004,closed:0,markAt:now},
 {symbol:'BTCUSDT',model:'PCS',open:true,position:{entry:100},markPrice:100,equity:1000,return:0,closed:0,markAt:now}],
 events:[{model:'CARTER_RAW',symbol:'SOLUSDT',kind:'ENTRY',price:101,time:now-1000,recordedAt:now}]},now);
 assert.equal(x.active,1);assert.equal(x.accounts.length,2);assert.equal(x.events.length,1);
 assert.equal(x.accounts[0].model,'CARTER_RAW');
 assert.match(x.disclosure,/TEORICAS/);
 assert.equal(P.inspect({generatedAt:new Date(now-30*3600000).toISOString(),mode:'PAPER_ONLY',accounts:[],events:[]},now).stale,true);
 assert.throws(()=>P.inspect({mode:'REAL',accounts:[],events:[]},now),/incompatible/);
});
const H4=14400000,DAY=86400000,now=Date.UTC(2026,9,20,17);
const t4=Math.floor(now/H4)*H4;
const bars=Array.from({length:250},(_,i)=>({t:t4-(250-i)*H4,o:100,h:101,l:99,c:100,v:5000}));
const d0=Math.floor(now/DAY)*DAY;
const daily=Array.from({length:250},(_,i)=>({t:d0-(250-i)*DAY,o:110,h:111,l:109,c:110,v:5000}));
const eng={indicators(b,p){const n=b.length,arr=v=>Array(n).fill(v);return{valid:arr(true),
 ema10:arr(p==='1d'?120:102),ema55:arr(p==='1d'?100:101),momentum:arr(3),atr:arr(2)};}};
const quote={filters:{tickSize:.01}};
test('conditional scenario shows valid future trigger but never a buy now',()=>{
 const p=S.project({bars4h:bars,bars1d:daily,engine:eng,quote,now,profile:{poc:100,val:98,vah:110,quality:'estimated'}});
 assert.equal(p.status,'ESCENARIO_CONDICIONAL');
 assert.equal(p.canBuyNow,false);
 assert(p.trigger>Math.max(...bars.slice(-4).map(x=>x.h)));
 assert(p.stop<p.trigger);assert(p.dailyKnownAt<=p.signalAt);
 assert.equal(p.expiresAt,p.signalAt+H4);
});
test('conditional scenario rejects stale bars and bearish daily without lookahead',()=>{
 const stale=S.project({bars4h:bars.slice(0,-1),bars1d:daily,engine:eng,quote,now});assert.equal(stale.status,'SIN_DATOS');
 const bearish={indicators(b,p){const out=eng.indicators(b,p);if(p==='1d')out.ema10.fill(90);return out;}};
 assert.equal(S.project({bars4h:bars,bars1d:daily,engine:bearish,quote,now}).status,'NO_LONG');
 assert.equal(S.project({bars4h:bars,bars1d:daily,engine:eng,quote:{},now}).canBuyNow,false);
});