/* Carter Desk scheduled eligibility pass. Uses TL scanner's complete 50-ranked closed-candle snapshot.
   Publishes ONLY public-market hypotheses; never customer account data or fills. */
'use strict';
const fs=require('node:fs'),E=require('../tl-engine.js'),D=require('../tl-data.js'),G=require('../desk-engine.js');
const {normalize}=require('../api/desk-quote.js'),DAY=86400000,H4=14400000;
async function quote(symbol){
 const hosts=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
 let last;
 for(const host of hosts){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),9000),qs='symbol='+encodeURIComponent(symbol);
  try{const paths=['/api/v3/ticker/bookTicker?','/api/v3/ticker/24hr?','/api/v3/exchangeInfo?'];
   const result=await Promise.all(paths.map(async p=>{const r=await fetch(host+p+qs,{signal:ac.signal});if(!r.ok)throw Error('Binance '+r.status);return r.json();}));
   return normalize(...result);
  }catch(e){last=e;}finally{clearTimeout(timer);}
 }
 throw last||Error('Sin quote');
}
function baseRow(x){return{rank:x.rank,symbol:x.symbol,name:x.name,lastCandle:x.lastCandle||null,status:'ESPERAR',
 reason:x.reason||'Sin disparador TL-BASE en la última vela cerrada'};}
async function main(){
 const expected=Math.floor(Date.now()/H4)*H4-H4;
 const snap=JSON.parse(fs.readFileSync('data/tl-radar.json','utf8'));
 if(snap.items?.length!==50||snap.lastCandle!==expected||snap.version!==E.version)throw Error('Escaneo TL-BASE obsoleto: no se publican oportunidades');
 const items=snap.items.map(baseRow),ids=new Set();
 if(items.some(x=>!Number.isInteger(x.rank)||!x.symbol||ids.has(x.rank)||!(ids.add(x.rank))))
  throw Error('Top50 inconsistente');
 let checked=0;
 for(let i=0;i<items.length;i++){
  const row=snap.items[i],out=items[i];
  if(!((row.status==='signal'&&row.signal)||row.status==='position')){out.status=({watch:'VIGILAR',error:'SIN_DATOS',excluded:'EXCLUIDO',missing:'SIN_PAR',position:'POSICION_SIMULADA',bear:'DETERIORO'}[row.status]||'ESPERAR');continue;}
  try{
   const symbol=row.symbol+'USDT';
   const [h4,daily,q]=await Promise.all([
    D.history(symbol,'4h',Date.now()-200*DAY),
    D.history(symbol,'1d',Date.now()-900*DAY),
    quote(symbol)
   ]);
   const profile=E.profile(h4.bars.slice(-360),64);
   const result=G.decide({bars4h:h4.bars,bars1d:daily.bars,quote:q,profile,capital:1000,engine:E});
   out.status=result.status;out.reason=result.reason;out.code=result.code;
   out.ticket=result.ticket||null;out.context=result.context||null;
   out.source=h4.source;checked++;
  }catch(e){out.status='SIN_DATOS';out.reason='Elegibilidad no validada: '+String(e.message||e);}
 }
 if(Math.floor(Date.now()/H4)*H4-H4!==expected)throw Error('Cierre cambiado durante el escaneo');
 const result={engine:G.version,strategy:'TL-BASE-MTF-VP-EXPERIMENTAL',audited:false,
  generatedAt:new Date().toISOString(),lastCandle:expected,rankCount:50,eligibleChecked:checked,
  candidates:items.filter(x=>x.status==='CANDIDATO').length,
  items};
 fs.mkdirSync('data',{recursive:true});
 fs.writeFileSync('data/desk-opportunities.json',JSON.stringify(result,null,2)+'\n');
 console.log('CARTER DESK',JSON.stringify({count:items.length,checked,candidates:result.candidates,generatedAt:result.generatedAt}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main,baseRow,quote};