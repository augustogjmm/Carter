import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {onRequest as market} from '../functions/api/market.js';
import {onRequest as top50} from '../functions/api/top50.js';
import {onRequest as quote,normalize} from '../functions/api/desk-quote.js';
import {onRequest as health} from '../functions/api/health.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {build}=require('../scripts/build-cloudflare.cjs');
const req=(pathname,method='GET')=>({request:new Request('https://carter.pages.dev'+pathname,{method})});
function withFetch(fn,run){const original=globalThis.fetch;globalThis.fetch=fn;
 return Promise.resolve().then(run).finally(()=>{globalThis.fetch=original;});}
const apiData={
 book:{bidPrice:'100',askPrice:'100.2'},
 day:{quoteVolume:'120000000'},
 info:{symbols:[{symbol:'BTCUSDT',status:'TRADING',isSpotTradingAllowed:true,baseAsset:'BTC',quoteAsset:'USDT',
  permissionSets:[['SPOT']],filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'},
  {filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.001',maxQty:'3000'},
  {filterType:'NOTIONAL',minNotional:'5'}]}]},
 depth:{asks:[['100.2','10000']],bids:[['100','10000']]}
};
test('Cloudflare build is self-contained and excludes private state, Supabase and dev files',()=>{
 const summary=build(root),dist=path.join(root,'cloudflare-dist');
 assert(summary.files>20);
 for(const x of ['desk.html','desk-chart.js','pcs.html','trading-latino.html','index.html','tl-data.js',
  'data/radar.json','data/tl-radar.json','data/desk-opportunities.json','data/paper/summary.json','_routes.json','_redirects'])
  assert(fs.existsSync(path.join(dist,x)),x);
 for(const x of ['data/paper/state.json','desk-cloud-ui.js','desk-cloud.js','api/desk-quote.js',
  '.git/config','vercel.json','functions/api/market.js','research/paper_run.py'])
  assert(!fs.existsSync(path.join(dist,x)),x);
 const html=fs.readFileSync(path.join(dist,'desk.html'),'utf8');
 assert(!html.includes('COPIA PRIVADA · OPT-IN'));
 assert(!html.includes('desk-cloud-ui.js'));
 assert(!html.includes('supabase.co'));
 const routes=JSON.parse(fs.readFileSync(path.join(dist,'_routes.json'),'utf8'));
 assert.deepEqual(routes.include,['/api/*']);
 assert.deepEqual(routes.exclude,[]);
 assert.match(fs.readFileSync(path.join(dist,'_redirects'),'utf8'),/^\/ \/desk\.html 302/m);
});
test('Cloudflare health is GET only and does not need paid resources',async()=>{
 const good=await health(req('/api/health'));assert.equal(good.status,200);
 assert.equal((await good.json()).service,'PUBLIC_MARKET_DATA_ONLY');
 assert.equal((await health(req('/api/health','POST'))).status,405);
});
test('Cloudflare market proxy rejects arbitrary hosts, bad symbols and mutating requests',async()=>{
 assert.equal((await market(req('/api/market?path=%2F%2Fevil.example.com'))).status,400);
 const invalid='/api/market?path=%2Fapi%2Fv3%2Fklines&query=symbol%3DHI%26interval%3D4h%26limit%3D1000';
 assert.equal((await market(req(invalid))).status,400);
 assert.equal((await market(req('/api/market','POST'))).status,405);
 const ok='/api/market?path=%2Fapi%2Fv3%2Fklines&query=symbol%3DBTCUSDT%26interval%3D4h%26limit%3D1000';
 await withFetch(async url=>{
  assert(String(url).startsWith('https://data-api.binance.vision/api/v3/klines'));
  return new Response(JSON.stringify([[1,2,3,4,5,6]]),{status:200});
 },async()=>{const resp=await market(req(ok));const body=await resp.text();assert.equal(resp.status,200,body);assert.deepEqual(JSON.parse(body),[[1,2,3,4,5,6]]);});
});
test('Cloudflare Top50 proxy strictly validates complete ranking',async()=>{
 const rows=Array.from({length:50},(_,i)=>({
  id:'coin-'+i,symbol:'c'+i,name:'Coin '+i,market_cap_rank:i+1,
  market_cap:50-i,current_price:100,price_change_percentage_24h:1}));
 const last=Math.floor(Date.now()/14400000)*14400000-14400000;
 const snap={items:rows.map(x=>({id:x.id,symbol:x.symbol.toUpperCase(),name:x.name,
 rank:x.market_cap_rank,marketCap:x.market_cap,price:x.current_price,change:x.price_change_percentage_24h})),
 lastCandle:last,marketAt:new Date().toISOString(),generatedAt:new Date().toISOString()};
 const env={ASSETS:{fetch:async()=>Response.json(snap)}};
 const r=await top50({...req('/api/top50'),env});assert.equal(r.status,200);
 const x=await r.json();assert.equal(x.items.length,50);assert.equal(x.items[0].symbol,'C0');
 const stale=await top50({...req('/api/top50'),env:{ASSETS:{fetch:async()=>Response.json({...snap,lastCandle:last-14400000})}}});
 assert.equal(stale.status,503);
 assert.equal((await top50(req('/api/top50','POST'))).status,405);
});
test('Cloudflare quote preserves Binance filters, live bid/ask and real near-book depth',async()=>{
 const x=normalize(apiData.book,apiData.day,apiData.info,apiData.depth);
 assert.equal(x.symbol,'BTCUSDT');assert.equal(x.filters.tickSize,0.01);
 assert(x.depthAskUSDT>1_000_000);
 await withFetch(async url=>{
  const u=String(url);if(u.includes('bookTicker'))return Response.json(apiData.book);
  if(u.includes('24hr'))return Response.json(apiData.day);
  if(u.includes('exchangeInfo'))return Response.json(apiData.info);
  if(u.includes('/depth'))return Response.json(apiData.depth);
  throw Error('unexpected endpoint '+url);
 },async()=>{
  const r=await quote(req('/api/desk-quote?symbol=BTCUSDT'));assert.equal(r.status,200);
  const result=await r.json();assert.equal(result.ask,100.2);
  assert(result.asOf>0);assert.equal(result.filters.trading,true);
 });
 assert.equal((await quote(req('/api/desk-quote?symbol=BTC%2FUSDT'))).status,400);
 assert.equal((await quote(req('/api/desk-quote','POST'))).status,405);
});
