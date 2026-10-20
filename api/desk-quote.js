/* Public, read-only spot quote and exchange-rule gateway for Carter Desk.
   No order execution, API credentials or personal data. */
'use strict';
const hosts=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
const cache=new Map();
async function json(url,signal){
 const response=await fetch(url,{signal,headers:{accept:'application/json'}});
 if(!response.ok)throw Error('Binance HTTP '+response.status);
 return response.json();
}
function normalize(book,day,info){
 const x=info?.symbols?.[0];if(!x)throw Error('Símbolo spot no encontrado');
 const fl=Object.fromEntries((x.filters||[]).map(v=>[v.filterType,v]));
 const tick=Number(fl.PRICE_FILTER?.tickSize),lot=fl.LOT_SIZE||{},notional=fl.NOTIONAL||fl.MIN_NOTIONAL||{};
 const filters={trading:x.status==='TRADING'&&x.isSpotTradingAllowed!==false&&
 (!x.permissionSets?.length||x.permissionSets.some(a=>a.includes('SPOT'))),
 tickSize:tick,stepSize:Number(lot.stepSize),minQty:Number(lot.minQty),
 maxQty:Number(lot.maxQty),minNotional:Number(notional.minNotional??notional.minNotionalValue??0),
 status:x.status,baseAsset:x.baseAsset,quoteAsset:x.quoteAsset};
 const output={symbol:x.symbol,bid:Number(book.bidPrice),ask:Number(book.askPrice),
 quoteVolume24h:Number(day.quoteVolume),filters,asOf:Date.now(),source:'Binance Spot REST'};
 if(x.quoteAsset!=='USDT'||![output.bid,output.ask,output.quoteVolume24h,tick,filters.stepSize,filters.minNotional].every(Number.isFinite))
   throw Error('Cotización o restricciones no válidas');
 return output;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Método no admitido'});
 const symbol=String(req.query?.symbol||'').toUpperCase();
 if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol))return res.status(400).json({error:'Par inválido'});
 const cached=cache.get(symbol);if(cached&&Date.now()-cached.asOf<4500)return res.status(200).json(cached);
 let error;
 for(const h of hosts){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),9000);
  try{
   const params='symbol='+encodeURIComponent(symbol);
   const [book,day,info]=await Promise.all([
    json(h+'/api/v3/ticker/bookTicker?'+params,ac.signal),
    json(h+'/api/v3/ticker/24hr?'+params,ac.signal),
    json(h+'/api/v3/exchangeInfo?'+params,ac.signal)
   ]);
   const result=normalize(book,day,info);cache.set(symbol,result);
   return res.status(200).json(result);
  }catch(e){error=e;}finally{clearTimeout(timer);}
 }
 return res.status(503).json({error:'No fue posible verificar precios y filtros del exchange',detail:String(error?.message||'Sin proveedor')});
};
module.exports.normalize=normalize;