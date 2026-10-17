(async function(){
 'use strict';const $=id=>document.getElementById(id),pct=v=>Number.isFinite(v)?(100*v).toFixed(2)+'%':'—',number=v=>Number.isFinite(v)?v.toFixed(2):'—';let data;
 const row=(root,values)=>{const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}root.append(tr);};
 function render(){
  const win=$('reviewWindow').value;$('reviewRows').replaceChildren();
  $('reviewCost').textContent=win==='STRESS'?'Costo por fill: 0,20% equivalente, con comisión y un estrés adicional de deslizamiento. No es una tarifa real garantizada.':'Comisión: 0,10% por fill. Riesgo inicial 1% y exposición máxima 1×, incluida la comisión de entrada.';
  for(const model of [...data.protocol.models,{id:'B&H'},{id:'DCA'}])for(const x of data.rows.filter(r=>r.experiment===model.id&&r.window===win))row($('reviewRows'),[model.id+(model.id===data.selectedOnIS?' · elegido en IS':''),x.symbol,pct(x.CAGR),pct(x.MaxDD),number(x.Calmar),number(x.PF),x.trades]);
 }
 try{
  const response=await fetch('data/review/summary.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('No se pudo cargar la comparación publicada');data=await response.json();if(!data.completed)throw Error('La comparación no contiene una decisión final');
  $('reviewDecision').textContent=data.eligibleForPromotion?'CANDIDATO RETROSPECTIVO IDENTIFICADO':'SIN REEMPLAZO QUE SUPERE LOS CONTROLES';
  $('reviewAt').textContent=new Date(data.generatedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+' ARG';
  $('reviewReason').textContent=data.decision+'. PCS conserva sus reglas y su dictamen original.';
  $('reviewSelection').textContent='Elegido usando solo 2020–2022: '+data.selectedOnIS+'. Regla: mayor Calmar mínimo entre BTC y ETH. No se reelige por los resultados posteriores.';
  $('reviewCausal').textContent='Causalidad de los modelos: '+data.causality.filter(x=>x.prefixInvariant).length+'/'+data.causality.length+' prefijos reales invariantes. Esta prueba es distinta de la rentabilidad al retrasar una entrada.';
  const gateLabels={originalPerformance:'Revisión 2023–2026',recent:'Período reciente',costStress:'Costos altos'};
  for(const [symbol,gates] of Object.entries(data.gates[data.selectedOnIS])){const p=document.createElement('p');p.textContent=symbol+' · '+Object.entries(gates).map(([k,v])=>gateLabels[k]+': '+(v?'cumple':'no cumple')).join(' · ');$('reviewGates').append(p);}
  for(const symbol of data.protocol.assets){const wf=data.rows.filter(x=>x.symbol===symbol&&x.experiment===data.selectedOnIS&&x.window==='WF'),rr=wf.map(x=>x.return_total).filter(Number.isFinite).sort((a,b)=>a-b),m=rr.length?rr.length%2?rr[(rr.length-1)/2]:(rr[rr.length/2-1]+rr[rr.length/2])/2:NaN,b=data.bootstrap.find(x=>x.symbol===symbol&&x.model===data.selectedOnIS);row($('reviewRobustness'),[symbol,rr.filter(x=>x>0).length+'/'+rr.length,pct(m),pct(rr[0]),pct(b?.p95DD),number(b?.p05Multiple)]);}
  for(const model of data.protocol.models){const p=document.createElement('p');p.textContent=model.id+': '+model.definition;$('reviewDefinitions').append(p);}
  $('reviewWindow').addEventListener('change',render);render();
 }catch(e){$('reviewDecision').textContent='COMPARACIÓN NO DISPONIBLE';$('reviewReason').textContent=e.message;}
})();
