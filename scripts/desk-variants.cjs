/* Training/validation research matrix. Intentionally NO 2025+ claims or model promotion. */
'use strict';
const fs=require('node:fs'),D=require('../tl-data.js'),R=require('../desk-replay.js');
const START=Date.UTC(2020,0,1),TRAIN={from:START,to:Date.UTC(2023,0,1)},
 VALIDATION={from:Date.UTC(2023,0,1),to:Date.UTC(2025,0,1)};
const modes=['strict','buffer','observe'],lookbacks=[120,240,360];
const cut=result=>({trades:result.trades,signals:result.signals,eligible:result.eligible,denied:result.denied,
 pf:result.pf,returnPct:result.returnPct,maxDrawdown:result.maxDrawdown,
 causal:result.causal,vetoCounts:result.vetoCounts});
async function main(){
 const bars={};
 const output={protocol:'DESK-PROFILE-RESEARCH-1',generatedAt:new Date().toISOString(),
  model:'TL-BASE-MTF-VP-CARTER',status:'EXPLORATORIA_SIN_PROMOCION',
  knownTestDisclosure:'Los resultados 2025–2026 de la estrategia base ya fueron observados antes de este experimento. NO constituyen OOS ciega para elegir variantes.',
  guardrails:['Solo usa 2020–2022 entrenamiento y 2023–2024 validación para esta matriz',
   'No cambia el radar ni los tickets en producción','No compara fillability L2: datos históricos solo OHLCV',
   'Una variante que da más operaciones no equivale a ventaja económica comprobada'],
  windows:{TRAIN,VALIDATION},records:[],failures:[]};
 for(const symbol of ['BTCUSDT','ETHUSDT']){
  try{const [four,daily]=await Promise.all([D.history(symbol,'4h',START),D.history(symbol,'1d',START)]);
   if(!four.source.includes('Binance')||!daily.source.includes('Binance'))throw Error('Histórico no procede de Binance');
   bars[symbol]={b4:four.bars,d1:daily.bars,gaps4h:four.gaps,gapsDaily:daily.gaps};
  }catch(e){output.failures.push({symbol,error:String(e.message||e)});}
 }
 if(Object.keys(bars).length===2){
  for(const profileBars of lookbacks)for(const volumePolicy of modes){
   const variant={id:profileBars+'B-'+volumePolicy,profileBars,volumePolicy,results:{},qualifiedOnPastData:false};
   for(const symbol of ['BTCUSDT','ETHUSDT']){
    const {b4,d1}=bars[symbol],res={};for(const [name,period] of Object.entries({TRAIN,VALIDATION})){
     res[name]=cut(R.replay(b4,d1,{...period,profileBars,volumePolicy,capital:1000,fee:.001,slip:.0005}));
    }
    variant.results[symbol]=res;
   }
   variant.qualifiedOnPastData=['BTCUSDT','ETHUSDT'].every(symbol=>['TRAIN','VALIDATION'].every(scope=>{
    const r=variant.results[symbol][scope];return r.trades>=30&&r.pf>1.2&&r.returnPct>0&&r.maxDrawdown<.25&&r.causal;
   }));
   output.records.push(variant);
  }
  output.status=output.records.some(x=>x.qualifiedOnPastData)?
    'HISTORICAMENTE_CANDIDATA_NO_PROMOVIDA':'NINGUNA_VARIANTE_CUMPLE_CONTROLES';
 }else output.status='DATOS_INSUFICIENTES';
 fs.mkdirSync('data/desk-variants',{recursive:true});
 fs.writeFileSync('data/desk-variants/summary.json',JSON.stringify(output,null,2)+'\n');
 console.log('VARIANT RESEARCH',JSON.stringify({status:output.status,entries:output.records.length,
  qualified:output.records.filter(x=>x.qualifiedOnPastData).map(x=>x.id),failures:output.failures,
  samples:output.records.map(x=>({id:x.id,bTCtest:x.results.BTCUSDT?.VALIDATION?.trades,eTHtest:x.results.ETHUSDT?.VALIDATION?.trades}))}));
 return output;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
