/* Trading Latino data layer — Binance spot, no synthetic OHLCV or order endpoints. */
(function(root,factory){const api=factory(root.TLEngine || (typeof require==='function'?require('./tl-engine.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;root.TLData=api;})(typeof window!=='undefined'?window:globalThis,function(engine){
'use strict';
const DAY=86400000,START=Date.UTC(2020,0,1),browser=typeof document!=='undefined';
const BINANCE=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
const stable=/^(USDT|USDC|DAI|USDE|FDUSD|PYUSD|USDS|USD1|TUSD|USDD|RLUSD|USDG|USD0|USDF|USDD|USYC)$/i;
const derivative=/^(wrapped|bridged|staked|binance-peg)/i;
async function request(url,timeout=16000){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),timeout);
 try{const r=await fetch(url,{headers:{accept:'application/json'},signal:ac.signal});if(!r.ok)throw Error('HTTP '+r.status+' · '+new URL(url,'https://localhost').hostname);return await r.json();}
 finally{clearTimeout(t);}}
async function getJson(url){let error,urls=[url];if(browser&&url.startsWith('https://')){
 const u=new URL(url);if(['/api/v3/klines','/api/v3/exchangeInfo'].includes(u.pathname))urls.push('/api/market?'+new URLSearchParams({path:u.pathname,query:u.search.slice(1)}));}
 for(const u of urls){try{return await request(u);}catch(e){error=e;}}throw error;}
async function rank(){const urls=browser?['/api/top50','https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false']:
 ['https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false'];
 let error;for(const u of urls){try{const r=await request(u),arr=Array.isArray(r)?r:r.items;
 if(!Array.isArray(arr)||arr.length!==50)throw Error('Ranking incompleto');
 const coins=arr.map(x=>({id:String(x.id),symbol:String(x.symbol).toUpperCase(),name:String(x.name),rank:Number(x.market_cap_rank??x.rank),
 price:Number(x.current_price??x.price),change:Number(x.price_change_percentage_24h??x.change24h)}));
 if(coins.some(x=>!Number.isInteger(x.rank)||x.rank<1||!x.id||!x.name)||new Set(coins.map(x=>x.id)).size!==50||new Set(coins.map(x=>x.rank)).size!==50)throw Error('Ranking duplicado');
 return{coins,fetchedAt:new Date().toISOString(),source:'CoinGecko'};}catch(e){error=e;}}throw Error('Top 50 no verificable: '+error.message);}
async function exchange(){let error;for(const host of BINANCE){try{const r=await getJson(host+'/api/v3/exchangeInfo');
 if(!Array.isArray(r.symbols))throw Error('exchangeInfo inválido');const set=new Set();
 for(const x of r.symbols)if(x.status==='TRADING'&&x.quoteAsset==='USDT'&&x.isSpotTradingAllowed!==false&&
 (!x.permissionSets||!x.permissionSets.length||x.permissionSets.some(v=>Array.isArray(v)&&v.includes('SPOT'))))set.add(x.baseAsset.toUpperCase());
 if(set.size<50)throw Error('Mercados incompletos');return set;}catch(e){error=e;}}throw Error('Binance mercados: '+error.message);}
function gate(c,available,duplicates){if(stable.test(c.symbol)||/stablecoin|stable coin/i.test(c.name))return'Stablecoin / activo estable';
 if(derivative.test(c.id)||derivative.test(c.name))return'Activo envuelto, puenteado o staking';
 if(duplicates.has(c.symbol))return'Símbolo ambiguo en top 50';
 if(!available.has(c.symbol))return'Sin par USDT spot activo en Binance';
 return null;}
const cache=new Map();
async function history(symbol,period='4h',since=START){if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol)||!engine.PERIOD[period])throw Error('Par o intervalo inválido');
 const ms=engine.PERIOD[period],slot=Math.floor(Date.now()/ms),key=symbol+':'+period+':'+slot+':'+since;
 if(cache.has(key))return cache.get(key);
 const job=(async()=>{
  let error;
  for(const host of BINANCE){try{
   let cursor=since,bars=[],lastOpen=Math.floor(Date.now()/ms)*ms-ms,pages=Math.ceil((lastOpen-since)/ms/1000)+2;
   if(pages>100)throw Error('Histórico fuera de capacidad');
   for(let i=0;i<pages&&cursor<=lastOpen;i++){
    const u=host+'/api/v3/klines?'+new URLSearchParams({symbol,interval:period,limit:'1000',startTime:String(cursor),endTime:String(lastOpen+ms-1)});
    const list=await getJson(u);if(!Array.isArray(list))throw Error('Formato OHLCV no válido');
    if(!list.length)break;
    for(const k of list){const t=Number(k[0]);if(t<=lastOpen)bars.push({t,o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]});}
    const last=Number(list.at(-1)[0]);if(last<cursor)throw Error('Paginación retrocede');cursor=last+ms;if(list.length<1000)break;
   }
   bars=engine.validate(bars,period);
   if(bars.length<250||bars.at(-1).t!==lastOpen)throw Error('Cobertura incompleta de última vela cerrada');
   let gaps=0;for(let i=1;i<bars.length;i++)if(bars[i].t-bars[i-1].t!==ms)gaps++;
   return{bars,source:'Binance Spot '+new URL(host).hostname,gaps,period,from:bars[0].t,until:bars.at(-1).t};
  }catch(e){error=e;}}
  throw Error('Descarga '+symbol+' '+period+': '+error.message);
 })();
 cache.set(key,job);try{return await job;}catch(e){cache.delete(key);throw e;}
}
function classify(payload,period='4h'){const b=payload.bars,ind=engine.indicators(b,period),current=engine.latest(b,ind,period);
 if(current.status==='SIN DATOS')return{status:'error',reason:current.reason,source:payload.source};
 const bt=engine.backtest(b,ind),s=engine.stats(bt);
 let status=bt.pos?'position':current.signal?'signal':current.status==='VIGILAR'?'watch':current.status==='DETERIORO'?'bear':'blocked';
 return{status,reason:bt.pos?'Posición simulada abierta · no hay nueva orden':current.reason,
 signal:!!current.signal&&!bt.pos,price:b.at(-1).c,lastCandle:b.at(-1).t,adx:current.adx,
 ema10:current.ema10,ema55:current.ema55,momentum:current.mom,squeeze:current.squeeze,
 source:payload.source,gaps:payload.gaps,positionOpen:!!bt.pos,stats:s};
}
return{rank,exchange,gate,history,classify,request,version:'TL-DATA-1.0'};
});