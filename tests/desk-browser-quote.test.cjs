const test=require("node:test"),a=require("node:assert/strict"),Q=require("../desk-browser-quote.js");
const info={symbols:[{symbol:"BTCUSDT",status:"TRADING",isSpotTradingAllowed:true,quoteAsset:"USDT",baseAsset:"BTC",
 filters:[{filterType:"PRICE_FILTER",tickSize:"0.01"},
 {filterType:"LOT_SIZE",stepSize:"0.00001",minQty:"0.00001",maxQty:"1000"},
 {filterType:"NOTIONAL",minNotional:"5"}]}]};
test("browser fallback preserves real Binance source and exact public order book",async()=>{
 const get=async url=>{
  const str=String(url);
  return Response.json(str.includes("bookTicker")?{bidPrice:"100",askPrice:"100.1"}:
   str.includes("24hr")?{quoteVolume:"900000000"}:
   str.includes("exchangeInfo")?info:
   {asks:[["100.1","20"]],bids:[["100","30"]]});
 };
 const r=await Q.quote("BTCUSDT",{fetcher:get,timeout:50});
 a.equal(r.venue,"BINANCE_SPOT");a.equal(r.ask,100.1);a.equal(r.filters.tickSize,.01);
 a.equal(r.depthBidUSDT,3000);a.equal(r.filters.trading,true);
});
test("browser quote rejects unverified venue and incomplete depth",()=>{
 a.throws(()=>Q.normalize({bidPrice:"1",askPrice:"1.1"},{quoteVolume:"123"},info,{asks:[],bids:null}),/válidos/);
 a.throws(()=>Q.normalize({bidPrice:"1",askPrice:"1.1"},{quoteVolume:"123"},{symbols:[{...info.symbols[0],quoteAsset:"USD"}]},{asks:[],bids:[]}),/válidos/);
});