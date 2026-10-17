const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const BAR=14400000;
function engine(extra={}){const c={window:{},URL,URLSearchParams,AbortSignal,...extra};vm.createContext(c);vm.runInContext(fs.readFileSync('pcs.js','utf8'),c);vm.runInContext(fs.readFileSync('scanner.js','utf8'),c);return {e:c.window.PCSEngine,radar:c.window.PCSScannerCore};}
function bars(n=400){const end=Math.floor(Date.now()/BAR)*BAR-BAR;return Array.from({length:n},(_,i)=>({t:end-(n-1-i)*BAR,o:100,h:101,l:99,c:100,v:100}));}
function simulation(b){return {sig:b.map(()=>({A:false,B:false})),atr:b.map(()=>1)};}
test('signal uses no future candle and starts as soon as indicators are warm',()=>{
 const {e}=engine(),b=bars();for(let i=0;i<b.length;i++){const p=100+i*.1+Math.sin(i/10);Object.assign(b[i],{o:p-.2,h:p+1,l:p-1,c:p+.2});}
 const full=e.indicators(b);for(const i of [199,200,250,350]){const cut=e.indicators(b.slice(0,i+1));assert.deepEqual(full.sig[i],cut.sig[i]);assert.equal(full.ema200[i],cut.ema200[i]);assert.equal(full.adx[i],cut.adx[i]);}
});
test('next-open execution; stop wins over TP; fees reconcile',()=>{
 const {e}=engine(),b=bars(),s=simulation(b);s.sig[250].A=true;Object.assign(b[251],{o:101,h:110,l:90,c:100});
 const r=e.backtest(b,s);assert.equal(r.legs.length,1);assert.equal(r.legs[0].entryIdx,251);assert.equal(r.legs[0].why,'SL');assert.equal(r.ops[0].entryPrice,101);assert.ok(Math.abs(r.ops[0].pnl-(r.curve.at(-1).equity-1000))<1e-8);
});
test('TP1 halves once; BE takes effect next candle; gap uses worse open',()=>{
 const {e}=engine(),b=bars(),s=simulation(b);s.sig[250].B=true;
 Object.assign(b[251],{o:100,h:102,l:99,c:101});Object.assign(b[252],{o:98,h:101,l:97,c:100});
 const r=e.backtest(b,s);assert.equal(r.legs.length,2);assert.equal(r.legs[0].why,'TP1');assert.equal(r.legs[1].why,'SL');assert.equal(r.legs[1].exitIdx,252);assert.equal(r.legs[0].qty,r.legs[1].qty);assert.equal(r.ops[0].exitPrice,98);assert.ok(Math.abs(r.ops[0].pnl-(r.curve.at(-1).equity-1000))<1e-8);
});
test('trailing never moves backwards and cannot execute in its calculation candle',()=>{
 const {e}=engine(),b=bars(),s=simulation(b);s.sig[250].A=true;
 Object.assign(b[251],{o:100,h:105,l:99,c:104});Object.assign(b[252],{o:104,h:106,l:102,c:104});Object.assign(b[253],{o:104,h:105,l:100,c:101});
 const r=e.backtest(b,s);assert.equal(r.legs[1].exitIdx,253);assert.equal(r.ops[0].exitPrice,101.5);
});
test('1x ceiling includes entry fee; only one concurrent position',()=>{
 const {e}=engine(),b=bars(),s=simulation(b);s.atr.fill(.01);s.sig[250].A=true;s.sig[251].A=true;for(let k=251;k<b.length;k++)Object.assign(b[k],{o:100,h:100.001,l:99.999,c:100});
 const r=e.backtest(b,s,1000,1);assert.ok(r.pos);assert.ok(r.pos.orig*100*1.001<=1000+1e-8);assert.equal(r.pos.start,251);assert.equal(r.legs.length,0);
});
test('radar refuses old closes, internal gaps and invalid OHLCV',()=>{
 const {e,radar}=engine(),b=bars();assert.equal(radar.classify(b).signal,false);
 assert.throws(()=>radar.classify(b.slice(0,-1)),/sincronizada/);assert.throws(()=>radar.classify(b.filter((_,i)=>i!==300)),/Hueco/);
 assert.equal(e.dedup([{...b[0],v:-1}]).length,0);assert.equal(e.dedup([{...b[0],c:102}]).length,0);
});
test('ranking retains exactly 50, disallows duplicates and keeps excluded assets',()=>{
 const {radar}=engine();const rows=Array.from({length:50},(_,i)=>({id:'asset'+i,symbol:'A'+i,name:'Asset '+i,rank:i+1,price:1}));
 assert.equal(radar.normalizeCoins(rows).length,50);assert.throws(()=>radar.normalizeCoins(rows.slice(1)),/50/);rows[49].rank=1;assert.throws(()=>radar.normalizeCoins(rows),/ambiguo/);
 assert.equal(radar.unscannable({id:'tether',symbol:'USDT',name:'Tether'},new Set(),new Set()).status,'excluded');
 assert.equal(radar.unscannable({id:'unknown',symbol:'TEST',name:'Test'},new Set(),new Set()).status,'missing');
});
test('historical downloads coalesce per symbol and closed slot',async()=>{
 let calls=0;const end=Math.floor(Date.now()/BAR)*BAR-BAR,b=bars(400),rows=b.map(x=>[x.t,x.o,x.h,x.l,x.c,x.v]);
 const {e}=engine({fetch:async()=>{calls++;return {ok:true,json:async()=>rows};}});
 const [a,c]=await Promise.all([e.download('BTCUSDT'),e.download('BTCUSDT')]);assert.equal(calls,1);assert.equal(a,c);assert.equal(a.bars.at(-1).t,end);
});
test('download failure invalidates cache and can be retried',async()=>{
 let failing=true;const rows=bars(400).map(x=>[x.t,x.o,x.h,x.l,x.c,x.v]);const {e}=engine({fetch:async()=>{if(failing)throw Error('offline');return {ok:true,json:async()=>rows};}});
 await assert.rejects(e.download('BTCUSDT'),/Sin datos/);failing=false;assert.equal((await e.download('BTCUSDT')).bars.length,400);
});
test('proxy rejects arbitrary endpoints and symbols before fetching',async()=>{
 const code=fs.readFileSync('api/market.js','utf8').replace('export default async function handler','async function handler');const ctx={URLSearchParams,AbortSignal};vm.createContext(ctx);vm.runInContext(code+';this.handler=handler',ctx);
 for(const query of [{path:'/api/v3/order'},{path:'/api/v3/klines',query:'symbol=BTCUSDT&interval=1m&limit=1000'},{path:'/api/v3/exchangeInfo',query:'host=bad'}]){
  let status;const res={status(n){status=n;return this;},json(){}};await ctx.handler({method:'GET',query},res);assert.equal(status,400);
 }
});
