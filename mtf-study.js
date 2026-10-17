(async function(){
 'use strict';const $=id=>document.getElementById(id),pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—',num=v=>Number.isFinite(v)?v.toFixed(2):'—';let data;
 const add=(values)=>{const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;tr.append(td);}$('mtfRows').append(tr);};
 function render(){const win=$('mtfWindow').value;$('mtfRows').replaceChildren();for(const sym of [...data.protocol.trainingAssets,...data.protocol.heldoutAssets])for(const r of data.rows.filter(x=>x.symbol===sym&&x.window===win))add([sym+(data.protocol.heldoutAssets.includes(sym)?' · reservado':''),r.experiment,pct(r.CAGR),pct(r.MaxDD),num(r.PF),r.trades]);}
 try{
  const r=await fetch('data/mtf-study/summary.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('No se pudo cargar la hipótesis diaria publicada');data=await r.json();if(!data.completed)throw Error('No hay resultado final');
  $('mtfDecision').textContent=data.decision;
  $('mtfSelection').textContent='Variante elegida en entrenamiento: '+data.selectedOnIS+'. '+data.causality.filter(x=>x.pass).length+'/'+data.causality.length+' prefijos sin cambios al agregar datos futuros. Última ejecución: '+new Date(data.generatedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+' ARG';
  $('mtfHoldout').textContent='Activos reservados: '+Object.entries(data.heldoutPass).map(([s,pass])=>s+' '+(pass?'cumple':'no cumple')).join(' · ')+'.';
  $('mtfWindow').addEventListener('change',render);render();
 }catch(e){$('mtfDecision').textContent='RESULTADO NO DISPONIBLE';$('mtfSelection').textContent=e.message;}
})();
