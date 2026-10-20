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
/* Fallback is indicative ONLY. OKX data cannot authorize Binance executions
   because the strategy candles and exchange filters refer to Binance Spot. */
async function indicativeOKX(symbol){
 const inst=symbol.slice(0,-4)+"-USDT",c=new AbortController(),timer=setTimeout(()=>c.abort(),6800);
 async function read(path){
  const r=await fetch("https://www.okx.com"+path,{signal:c.signal,headers:{accept:"application/json"}});
  if(!r.ok)throw Error("OKX HTTP "+r.status);
  const o=await r.json();if(o.code!=="0"||!Array.isArray(o.data)||!o.data.length)throw Error("OKX sin datos");
  return o.data[0];
 }
 try{
  const [ticker,depth,info]=await Promise.all([
   read("/api/v5/market/ticker?instId="+inst),
   read("/api/v5/market/books?instId="+inst+"&sz=100"),
   read("/api/v5/public/instruments?instType=SPOT&instId="+inst)]);
  if(info.instId!==inst||info.instType!=="SPOT"||info.state!=="live")throw Error("OKX spot no activo");
  const bid=Number(ticker.bidPx),ask=Number(ticker.askPx);
  const sum=(rows,low,hi)=>Array.isArray(rows)?rows.filter(a=>Array.isArray(a)&&
   a.length>=2&&Number.isFinite(+a[0])&&Number.isFinite(+a[1])&&+a[0]>=low&&+a[0]<=hi)
   .reduce((acc,a)=>acc+(+a[0])*(+a[1]),0):NaN;
  const out={symbol,bid,ask,quoteVolume24h:Number(ticker.volCcy24h),
   depthAskUSDT:sum(depth.asks,ask,ask*1.0035),depthBidUSDT:sum(depth.bids,bid*.9965,bid),
   asOf:Date.now(),indicative:true,venue:"OKX_SPOT",source:"OKX Spot · SOLO INDICATIVO / NO BINANCE",
   filters:{trading:false,tickSize:Number(info.tickSz),stepSize:Number(info.lotSz),
    minQty:Number(info.minSz),maxQty:0,minNotional:0,status:"INDICATIVE_ONLY",
    baseAsset:info.baseCcy,quoteAsset:info.quoteCcy}};
  if(!(bid>0&&ask>=bid)||!Object.values({
   v:out.quoteVolume24h,a:out.depthAskUSDT,b:out.depthBidUSDT,
   tick:out.filters.tickSize,step:out.filters.stepSize,min:out.filters.minQty
  }).every(Number.isFinite))throw Error("OKX libro incompleto");
  return out;
 }finally{clearTimeout(timer);}
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
 try{
  const indicative=await indicativeOKX(symbol);
  return out(200,indicative,'no-store');
 }catch(e){
  return out(503,{error:'No fue posible verificar precio, spread, filtros y profundidad',
   detail:'Binance: '+String(last?.message||'Sin proveedor')+'; OKX: '+String(e.message||e)});
 }
}
