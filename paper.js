(async function(){
 'use strict';const $=id=>document.getElementById(id),pct=v=>Number.isFinite(v)?(100*v).toFixed(2)+'%':'—',dt=t=>new Date(t).toISOString().slice(0,16).replace('T',' ');let data;
 function add(root,values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;tr.append(td);}root.append(tr);}
 function render(){const chosen=$('paperModel').value;$('paperRows').replaceChildren();$('paperEvents').replaceChildren();
  for(const row of data.accounts.filter(x=>x.model===chosen))add($('paperRows'),[row.model,row.symbol,row.equity.toFixed(2)+' USDT',pct(row.return),row.closed,pct(row.winRate),row.open?'LONG · entrada '+row.position.entry.toFixed(4):'SIN POSICIÓN']);
  const events=data.events.filter(x=>x.model===chosen).slice(-20).reverse();
  for(const event of events)add($('paperEvents'),[event.kind,event.symbol+' / '+event.model,dt(event.time),dt(event.recordedAt)+(event.reconstructed?' · reconstruida':''),event.price.toFixed(5),event.reason||'APERTURA SIGUIENTE']);
  if(!events.length)add($('paperEvents'),['Sin operaciones posteriores al inicio para este modelo','—','—','—','—','—']);
 }
 try{
  const r=await fetch('data/paper/summary.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Registro prospectivo no disponible');data=await r.json();if(data.mode!=='PAPER_ONLY')throw Error('Modo de registro inválido');
  $('paperStatus').textContent=data.status+' · '+data.accounts.length+' cuentas teóricas · '+data.totalEvents+' eventos. Última actualización: '+new Date(data.generatedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+' ARG';
  $('paperStart').textContent='Inicio fijo: '+new Date(data.startAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+' ARG. Las señales anteriores se excluyen.';
  for(const model of [...new Set(data.accounts.map(x=>x.model))]){const option=document.createElement('option');option.value=model;option.textContent=model;$('paperModel').append(option);}
  $('paperModel').addEventListener('change',render);render();
 }catch(e){$('paperStatus').textContent=e.message;}
})();
