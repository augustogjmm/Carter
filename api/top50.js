// Official CoinGecko top-50 capitalization snapshot. Server-side proxy avoids browser CORS.
export default async function handler(req,res) {
  if(req.method !== 'GET'){res.status(405).json({error:'Solo GET'});return;}
  try {
    const url='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false';
    const response=await fetch(url,{headers:{accept:'application/json','user-agent':'PCS-Radar/1.0 research'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Ranking externo HTTP '+response.status);
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length!==50||rows.some(x=>!x.id||!x.symbol||!Number.isFinite(x.market_cap_rank)))throw new Error('Ranking incompleto o inválido');
    const items=rows.map(x=>({id:String(x.id),symbol:String(x.symbol).toUpperCase(),name:String(x.name),rank:x.market_cap_rank,marketCap:x.market_cap,price:x.current_price,change24h:x.price_change_percentage_24h??null}));
    res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({source:'CoinGecko /coins/markets',fetchedAt:new Date().toISOString(),items});
  }catch(e){res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Ranking top 50 no disponible: '+String(e.message||e)});}
}

