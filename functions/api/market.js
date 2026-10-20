/* Cloudflare Pages Function /api/market — public read-only provider allowlist. */
const dataHosts=['https://data-api.binance.vision','https://api.binance.com'];
const markets={
 '/api/v3/klines':['symbol','interval','limit','startTime','endTime'],
 '/api/v3/exchangeInfo':[],
 '/v5/market/kline':['category','symbol','interval','end','limit']
};
const json=(status,data,ttl='no-store')=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':ttl,
 'X-Content-Type-Options':'nosniff'}
});
async function fetchJson(url,timeout=10000){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 try{
  const r=await fetch(url,{headers:{accept:'application/json'},signal:ac.signal});
  if(!r.ok)throw Error('Proveedor HTTP '+r.status);
  return r.json();
 }finally{clearTimeout(timer);}
}
async function staticCandles(request,env,path,query){
 if(path!=="/api/v3/klines"||!["4h","1d"].includes(query.get("interval"))||!env?.ASSETS?.fetch)
  return null;
 const symbol=query.get("symbol"),period=query.get("interval"),url=new URL("/data/market/"+symbol+"-"+period+".json",request.url);
 const response=await env.ASSETS.fetch(new Request(url.toString()));
 if(!response.ok)throw Error("Histórico Binance no publicado: "+response.status);
 const snap=await response.json(),ms=period==="4h"?14400000:86400000,
   expected=Math.floor(Date.now()/ms)*ms-ms,rows=snap.bars;
 if(snap.version!==1||snap.symbol!==symbol||snap.period!==period||
  !String(snap.source).startsWith("Binance Spot")||snap.lastCandle!==expected||
  !Array.isArray(rows)||rows.length<250||rows.at(-1).t!==expected)
  throw Error("Histórico Binance almacenado no vigente o inválido");
 const start=Number(query.get("startTime")||0),end=Number(query.get("endTime")||Number.MAX_SAFE_INTEGER);
 return rows.filter(x=>x.t>=start&&x.t<=end).slice(0,Number(query.get("limit")||1000))
  .map(x=>[x.t,String(x.o),String(x.h),String(x.l),String(x.c),String(x.v),x.t+ms-1,"0",0,"0","0","0"]);
}
export async function onRequest({request,env}){
 if(request.method!=='GET')return json(405,{error:'Solo GET'});
 const url=new URL(request.url),path=url.searchParams.get('path')||'';
 const query=new URLSearchParams(url.searchParams.get('query')||'');
 if(path==='/api/v1/market/candles'){
  if([...query.keys()].some(k=>!['symbol','type','startAt','endAt'].includes(k))||
  !/^[A-Z0-9]{2,24}-USDT$/.test(query.get('symbol')||'')||
  query.get('type')!=='4hour'||!/^\d{10}$/.test(query.get('startAt')||'')||
  !/^\d{10}$/.test(query.get('endAt')||''))return json(400,{error:'Consulta KuCoin inválida'});
  try{
   const result=await fetchJson('https://api.kucoin.com/api/v1/market/candles?'+query,9500);
   if(result?.code!=='200000'||!Array.isArray(result.data))throw Error('KuCoin no devolvió velas');
   return json(200,result,'public, s-maxage=30');
  }catch(e){return json(503,{error:'KuCoin no disponible: '+e.message});}
 }
 if(!Object.hasOwn(markets,path)||[...query.keys()].some(k=>!markets[path].includes(k)))
  return json(400,{error:'Ruta o parámetro no permitido'});
 if(path!=='/api/v3/exchangeInfo'){
  if(!/^[A-Z0-9]{2,24}USDT$/.test(query.get('symbol')||'')||
    !['1h','4h','1d','240','60','D'].includes(query.get('interval'))||
    query.get('limit')!=='1000')return json(400,{error:'Par o intervalo inválido'});
  for(const k of ['startTime','endTime','end'])
   if(query.has(k)&&!/^\d{10,16}$/.test(query.get(k)))return json(400,{error:'Fecha inválida'});
  if(path.startsWith('/v5/')&&query.get('category')!=='spot')return json(400,{error:'Solo spot'});
 }
 const hosts=path.startsWith('/v5/')?['https://api.bybit.com']:dataHosts;
 let latest;
 for(const host of hosts){
  try{
   const result=await fetchJson(host+path+'?'+query,9500);
   if(path.endsWith('klines')&&!Array.isArray(result))throw Error('OHLCV incompleto');
   if(path.endsWith('exchangeInfo')&&!Array.isArray(result?.symbols))throw Error('Catálogo incompleto');
   if(path.startsWith('/v5/')&&result?.retCode!==0)throw Error('Bybit no disponible');
   return json(200,result,'public, s-maxage=30');
  }catch(e){latest=e;}
 }
 try{const fallback=await staticCandles(request,env,path,query);
  if(fallback)return json(200,fallback,'public, s-maxage=30');
 }catch(e){latest=e;}
 return json(503,{error:'No fue posible verificar los datos de mercado: '+(latest?.message||'Sin proveedor')});
}
