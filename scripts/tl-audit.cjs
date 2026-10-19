/* TL independently evaluated by frozen criteria; never marks historical edge without data. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),E=require('../tl-engine.js'),D=require('../tl-data.js');
const ranges=[['TRAIN',Date.UTC(2020,0,1),Date.UTC(2022,11,31,23,59,59,999)],
 ['VALIDATION',Date.UTC(2023,0,1),Date.UTC(2024,11,31,23,59,59,999)],
 ['TEST',Date.UTC(2025,0,1),Infinity]];
const minTrades=30,passPF=1.20,maxDD=.25;
function checkCausal(b,period){const s=E.indicators(b,period),idxs=[210,350,500,Math.floor(b.length*.7),b.length-10].filter(i=>i>205&&i<b.length);
 for(const i of idxs){const p=E.indicators(b.slice(0,i+1),period);
  for(const field of ['ema10','ema55','adx','momentum','long','bear'])if(!Object.is(s[field][i],p[field][i]))throw Error('Causalidad violada '+field+' '+i);
 }return idxs.length;
}
function evaluate(b,s,start,end,fee=.001,slip=.0005){const r=E.backtest(b,s,{from:start,to:end,fee,slip}),m=E.stats(r);
 const maxProfit=r.orders.reduce((acc,v)=>Math.max(acc,v.pnl),0);
 const profits=r.orders.reduce((acc,v)=>acc+Math.max(0,v.pnl),0);
 return {...m,largestWinShare:profits?maxProfit/profits:null,capital:r.capital,closed:r.orders.length};}
async function main(){
 const result={protocol:'TL-AUDIT-1',runAt:new Date().toISOString(),formulaVersion:E.version,
 criteria:{minTradesOOS:minTrades,profitFactorGreaterThan:passPF,netReturnPositive:true,maxDrawdownLessThan:maxDD,
 doubledCostsPositive:true,largestWinnerBelowHalfOfGrossWinningPnL:true,zeroLookahead:true,fullData:true},
 records:[],status:'EVIDENCIA INSUFICIENTE'};
 for(const symbol of ['BTCUSDT','ETHUSDT'])for(const period of ['1h','4h','1d']){
  const row={symbol,period};
  try{const raw=await D.history(symbol,period),b=raw.bars,s=E.indicators(b,period);
   row.provider=raw.source;row.candles=b.length;row.gaps=raw.gaps;row.start=new Date(b[0].t).toISOString();
   row.end=new Date(b.at(-1).t+E.PERIOD[period]).toISOString();
   row.hash=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
   row.causalPrefixes=checkCausal(b,period);
   row.windows={};
   for(const [label,start,end] of ranges)row.windows[label]=evaluate(b,s,start,end);
   row.stress=evaluate(b,s,ranges[2][1],Infinity,.002,.001);
   const m=row.windows.TEST;
   row.gates={coverage:raw.gaps===0,causal:row.causalPrefixes>=3,sample:m.trades>=minTrades,
    pf:m.pf>passPF,return:m.returnPct>0,drawdown:m.drawdown<maxDD,stress:row.stress.returnPct>0,
    notOneTrade:m.largestWinShare!==null&&m.largestWinShare<.5};
   row.verdict=!row.gates.coverage?'DATOS INVÁLIDOS':!row.gates.causal?'FAIL':
    !row.gates.sample?'EVIDENCIA INSUFICIENTE':Object.values(row.gates).every(Boolean)?'PASS':'FAIL';
  }catch(e){row.verdict='DATOS INVÁLIDOS';row.error=String(e.message||e);}
  result.records.push(row);console.log('TL_AUDIT_RECORD '+JSON.stringify(row));
 }
 const principals=result.records.filter(x=>x.period==='4h');
 result.status=principals.some(x=>x.verdict==='DATOS INVÁLIDOS')?'DATOS INVÁLIDOS':
 principals.some(x=>x.verdict==='FAIL')?'FAIL':principals.every(x=>x.verdict==='PASS')?'PASS':'EVIDENCIA INSUFICIENTE';
 fs.mkdirSync('data/tl-audit',{recursive:true});
 fs.writeFileSync('data/tl-audit/summary.json',JSON.stringify(result,null,2)+'\n');
 console.log('TL_AUDIT_FINAL '+JSON.stringify({status:result.status,records:result.records.length,pass:result.records.filter(x=>x.verdict==='PASS').length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});