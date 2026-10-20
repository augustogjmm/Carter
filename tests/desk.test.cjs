const test=require('node:test'),a=require('node:assert/strict');
const D=require('../desk-engine.js'),J=require('../desk-ledger.js');
const H4=14400000,DAY=86400000;
const now=Date.UTC(2026,9,20,15,0),close=Math.floor(now/H4)*H4;
function bars(ms,end,n=250){
 return Array.from({length:n},(_,i)=>({t:end-(n-i)*ms,o:100,h:101,l:99,c:100,v:1000}));
}
const four=bars(H4,close);
const day=bars(DAY,Math.floor(close/DAY)*DAY);day.forEach(b=>{b.o=110;b.h=111;b.l=109;b.c=110;});
const profile={poc:100,val:97,vah:108,quality:'PERFIL ESTIMADO OHLCV'};
const q={bid:100.15,ask:100.2,asOf:now,quoteVolume24h:30000000,
 filters:{trading:true,tickSize:.01,stepSize:.001,minQty:.001,minNotional:5,maxQty:100000}};
const fake={indicators(bb,p){
 const n=bb.length,ary=x=>Array(n).fill(x),v=ary(true),long=ary(false),early=ary(false);
 if(p==='4h')long[n-1]=true;
 return{valid:v,long,parts:ary({early:false}),ema10:ary(p==='1d'?110:100),
  ema55:ary(p==='1d'?105:98),momentum:ary(.5),adx:ary(25),atr:ary(2)};
}};
const args=()=>({bars4h:four,bars1d:day,quote:q,profile,capital:1000,now,engine:fake});
test('daily last closed known_at <= 4h signal close',()=>{
 const known=D.knownDaily([...day,{t:Math.floor(close/DAY)*DAY,o:100,h:101,l:99,c:100}],close);
 a(known.every(x=>x.t+DAY<=close));
});
test('technically executable ticket includes all economics and source label',()=>{
 const r=D.decide(args());a.equal(r.status,'CANDIDATO',r.reason);
 a.equal(r.code,'TECHNICALLY_EXECUTABLE');
 a(r.ticket.entry>=q.ask);a(r.ticket.stop<r.ticket.entry);
 a(r.ticket.target>r.ticket.entry);
 a(r.ticket.netR>=1.5);a(r.ticket.riskPct<=.01+1e-10);
 a(r.ticket.notional<=200.001);
 a.equal(r.ticket.provenance,'CARTER_HIPOTESIS');
 a.match(r.ticket.audit,/NO DEMOSTRADA/);
});
test('stale market, chase, bad spread, risk budget and insufficient history fail closed',()=>{
 a.equal(D.decide({...args(),quote:{...q,asOf:now-120000}}).status,'NO_OPERABLE');
 a.equal(D.decide({...args(),quote:{...q,bid:98}}).status,'NO_OPERABLE');
 a.equal(D.decide({...args(),quote:{...q,bid:105,ask:105.2}}).status,'NO_OPERABLE');
 a.equal(D.decide({...args(),openRisk:10}).status,'NO_OPERABLE');
 a.equal(D.decide({...args(),portfolioExposure:1000}).status,'NO_OPERABLE');
 a.equal(D.decide({...args(),bars1d:day.slice(-100)}).status,'SIN_DATOS');
 a.equal(D.decide({...args(),bars4h:four.slice(0,-1)}).status,'SIN_DATOS');
 a.equal(D.decide({...args(),profile:null}).status,'NO_OPERABLE');
});
test('signal never overrides down daily context or absent 4h trigger',()=>{
 const f={indicators(bb,p){const i=fake.indicators(bb,p);if(p==='1d')i.ema10.fill(90);return i;}};
 a.equal(D.decide({...args(),engine:f}).status,'ESPERAR');
 const g={indicators(bb,p){const i=fake.indicators(bb,p);if(p==='4h')i.long.fill(false);return i;}};
 a.equal(D.decide({...args(),engine:g}).status,'ESPERAR');
});
test('journal: preparing/submitting never creates a position; fills and partial sales do',()=>{
 let str=null;const store={getItem:()=>str,setItem:(k,v)=>{str=v;}};
 const j=J.create(store),time=Date.now();
 const ticket={type:'LIMIT',quantity:2,entry:100,validFrom:time-1000,expiresAt:time+600000,signalAt:time-100, strategy:'TEST'};
 const id=j.prepared(ticket,'BTCUSDT');
 a.equal(j.positions().length,0);j.setSubmitted(id);
 a.equal(j.positions().length,0);
 j.buy({orderId:id,quantity:1,price:100,fee:.1,fillId:'test-1'});
 a.equal(j.orders()[0].status,'PARTIAL');a.equal(j.positions()[0].quantity,1);
 j.buy({orderId:id,quantity:1,price:102,fee:.1,fillId:'test-2'});
 a.equal(j.orders()[0].status,'FILLED');a.equal(j.positions()[0].avgPrice,101.1);
 j.buy({orderId:id,quantity:1,price:102,fee:.1,fillId:'test-2'});
 a.equal(j.positions()[0].quantity,2);
 j.sell({symbol:'BTCUSDT',quantity:.5,price:110,fee:.05,fillId:'sell-1'});
 const p=j.positions()[0];a.equal(p.quantity,1.5);a(Math.abs(p.realized-4.4)<1e-9);
 a.equal(J.create(store).positions()[0].quantity,1.5);
 a.throws(()=>j.sell({symbol:'BTCUSDT',quantity:4,price:100}),/más cantidad/);
 a.throws(()=>j.buy({orderId:id,quantity:1,price:100}),/cerrada/);
});
test('quote proxy normalization rejects non-USDT and computes filters',()=>{
 const normalize=require('../api/desk-quote.js').normalize;
 const book={bidPrice:'100',askPrice:'100.2'},day={quoteVolume:'30000000'};
 const mk=(quoteAsset)=>({symbols:[{symbol:'BTC'+quoteAsset,baseAsset:'BTC',quoteAsset,
 status:'TRADING',isSpotTradingAllowed:true,permissionSets:[['SPOT']],filters:[
 {filterType:'PRICE_FILTER',tickSize:'.01'},
 {filterType:'LOT_SIZE',stepSize:'.001',minQty:'.001',maxQty:'1000'},
 {filterType:'NOTIONAL',minNotional:'5'}]}]});
 const q=normalize(book,day,mk('USDT'));a.equal(q.filters.tickSize,.01);a.equal(q.filters.trading,true);
 a.throws(()=>normalize(book,day,mk('USDC')),/no válidas/);
});

test('journal refuses malformed persisted state instead of silently destroying it',()=>{
 const bad={getItem:()=>'{broken',setItem:()=>{throw Error('MUST NOT WRITE')}};
 a.throws(()=>J.create(bad),/dañada/);
 const foreign={getItem:()=>JSON.stringify({schema:77,orders:[],fills:[]}),setItem:()=>{throw Error('MUST NOT WRITE')}};
 a.throws(()=>J.create(foreign),/desconocido/);
});
test('unfilled prepared order expires and cannot later be confirmed',()=>{
 let val=null;const store={getItem:()=>val,setItem:(k,v)=>{val=v;}},j=J.create(store);
 const time=Date.now(),id=j.prepared({type:'LIMIT',quantity:1,entry:10,signalAt:time-10000,strategy:'TEST',validFrom:time-10000,expiresAt:time+60000},'BTCUSDT');
 a.equal(j.expire(time+65000),true);
 a.equal(j.orders()[0].status,'EXPIRED');
 a.throws(()=>j.buy({orderId:id,quantity:1,price:10,fee:0}),/cerrada/);
});
