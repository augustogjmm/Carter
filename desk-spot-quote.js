/* Browser-only direct Binance read-only quote fallback.
 * Used when Cloudflare edge is HTTP 451. Fail closed on any missing field.
 * NEVER proxies orders or calls account/private endpoints. */
(function(root,factory){
 const a=factory();if(typeof module==='object'&&module.exports)module.exports=a;
 if(root)root.CarterBrowserSpot=a;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const HOSTS=['https://data-api.binance.vision','https://api.binance.com'];
function normalize(book,day,info,depth,symbol,now=Date.now()){
 const x=info?.symbols?.[0],fs=Object.fromEntries((x?.filters||[]).map(f=>[f.filterType,f]));
 if(!x||x.symbol!==symbol||x.quoteAsset!=='USDT')throw Error('Exchange info incompleto');
 const tickSize=Number(fs.PRICE_FILTER?.tickSize),stepSize=Number(fs.LOT_SIZE?.stepSize),
   minQty=Number(fs.LOT_SIZE?.minQty),minNotional=Number((fs.NOTIONAL||fs.MIN_NOTIONAL)?.minNotional),
   maxQty=Number(fs.LOT_SIZE?.maxQty);
 const bid=Number(book?.bidPrice),ask=Number(book?.askPrice);
 const near=(rows,filter)=>Array.isArray(rows)?rows.reduce((sum,row)=>{
  if(!Array.isArray(row)||row.length<2)return sum;
  const p=Number(row[0]),q=Number(row[1]);
  return Number.isFinite(p)&&Number.isFinite(q)&&p>0&&q>=0&&filter(p)?sum+p*q:sum;
 },0):NaN;
 const q={symbol,bid,ask,asOf:now,quoteVolume24h:Number(day?.quoteVolume),
  depthAskUSDT:near(depth?.asks,p=>p>=ask&&p<=ask*1.0035),
  depthBidUSDT:near(depth?.bids,p=>p<=bid&&p>=bid*.9965),
  filters:{trading:x.status==='TRADING'&&x.isSpotTradingAllowed!==false&&
    (!x.permissionSets?.length||x.permissionSets.some(v=>v.includes('SPOT'))),
   tickSize,stepSize,minQty,minNotional,maxQty,status:x.status,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset},
  source:'Binance Spot REST · lectura directa desde navegador; NO son órdenes'};
 if(!(bid>0&&ask>=bid)||![q.quoteVolume24h,q.depthAskUSDT,q.depthBidUSDT,tickSize,stepSize,minQty,minNotional,maxQty].every(Number.isFinite)||
    !(tickSize>0&&stepSize>0&&minQty>0&&minNotional>0))
  throw Error('Mercado sin filtros o libro de órdenes verificable');
 return q;
}
async function get(symbol,fetcher=fetch){
 if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol))throw Error('Símbolo Binance inválido');
 let last;
 for(const host of HOSTS){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8500);
  try{
   const query='symbol='+encodeURIComponent(symbol);
   const [book,day,info,depth]=await Promise.all([
    '/api/v3/ticker/bookTicker?'+query,
    '/api/v3/ticker/24hr?'+query,
    '/api/v3/exchangeInfo?'+query,
    '/api/v3/depth?'+query+'&limit=100'].map(async suffix=>{
      const response=await fetcher(host+suffix,{headers:{accept:'application/json'},signal:ctrl.signal,cache:'no-store'});
      if(!response.ok)throw Error('Binance direct '+response.status);
      return response.json();
    }));
   return normalize(book,day,info,depth,symbol);
  }catch(e){last=e;}finally{clearTimeout(timer);}
 }
 throw Error('Sin libro Binance directo del navegador: '+(last?.message||'sin proveedor'));
}
return{get,normalize};
});
