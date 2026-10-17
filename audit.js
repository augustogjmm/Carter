(async function(){
 'use strict';
 const $=id=>document.getElementById(id),pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—';
 try{
  const response=await fetch('data/audit/summary.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('No se pudo cargar el resultado publicado');const r=await response.json();
  if(!r.completed)throw Error('No hay un dictamen final publicado');
  $('auditVerdict').textContent=r.verdict;
  $('auditAt').textContent='Ejecutada: '+new Date(r.generatedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+' ARG';
  $('auditSummary').textContent=r.experiments+' pruebas tabuladas · '+r.datasets+' series reales · '+Object.values(r.criteria).filter(Boolean).length+'/10 criterios superados. Auditoría completada; rentabilidad no aprobada cuando el dictamen es RECHAZADA.';
  for(const row of r.spotBase||[]){const tr=document.createElement('tr');for(const value of [row.symbol,row.window,pct(row.CAGR),pct(row.MaxDD),Number.isFinite(row.PF)?row.PF.toFixed(2):'—',row.trades]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('auditBase').append(tr);}
  for(const [key,pass] of Object.entries(r.criteria)){const p=document.createElement('p');p.textContent=key+' · '+(pass?'PASS':'FAIL');p.className=pass?'pcs-pass':'pcs-fail';$('auditCriteria').append(p);}
  $('auditData').textContent=r.datasets+' series descargadas. '+r.dataQualityFailures+' series con huecos históricos declarados. '+r.downloadFailures.length+' fallas de descarga. Consulte fingerprint y el informe para los tramos exactos.';
 }catch(e){$('auditVerdict').textContent='RESULTADO NO DISPONIBLE';$('auditSummary').textContent=e.message;}
})();
