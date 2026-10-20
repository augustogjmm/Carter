/* Cloudflare Pages Functions health: no external or paid service calls. */
export function onRequest({request}){
 if(request.method!=='GET')return new Response('GET only',{status:405});
 return new Response(JSON.stringify({application:'Carter',environment:'Cloudflare Pages Free',
  functions:'READY',service:'PUBLIC_MARKET_DATA_ONLY',
  statement:'Health checks infrastructure only, NOT provider availability or trading profitability',
  at:new Date().toISOString()}),{status:200,headers:{'Content-Type':'application/json',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
