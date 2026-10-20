/* Publish real closed Binance Spot candles as STATIC data on Cloudflare Pages.
 * Not a trading signal or live order book. Runs only in GitHub Actions and fails
 * closed if BTC/ETH cannot be verified. No paid storage, keys, or API tokens. */
'use strict';
const fs=require('node:fs'),D=require('../tl-data.js'),E=require('../tl-engine.js');
const DAY=86400000,H4=14400000,NOW=Date.now(),expected=(Math.floor(NOW/H4)-1)*H4;
const ranked=JSON.parse(fs.readFileSync('data/tl-radar.json','utf8'));
const items=ranked.items.filter(x=>['blocked','watch','bear','signal','position'].includes(x.status)&&
 /^[A-Z0-9]{2,24}$/.test(x.symbol)&&x.source?.startsWith('Binance Spot'));
let next=0;const files=[],failed=[];
fs.mkdirSync('data/ohlcv',{recursive:true});
async function worker(){
 while(next<items.length){
  const item=items[next++],symbol=item.symbol+'USDT',results=[];
  try{
   for(const [period,days] of [['4h',270],['1d',480]]){
    const candle=E.PERIOD[period],since=Math.floor((NOW-days*DAY)/candle)*candle;
    const result=await D.history(symbol,period,since);
    if(!result.source.startsWith('Binance Spot')||result.bars.at(-1).t!==(Math.floor(NOW/candle)-1)*candle||
      result.bars.length<250||result.gaps>0)
     throw Error(period+' falta cierre Binance o contiene huecos');
    results.push({period,generatedAt:new Date(NOW).toISOString(),lastCandle:result.bars.at(-1).t,
     symbol,source:result.source,bars:result.bars});
   }
   for(const result of results){
    const file='data/ohlcv/'+symbol+'-'+result.period+'.json';
    fs.writeFileSync(file,JSON.stringify(result)+'\n');
    files.push(file);
   }
  }catch(e){failed.push({symbol,reason:String(e.message||e)});}
 }
}
async function main(){
 if(!Array.isArray(ranked.items)||ranked.items.length!==50||ranked.lastCandle!==expected)
  throw Error('El radar 4H no está alineado con este cierre de mercado');
 await Promise.all(Array.from({length:3},worker));
 const symbols=new Set(files.filter(p=>p.endsWith('-4h.json')).map(p=>p.slice('data/ohlcv/'.length,-'-4h.json'.length)));
 for(const s of ['BTCUSDT','ETHUSDT'])if(!symbols.has(s))throw Error('Faltan velas críticas reales de '+s);
 const manifest={protocol:'CARTER-OHLCV-STATIC-1',generatedAt:new Date(NOW).toISOString(),
  lastCandle:expected,source:'Binance Spot read-only via GitHub Actions; NO quote L2',
  files:files.sort(),symbols:[...symbols].sort(),failed};
 fs.writeFileSync('data/ohlcv/manifest.json',JSON.stringify(manifest,null,2)+'\n');
 console.log('PUBLIC_OHLCV',JSON.stringify({symbols:symbols.size,files:files.length,
  missing:failed.length,sampleErrors:failed.slice(0,3)}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
