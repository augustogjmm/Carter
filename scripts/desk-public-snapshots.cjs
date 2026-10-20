/* Publish CLOSED Binance Spot candle histories for static Cloudflare Pages.
 * Produced once by the existing free GitHub 4H workflow, never by Cloudflare API.
 * This uses exactly the same provider as the Trading Latino signal engine.
 */
"use strict";
const fs=require("node:fs"),path=require("node:path");
const D=require("../tl-data.js"),E=require("../tl-engine.js");
const H4=14400000,DAY=86400000,ROOT=path.resolve(__dirname,"..");
const enough=rows=>Array.isArray(rows)&&rows.length>=250&&
 rows.every(x=>Number.isFinite(x.t)&&[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite));
function check(payload,period,expected){
 const rows=payload?.bars;
 if(!enough(rows)||!payload.source?.includes("Binance Spot"))
  throw Error("No existe una secuencia Binance Spot verificable de "+period);
 if(rows.at(-1).t!==expected)throw Error("Cierre desactualizado de "+period);
 const ms=period==="4h"?H4:DAY;
 if(rows.slice(-240).some((x,i,a)=>i>0&&x.t-a[i-1].t!==ms))
  throw Error("Huecos en las últimas 240 velas "+period);
 return rows;
}
async function main(){
 const snap=JSON.parse(fs.readFileSync(path.join(ROOT,"data/tl-radar.json"),"utf8"));
 const current4h=Math.floor(Date.now()/H4)*H4-H4,currentDaily=Math.floor(Date.now()/DAY)*DAY-DAY;
 if(snap.items?.length!==50||snap.lastCandle!==current4h)throw Error("Top50 no corresponde al último cierre 4H");
 const symbols=[...new Set(snap.items.filter(x=>
  ["signal","watch","blocked","bear","position"].includes(x.status)&&
  /^[A-Z0-9]{2,24}$/.test(x.symbol)).map(x=>x.symbol+"USDT"))];
 if(!symbols.includes("BTCUSDT")||!symbols.includes("ETHUSDT"))
  throw Error("BTC/ETH no están presentes en el Top50 spot para emitir gráficos");
 const output=path.join(ROOT,"data/market"),now=Date.now(),errors=[];
 const result=new Map();let index=0;
 async function worker(){
  while(index<symbols.length){
   const symbol=symbols[index++];
   try{
    const h4=await D.history(symbol,"4h",Math.floor(now/H4)*H4-200*DAY);
    const d1=await D.history(symbol,"1d",Math.floor(now/DAY)*DAY-900*DAY);
    const b4=check(h4,"4h",current4h),b1=check(d1,"1d",currentDaily);
    result.set(symbol,[{period:"4h",bars:b4,source:h4.source},{period:"1d",bars:b1,source:d1.source}]);
    console.log("CANDLE_SNAPSHOT",symbol,b4.length,b1.length);
   }catch(e){errors.push({symbol,error:String(e.message||e)});console.log("CANDLE_MISSING",symbol,String(e.message||e));}
  }
 }
 await Promise.all(Array.from({length:3},worker));
 if(Math.floor(Date.now()/H4)*H4-H4!==current4h)throw Error("El cierre cambió durante descarga; no publicar snapshots mezclados");
 if(!result.has("BTCUSDT")||!result.has("ETHUSDT"))
  throw Error("No fue posible verificar BTC/ETH: "+JSON.stringify(errors));
 fs.mkdirSync(output,{recursive:true});
 for(const [symbol,items]of result)for(const payload of items){
  const target=path.join(output,symbol+"-"+payload.period+".json");
  fs.writeFileSync(target,JSON.stringify({
   version:1,symbol,period:payload.period,source:payload.source,
   generatedAt:new Date().toISOString(),lastCandle:payload.bars.at(-1).t,bars:payload.bars
  })+"\n");
 }
 const indexData={version:1,generatedAt:new Date().toISOString(),lastCandle:current4h,
  from:"Binance Spot historical candle endpoint via GitHub Actions",
  count:symbols.length,published:result.size,
  symbols:symbols.map(symbol=>({symbol,ready:result.has(symbol),
   error:errors.find(x=>x.symbol===symbol)?.error||null}))};
 fs.writeFileSync(path.join(output,"index.json"),JSON.stringify(indexData,null,2)+"\n");
 if(result.size<Math.ceil(symbols.length*.70))
  throw Error("Cobertura menor al 70%, no se publica: "+result.size+"/"+symbols.length);
 console.log("CANDLE_SUMMARY",JSON.stringify({ranked:50,spot:symbols.length,ready:result.size,errors}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={check,main};
