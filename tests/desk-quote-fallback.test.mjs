import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/desk-quote.js';
const original=globalThis.fetch;
test('same-exchange quote 451 falls back to clearly NON-EXECUTABLE OKX',async()=>{
 globalThis.fetch=async url=>{
  const s=String(url);
  if(s.includes('binance'))return Response.json({msg:'restricted'},{status:451});
  if(s.includes('/market/ticker'))return Response.json({code:'0',data:[{
    bidPx:'100',askPx:'100.1',volCcy24h:'170000000'}]});
  if(s.includes('/market/books'))return Response.json({code:'0',data:[{
    asks:[['100.1','20']],bids:[['100','40']]}]});
  if(s.includes('/public/instruments'))return Response.json({code:'0',data:[{
    instId:'BTC-USDT',instType:'SPOT',state:'live',tickSz:'0.01',
    lotSz:'0.0001',minSz:'0.0001',baseCcy:'BTC',quoteCcy:'USDT'}]});
  throw Error('Unexpected provider');
 };
 try{
  const response=await onRequest({request:new Request('https://test.pages.dev/api/desk-quote?symbol=BTCUSDT')});
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.indicative,true);
  assert.equal(data.venue,'OKX_SPOT');assert.equal(data.filters.trading,false);
  assert.equal(data.bid,100);assert.equal(data.depthBidUSDT,4000);
 }finally{globalThis.fetch=original;}
});
