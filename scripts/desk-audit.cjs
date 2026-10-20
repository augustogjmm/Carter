/* Auditable BTC/ETH historical replay of the market-only Carter Desk hypothesis.
   Uses Binance spot 4H & 1D closed candles, fixed windows; no historical order-book data. */
'use strict';
const fs=require('node:fs'),D=require('../tl-data.js'),E=require('../tl-engine.js'),R=require('../desk-replay.js');
const START=Date.UTC(2020,0,1),windows=[
 {name:'TRAIN',from:Date.UTC(2020,0,1),to:Date.UTC(2023,0,1)},
 {name:'VALIDATION',from:Date.UTC(2023,0,1),to:Date.UTC(2025,0,1)},
 {name:'TEST',from:Date.UTC(2025,0,1),to:null}
];
function compact(s){const {model,from,to,fee,slip,trades,signals,eligible,denied,winRate,pf,returnPct,maxDrawdown,totalNetClosed,openPosition,causal,limitations,samples}=s;
 return {model,from,to,fee,slip,trades,signals,eligible,denied,winRate,pf,returnPct,maxDrawdown,totalNetClosed,openPosition,causal,limitations,samples};}
async function audit(){
 const now=Date.now(),until=Math.floor(now/E.PERIOD['4h'])*E.PERIOD['4h'];
 const result={protocol:'CARTER-DESK-REPLAY-1',engine:'TL-BASE-MTF-VP-EXPERIMENTAL',
  status:'NO_APROBADA_PARA_EJECUCION_REAL',generatedAt:new Date(now).toISOString(),
  source:'Binance Spot 4H + 1D closed candles; public OHLCV only',
  params:{capital:1000,fee:.001,slip:.0005,risk:.01,maxAssetExposure:.20,minR:1.5,maxStopDistance:.08,
    maxEntryChaseATR:.45,profileBars:360,profileBins:64},
  limitations:['No historical L2 order book, spread, minNotional history or provider latency',
   'Projected volume profile from OHLCV is not a true tick/trade price profile',
   'Next-bar-open fills approximate a live LIMIT entry and do not prove execution'],
  records:[],error:null};
 for(const symbol of ['BTCUSDT','ETHUSDT']){
  try{
   const [four,daily]=await Promise.all([D.history(symbol,'4h',START),D.history(symbol,'1d',START)]);
   if(four.source.indexOf('Binance')<0||daily.source.indexOf('Binance')<0)
     throw Error('El respaldo de otro exchange no cumple la auditoría Binance Spot');
   const w={};for(const scope of windows){
    const options={from:scope.from,to:scope.to||until,capital:1000,fee:.001,slip:.0005};
    w[scope.name]=compact(R.replay(four.bars,daily.bars,options));
   }
   const stress=compact(R.replay(four.bars,daily.bars,{from:Date.UTC(2025,0,1),to:until,capital:1000,fee:.002,slip:.001}));
   const verdict=R.judge(w.TEST,stress);
   result.records.push({symbol,source4h:four.source,source1d:daily.source,candles4h:four.bars.length,
    candles1d:daily.bars.length,gaps4h:four.gaps,gaps1d:daily.gaps,
    windows:w,stress,verdict});
  }catch(e){result.records.push({symbol,status:'SIN_DATOS',error:String(e.message||e)});}
 }
 if(result.records.some(x=>x.status==='SIN_DATOS'))result.status='AUDITORIA_INCOMPLETA_DATOS';
 const path='data/desk-audit/summary.json';
 fs.mkdirSync('data/desk-audit',{recursive:true});
 fs.writeFileSync(path,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,records:result.records.map(x=>({symbol:x.symbol,
  tradesOOS:x.windows?.TEST?.trades,PF:x.windows?.TEST?.pf,returnPct:x.windows?.TEST?.returnPct,
  result:x.verdict?.verdict||x.status,error:x.error||null}))},null,2));
 return result;
}
if(require.main===module)audit().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={audit};
