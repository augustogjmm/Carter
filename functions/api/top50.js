/* Cloudflare Pages /api/top50.
 * CoinGecko blocks Workers (403) in some regions: prefer our VERIFIED
 * 4H CoinGecko-derived GitHub snapshot. Never invent rankings on failure. */
const reply=(code,payload,cache='no-store')=>new Response(JSON.stringify(payload),{
 status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,
 'X-Content-Type-Options':'nosniff'}});
function unpackSnapshot(s,now=Date.now()){
 if(!s||s.items?.length!==50||!Number.isFinite(s.lastCandle)||
  now-(s.lastCandle+14400000)>8*3600000||
  s.items.some(x=>!x.id||!x.symbol||!Number.isInteger(x.rank)))return null;
 const items=s.items.map(x=>({id:x.id,symbol:x.symbol,name:x.name,rank:x.rank,
  marketCap:x.marketCap??null,price:x.price??null,change24h:x.change??null}));
 if(new Set(items.map(x=>x.rank)).size!==50)return null;
 return{source:'CoinGecko 50 · snapshot GitHub por vela 4H',fetchedAt:s.marketAt||s.generatedAt,
  latestCandle:s.lastCandle,items};
}
export {unpackSnapshot};
export async function onRequest({request,env}){
 if(request.method!=='GET')return reply(405,{error:'Solo GET'});
 try{
  if(env?.ASSETS?.fetch){
   const url=new URL('/data/tl-radar.json',request.url);
   const response=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
   if(response.ok){
    const r=unpackSnapshot(await response.json());
    if(r)return reply(200,r,'public, s-maxage=900');
   }
  }
 }catch(e){/* No silent fabrication, external fallback below. */}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false';
  const resp=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal});
  if(!resp.ok)throw Error('CoinGecko HTTP '+resp.status);
  const rows=await resp.json();
  if(!Array.isArray(rows)||rows.length!==50||rows.some(x=>!x.id||!x.symbol||!Number.isFinite(x.market_cap_rank)))
    throw Error('Ranking incompleto');
  return reply(200,{source:'CoinGecko /coins/markets',fetchedAt:new Date().toISOString(),
   items:rows.map(x=>({id:String(x.id),symbol:String(x.symbol).toUpperCase(),
    name:String(x.name),rank:x.market_cap_rank,marketCap:x.market_cap,
    price:x.current_price,change24h:x.price_change_percentage_24h??null}))},
   'public, s-maxage=900');
 }catch(e){return reply(503,{error:'Top 50 no verificable: '+e.message});}
 finally{clearTimeout(timer);}
}
