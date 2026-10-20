/* Cloudflare Pages top50: use the same independently calculated, coherent
 * GitHub 4H snapshot as the desk. No calls to CoinGecko from Cloudflare edge.
 * An outdated snapshot is an error, not a fabricated live ranking. */
const reply=(code,payload,cache='no-store')=>new Response(JSON.stringify(payload),{
 status:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':cache,
  'X-Content-Type-Options':'nosniff'}});
export async function onRequest({request,env}){
 if(request.method!=='GET')return reply(405,{error:'Solo GET'});
 try{
  if(!env?.ASSETS?.fetch)throw Error('Binding de archivos estáticos no disponible');
  const u=new URL('/data/tl-radar.json',request.url);
  const response=await env.ASSETS.fetch(new Request(u.toString(),{method:'GET'}));
  if(!response.ok)throw Error('Snapshot público HTTP '+response.status);
  const s=await response.json(),expected=Math.floor(Date.now()/14400000)*14400000-14400000;
  if(s.items?.length!==50||!Number.isFinite(Date.parse(s.generatedAt))||
   !Number.isFinite(s.lastCandle)||s.lastCandle!==expected)
   throw Error('Top50 no corresponde al último cierre 4H; no se presenta como vigente');
  const items=s.items.map(x=>({
   id:String(x.id),symbol:String(x.symbol),name:String(x.name),rank:x.rank,
   marketCap:x.marketCap??null,price:x.price??null,change24h:x.change??null
  }));
  if(items.some(x=>!x.id||!x.symbol||!x.name||!Number.isInteger(x.rank))||
   new Set(items.map(x=>x.id)).size!==50||new Set(items.map(x=>x.rank)).size!==50)
   throw Error('Ranking incompleto o duplicado');
  return reply(200,{source:'CoinGecko · snapshot verificable de GitHub Actions, sin consulta en vivo',
   fetchedAt:s.marketAt||s.generatedAt,lastCandle:s.lastCandle,items},'public, s-maxage=60');
 }catch(e){return reply(503,{error:'Top 50 no verificable: '+String(e.message||e)});}
}
