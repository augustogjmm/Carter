/* Dedicated scheduled TL scan; preserves ranking rows, no fabricated green signals. */
'use strict';
function classifyGate(reason){return /^(Stablecoin|Activo envuelto|Símbolo ambiguo)/.test(reason)?'excluded':'missing';}
const fs=require('node:fs'),e=require('../tl-engine.js'),d=require('../tl-data.js');
async function main(){
 const slot=Math.floor(Date.now()/e.PERIOD['4h']),expected=(slot-1)*e.PERIOD['4h'];
 const ranked=await d.rank(),markets=await d.exchange(),counts=new Map();
 for(const x of ranked.coins)counts.set(x.symbol,(counts.get(x.symbol)||0)+1);
 const duplicates=new Set([...counts].filter(([,n])=>n>1).map(([s])=>s));
 const items=ranked.coins.map(c=>({...c,status:'queued',reason:'En cola',source:null}));
 for(const item of items){const reason=d.gate(item,markets,duplicates);if(reason){item.status=classifyGate(reason);item.reason=reason;}}
 let next=0;
 async function worker(){while(next<items.length){const item=items[next++];if(item.status!=='queued')continue;
 try{Object.assign(item,d.classify(await d.history(item.symbol+'USDT','4h')));}catch(err){item.status='error';item.reason=String(err.message||err);}
 console.log(item.rank,item.symbol,item.status,item.reason);
 }}
 await Promise.all(Array.from({length:3},worker));
 if(Math.floor(Date.now()/e.PERIOD['4h'])!==slot)throw Error('Cierre cambió durante análisis: no se publica un snapshot obsoleto');
 const analyzed=items.filter(x=>['signal','watch','blocked','bear','position'].includes(x.status)).length;
 if(analyzed===0)throw Error('Cero activos analizados: snapshot rechazado');
 const snapshot={version:e.version,source:'CoinGecko + Binance Spot',generatedAt:new Date().toISOString(),lastCandle:expected,marketAt:ranked.fetchedAt,
 count:50,analyzed,items};
 fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/tl-radar.json',JSON.stringify(snapshot,null,2)+'\n');
 console.log('TL RESULT',JSON.stringify({rows:items.length,analyzed,signals:items.filter(x=>x.status==='signal').length,
 errors:items.filter(x=>x.status==='error').length,excluded:items.filter(x=>['missing','excluded'].includes(x.status)).length}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main,classifyGate};