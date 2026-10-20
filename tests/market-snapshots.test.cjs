const test=require('node:test'),assert=require('node:assert/strict'),D=require('../tl-data.js'),
 Spot=require('../desk-spot-quote.js'),E=require('../tl-engine.js');
const H4=14400000,DAY=86400000,now=Date.UTC(2026,9,20,20),last4=now-H4;
const mkBars=(ms,n,last)=>Array.from({length:n},(_,i)=>({t:last-(n-1-i)*ms,o:100+i*.01,h:101+i*.01,
 l:99+i*.01,c:100.5+i*.01,v:1+i%3}));
test('static closed candles cannot bypass source, recency and coverage invariants',()=>{
 const symbol='BTCUSDT',data={source:'Binance Spot data-api.binance.vision',
 symbol,period:'4h',lastCandle:last4,bars:mkBars(H4,1400,last4)};
 const s=D.snapshotToHistory(data,symbol,'4h',now-180*DAY,now);
 assert(s&&s.bars.length>1000);
 assert.equal(s.until,last4);assert(s.bars.every(b=>b.t+H4<=now));assert.equal(s.gaps,0);
 assert.equal(D.snapshotToHistory({...data,source:'Random feed'},symbol,'4h',now-180*DAY,now),null);
 assert.equal(D.snapshotToHistory({...data,lastCandle:last4-H4},symbol,'4h',now-180*DAY,now),null);
 assert.equal(D.snapshotToHistory(data,symbol,'4h',now-300*DAY,now),null);
 assert.equal(D.snapshotToHistory({...data,bars:mkBars(H4,1400,last4+H4)},symbol,'4h',now-180*DAY,now),null);
});
test('browser fallback quote requires live Binance order book and lot rules',()=>{
 const symbol='BTCUSDT',info={symbols:[{symbol,quoteAsset:'USDT',baseAsset:'BTC',status:'TRADING',
 permissionSets:[['SPOT']],filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'},
 {filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.001',maxQty:'10'},
 {filterType:'MIN_NOTIONAL',minNotional:'5'}]}]},
 book={bidPrice:'100',askPrice:'101'},day={quoteVolume:'120000000'},
 depth={asks:[['101','1000']],bids:[['100','1000']]};
 const q=Spot.normalize(book,day,info,depth,symbol,now);
 assert.equal(q.filters.trading,true);assert(q.depthAskUSDT>=101000);assert.equal(q.asOf,now);
 assert.throws(()=>Spot.normalize(book,day,info,{asks:[],bids:[]},symbol,now),/verificable/);
 assert.throws(()=>Spot.normalize({...book,bidPrice:'105'},day,info,depth,symbol,now),/verificable/);
});
