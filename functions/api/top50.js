/* Cloudflare Pages Function /api/top50. No authentication, POSTs or arbitrary URL input. */
const reply=(code,payload,cache='no-store')=>new Response(JSON.stringify(payload),{
 status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,
 'X-Content-Type-Options':'nosniff'}});
export async function onRequest({request}){
 if(request.method!=='GET')return reply(405,{error:'Solo GET'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
 try{
  const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false';
  const resp=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal});
  if(!resp.ok)throw Error('CoinGecko HTTP '+resp.status);
  const rows=await resp.json();
  if(!Array.isArray(rows)||rows.length!==50||
     rows.some(x=>!x.id||!x.symbol||!Number.isFinite(x.market_cap_rank)))
   throw Error('Ranking de capitalización incompleto');
  const items=rows.map(x=>({id:String(x.id),symbol:String(x.symbol).toUpperCase(),
   name:String(x.name),rank:x.market_cap_rank,marketCap:x.market_cap,
   price:x.current_price,change24h:x.price_change_percentage_24h??null}));
  return reply(200,{source:'CoinGecko /coins/markets',fetchedAt:new Date().toISOString(),items},
   'public, s-maxage=900, stale-while-revalidate=3600');
 }catch(e){return reply(503,{error:'Top 50 no verificable: '+e.message});}
 finally{clearTimeout(timer);}
}
