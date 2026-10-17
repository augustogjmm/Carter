// Fixed public market-data proxy. No credentials, arbitrary hosts or order endpoints.
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Solo GET'});
 const path=String(req.query.path||''),q=new URLSearchParams(String(req.query.query||''));
 const allowed={
  '/api/v3/klines':['symbol','interval','limit','startTime','endTime'],
  '/api/v3/exchangeInfo':[],
  '/v5/market/kline':['category','symbol','interval','end','limit']
 };
 if(!Object.hasOwn(allowed,path)||[...q.keys()].some(k=>!allowed[path].includes(k)))return res.status(400).json({error:'Consulta no permitida'});
 if(path!=='/api/v3/exchangeInfo'){
  if(!/^[A-Z0-9]{2,24}USDT$/.test(q.get('symbol')||'')||!['4h','240'].includes(q.get('interval'))||q.get('limit')!=='1000')return res.status(400).json({error:'Par o intervalo inválido'});
  for(const k of ['startTime','endTime','end'])if(q.has(k)&&!/^\d{10,16}$/.test(q.get(k)))return res.status(400).json({error:'Fecha inválida'});
  if(path.startsWith('/v5')&&q.get('category')!=='spot')return res.status(400).json({error:'Solo spot'});
 }
 const sources=path.startsWith('/v5')?['https://api.bybit.com']:['https://data-api.binance.vision','https://api.binance.com'];
 let error;
 for(const base of sources){
  try{
   const response=await fetch(base+path+'?'+q,{headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error('Proveedor HTTP '+response.status);
   const data=await response.json();
   if(path.endsWith('klines')&&!Array.isArray(data))throw Error('OHLCV inválido');
   if(path.endsWith('exchangeInfo')&&!Array.isArray(data.symbols))throw Error('Catálogo inválido');
   if(path.startsWith('/v5')&&data.retCode!==0)throw Error(data.retMsg||'Bybit sin datos');
   res.setHeader('Cache-Control','public, s-maxage=30');
   return res.status(200).json(data);
  }catch(e){error=e;}
 }
 res.setHeader('Cache-Control','no-store');return res.status(503).json({error:String(error?.message||'Sin datos de mercado')});
}
