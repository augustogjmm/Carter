/* Run the application's actual indicator and historical-audit code, unchanged.
 * Diagnostic in net R only: not a portfolio backtest or promotion decision. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..');
const context={window:{},console};vm.createContext(context);
const hashes={};for(const name of ['engine.js','research.js']){const source=fs.readFileSync(`${root}/${name}`,'utf8');hashes[name]=crypto.createHash('sha256').update(source).digest('hex');vm.runInContext(source,context);}
const CE=context.window.CarterEngine,CA=context.window.CarterAudit;
const datasets=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),rows=[],causality=[];
const windows=[['TRAIN','2020-01-01','2023-01-01'],['VALIDATION','2023-01-01','2025-01-01'],['RECENT','2025-01-01',null],['OOS_REVIEW','2023-01-01',null]];
for(const {symbol,candles:c} of datasets){
 const s=CE.indicators(c,25,true);s.__auditAdx=true;
 for(const n of [500,1500,5000,c.length-2,c.length]){
  const p=CE.indicators(c.slice(0,n),25,true);
  for(const key of ['signal','fire','trend','momentumOK','adxOK']){
   const pass=Array.from(p[key]).every((v,i)=>v===s[key][i]);
   if(!pass)throw Error(`Prefix mismatch ${symbol} ${key} ${n}`);
   causality.push({symbol,bars:n,field:key,pass});
  }
 }
 for(const [window,from,to] of windows){
  const start=Math.max(0,c.findIndex(x=>x.t>=Date.parse(from+'T00:00:00Z')));
  const index=to?c.findIndex(x=>x.t>=Date.parse(to+'T00:00:00Z')):-1,end=index<0?c.length:index;
  for(const model of ['base','filtered','staged']){
   const result=CA.evaluate(c,s,0,model,start,end,{useADX:true,includeTrades:true});
   rows.push({symbol,window,model,...result});
  }
 }
 console.error('Carter actual completed',symbol);
}
fs.writeFileSync(process.argv[3],JSON.stringify({completed:true,generatedAt:new Date().toISOString(),hashes,rows,causality,decision:'DIAGNÓSTICO DEL CÓDIGO REAL; NO ES APROBACIÓN PARA OPERAR',limitations:['Resultados en R del simulador existente, no CAGR ni drawdown de una cartera.','Comisión 0,1% por lado; sin slippage, gaps de ejecución ni financiación.','Los filtros del motor son exactos; el modelo escalonado histórico es la aproximación documentada en research.js, no una reproducción de cada decisión discrecional del plan visual.','BTC/ETH ya fueron examinados en estudios anteriores; esto no es una validación ciega nueva.','No se elige un ganador sobre los períodos posteriores ni se cambia PCS.','Se excluyen 25 velas finales de cada ventana para evitar operaciones truncadas; una posición por modelo y activo.']},null,2));
