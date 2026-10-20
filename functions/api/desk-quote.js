/* Cloudflare Pages Function /api/desk-quote: live Binance spot bid/ask/depth/filters. */
const hosts=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
const out=(status,payload,cache='no-store')=>new Response(JSON.stringify(payload),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,'X-Content-Type-Options':'nosniff'}});
async function get(url,signal){
 const r=await fetch(url,{signal,headers:{accept:'application/json'}});
 if(!r.ok)throw Error('Binance HTTP '+r.status);
 return r.json();
}
export function normalize(book,day,info,depth){
 const x=info?.symbols?.[0];
 if(!x)throw Error('Mercado spot no encontrado');
 const fs=Object.fromEntries((x.filters||[]).map(f=>[f.filterType,f]));
 const lot=fs.LOT_SIZE||{},notional=fs.NOTIONAL||fs.MIN_NOTIONAL||{};
 const filters={
  trading:x.status==='TRADING'&&x.isSpotTradingAllowed!==false&&
   (!x.permissionSets?.length||x.permissionSets.some(p=>Array.isArray(p)&&p.includes('SPOT'))),
  tickSize:Number(fs.PRICE_FILTER?.tickSize),
  stepSize:Number(lot.stepSize),minQty:Number(lot.minQty),
  maxQty:Number(lot.maxQty),minNotional:Number(notional.minNotional??0),
  status:x.status,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset
 };
 const near=(entries,test)=>Array.isArray(entries)?entries.filter(z=>Array.isArray(z)&&z.length>=2&&
  Number.isFinite(Number(z[0]))&&Number.isFinite(Number(z[1]))&&test(Number(z[0])))
   .reduce((sum,z)=>sum+Number(z[0])*Number(z[1]),0):NaN;
 const bid=Number(book?.bidPrice),ask=Number(book?.askPrice);
 const quote={
  symbol:x.symbol,bid,ask,asOf:Date.now(),quoteVolume24h:Number(day?.quoteVolume),
  depthAskUSDT:near(depth?.asks,p=>p>=ask&&p<=ask*1.0035),
  depthBidUSDT:near(depth?.bids,p=>p<=bid&&p>=bid*.9965),
  filters,source:'Binance Spot REST · Cloudflare proxy'
 };
 if(x.quoteAsset!=='USDT'||!(bid>0&&ask>=bid)||
  ![quote.quoteVolume24h,quote.depthAskUSDT,quote.depthBidUSDT,
  filters.tickSize,filters.stepSize,filters.minQty,filters.minNotional].every(Number.isFinite)||
  !(filters.tickSize>0&&filters.stepSize>0&&filters.minQty>0))
  throw Error('Mercado o condiciones de ejecución incompletas');
 return quote;
}
export async function onRequest({request}){
 if(request.method!=='GET')return out(405,{error:'Solo GET'});
 const u=new URL(request.url),symbol=(u.searchParams.get('symbol')||'').toUpperCase();
 if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol))return out(400,{error:'Par inválido'});
 let last;
 const qs='symbol='+encodeURIComponent(symbol);
 for(const h of hosts){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);
  try{
   const [book,day,info,depth]=await Promise.all([
    get(h+'/api/v3/ticker/bookTicker?'+qs,c.signal),
    get(h+'/api/v3/ticker/24hr?'+qs,c.signal),
    get(h+'/api/v3/exchangeInfo?'+qs,c.signal),
    get(h+'/api/v3/depth?'+qs+'&limit=100',c.signal)
   ]);
   const result=normalize(book,day,info,depth);
   return out(200,result,'public, s-maxage=4');
  }catch(e){last=e;}finally{clearTimeout(t);}
 }
 return out(503,{error:'No fue posible verificar precio, spread, filtros y profundidad',
  detail:String(last?.message||'Sin proveedor')});
}
