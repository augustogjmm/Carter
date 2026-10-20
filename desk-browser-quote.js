/* Direct browser-side Binance Spot public quote: preserves exchange identity.
 * This is an optional fallback when Cloudflare's edge region is blocked (HTTP 451).
 * Read-only, no credentials, no order endpoint. Never infers an execution from OHLCV.
 */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.CarterBrowserQuote=api;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
function normalize(book,day,info,depth){
 const x=info?.symbols?.[0];if(!x)throw Error("Sin mercado Binance Spot");
 const filtersMap=Object.fromEntries((x.filters||[]).map(x=>[x.filterType,x]));
 const lot=filtersMap.LOT_SIZE||{},notional=filtersMap.NOTIONAL||filtersMap.MIN_NOTIONAL||{};
 const tickSize=Number(filtersMap.PRICE_FILTER?.tickSize),stepSize=Number(lot.stepSize);
 const bid=Number(book.bidPrice),ask=Number(book.askPrice);
 const sum=(rows,accept)=>Array.isArray(rows)?rows.filter(z=>Array.isArray(z)&&
  z.length>=2&&Number.isFinite(+z[0])&&Number.isFinite(+z[1])&&accept(+z[0]))
  .reduce((acc,z)=>acc+(+z[0])*(+z[1]),0):NaN;
 const r={symbol:x.symbol,bid,ask,asOf:Date.now(),quoteVolume24h:Number(day.quoteVolume),
  depthAskUSDT:sum(depth?.asks,p=>p>=ask&&p<=ask*1.0035),
  depthBidUSDT:sum(depth?.bids,p=>p<=bid&&p>=bid*.9965),
  filters:{trading:x.status==="TRADING"&&x.isSpotTradingAllowed!==false&&
   (!x.permissionSets?.length||x.permissionSets.some(z=>Array.isArray(z)&&z.includes("SPOT"))),
   tickSize,stepSize,minQty:Number(lot.minQty),maxQty:Number(lot.maxQty),
   minNotional:Number(notional.minNotional??0),status:x.status,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset},
  source:"Binance Spot REST · consulta directa del navegador",venue:"BINANCE_SPOT"};
 if(x.quoteAsset!=="USDT"||!(bid>0&&ask>=bid)||
  ![tickSize,stepSize,r.quoteVolume24h,r.depthAskUSDT,r.depthBidUSDT,
    r.filters.minQty,r.filters.minNotional].every(Number.isFinite)||tickSize<=0||stepSize<=0)
  throw Error("Binance no devolvió cotización, filtros o profundidad válidos");
 return r;
}
async function quote(symbol,{fetcher=fetch,timeout=6500}={}){
 if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol))throw Error("Par spot USDT inválido");
 const bases=["https://data-api.binance.vision","https://api.binance.com"];
 let previous;
 for(const base of bases){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout),q="symbol="+encodeURIComponent(symbol);
  async function json(endpoint){
   const r=await fetcher(base+endpoint,{signal:ac.signal,headers:{accept:"application/json"}});
   if(!r.ok)throw Error("Binance HTTP "+r.status);
   return r.json();
  }
  try{
   const [book,day,info,depth]=await Promise.all([
    json("/api/v3/ticker/bookTicker?"+q),json("/api/v3/ticker/24hr?"+q),
    json("/api/v3/exchangeInfo?"+q),json("/api/v3/depth?"+q+"&limit=100")]);
   return normalize(book,day,info,depth);
  }catch(e){previous=e;}finally{clearTimeout(timer);}
 }
 throw Error("Sin cotización Binance accesible desde navegador: "+String(previous?.message||"Sin proveedor"));
}
return{quote,normalize};
});