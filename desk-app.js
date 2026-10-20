/* Carter Trading Desk — real-data interface. No exchange order submission. */
(function(){
"use strict";
const E=window.TLEngine,D=window.TLData,G=window.CarterDeskEngine,J=window.CarterJournal,M=window.CarterPositionMonitor,S=window.CarterScenario,P=window.CarterPaper,C=window.CarterChart,H=window.CarterHoldingLevels,BQ=window.CarterBrowserQuote;
const $=id=>document.getElementById(id),fmt=(n,p=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:p}):'—';
const price=n=>fmt(n,Number.isFinite(n)&&n<1?7:n<100?4:2);
const utc=n=>Number.isFinite(n)?new Date(n).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
const DAY=86400000,H4=14400000;
const state={symbol:'BTCUSDT',bars:[],daily:[],ind:null,profile:null,decision:null,quote:null,rows:[],candidates:[],seq:0,quotes:new Map(),monitors:new Map(),journal:null,lastPaperAt:0,alertKeys:new Set(),scenario:null,chartModel:null,zoom:96};
const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v);};
function message(msg){set('message',msg);}
function holder(el,content){el.replaceChildren();if(content){const p=document.createElement('p');p.className='placeholder';p.textContent=content;el.append(p);}}
function btn(label,symbol,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onclick=()=>load(symbol);return b;}
function validSymbol(s){return/^[A-Z0-9]{2,24}USDT$/.test(s);}
function capital(){const n=Number($('capital').value);return Number.isFinite(n)&&n>=20?n:NaN;}
function exposure(symbol){
 const p=state.journal.positions().find(x=>x.symbol===symbol);
 return (p?.basis||0)+state.journal.pending().filter(x=>x.symbol===symbol).reduce((s,x)=>s+x.notional,0);
}
function portfolioExposure(){return state.journal.positions().reduce((s,p)=>s+p.basis,0)+state.journal.pending().reduce((s,p)=>s+p.notional,0);}
function portfolioRisk(){
 const orders=state.journal.orders(),positions=state.journal.positions();
 const held=positions.reduce((sum,p)=>{
  if(p.quantity<=0)return sum;
  const perUnit=Math.max(0,...orders.filter(o=>o.symbol===p.symbol&&o.filledQty>0).map(o=>(o.ticket?.riskUSDT||0)/o.qty));
  return sum+p.quantity*perUnit;
 },0);
 return held+state.journal.pending().reduce((sum,p)=>sum+p.risk,0);
}
function notifyIfNew(symbol,key,msg){
 const eventKey=symbol+':'+key;
 if(state.alertKeys.has(eventKey))return;
 state.alertKeys.add(eventKey);message(msg);
 if('Notification' in window&&Notification.permission==='granted'){try{new Notification('Carter Trading Desk',{body:msg,tag:eventKey});}catch(e){}}
}
function renderJournal(){
 state.journal.expire();
 const os=state.journal.orders().filter(o=>['PREPARED','SUBMITTED','PARTIAL'].includes(o.status)),sel=$('orderSelect');
 const overview=$('orderOverview');overview.replaceChildren();
 for(const o of os){
  const row=document.createElement('div');row.className='watch-item';
  const label=document.createElement('span');label.textContent=o.symbol+' · '+o.status+' · '+fmt(o.qty-o.filledQty,8)+' por confirmar';
  row.append(label);
  const actions=document.createElement('div');actions.className='selectline';
  if(o.status==='PREPARED'){
   const submit=document.createElement('button');submit.type='button';submit.textContent='Marcar enviada';
   submit.onclick=()=>{try{state.journal.setSubmitted(o.id);message('Estado manual ENVIADA. No se transmitió ninguna orden.');renderJournal();}catch(e){message(e.message);}};
   actions.append(submit);
  }
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Registrar cancelación';
  cancel.onclick=()=>{if(!window.confirm('¿Confirmás que la orden '+o.id+' está cancelada externamente? Carter no puede verificarlo.'))return;
   try{state.journal.cancel(o.id);message('Cancelación registrada manualmente.');renderJournal();}catch(e){message(e.message);}};
  actions.append(cancel);row.append(actions);overview.append(row);
 }
 if(!os.length){const p=document.createElement('p');p.className='support';p.textContent='Sin órdenes pendientes. Preparar un ticket no envía nada a Binance.';overview.append(p);}
 sel.replaceChildren();let opt=document.createElement('option');opt.value='';opt.textContent=os.length?'Elegir orden…':'Sin órdenes preparadas';sel.append(opt);
 for(const o of os){opt=document.createElement('option');opt.value=o.id;opt.textContent=o.symbol+' · '+o.status+' · '+fmt(o.qty-o.filledQty,6)+' pendientes';sel.append(opt);}
 const positions=state.journal.positions().filter(x=>x.quantity>1e-10),sell=$('sellSymbol');sell.replaceChildren();opt=document.createElement('option');opt.value='';opt.textContent=positions.length?'Elegir posición…':'Sin posiciones';sell.append(opt);
 for(const p of positions){opt=document.createElement('option');opt.value=p.symbol;opt.textContent=p.symbol+' · '+fmt(p.quantity,8);sell.append(opt);}
 set('nPositions',positions.length);renderPositions();if(state.bars.length&&state.ind)drawChart();
}
async function getQuote(symbol){
 // Browser in Argentina may reach Binance when Cloudflare receives HTTP 451.
 // Never replace an execution quote with a candle close or a different venue.
 const [direct,edge]=await Promise.allSettled([
  BQ.quote(symbol,{timeout:5000}),
  (async()=>{
   const r=await fetch('/api/desk-quote?symbol='+encodeURIComponent(symbol),{
    cache:'no-store',signal:AbortSignal.timeout(11500)});
   const q=await r.json();if(!r.ok)throw Error(q.detail||q.error||'Sin cotización');
   return q;
  })()
 ]);
 const q=direct.status==='fulfilled'?direct.value:edge.status==='fulfilled'?edge.value:null;
 if(!q)throw Error('Sin cotización Binance: navegador '+String(direct.reason?.message||'falló')+
  '; servidor '+String(edge.reason?.message||'falló'));
 state.quotes.set(symbol,q);return q;
}
async function refreshPositionQuotes(){
 const holdings=state.journal.positions().filter(p=>p.quantity>1e-10),symbols=holdings.map(p=>p.symbol);
 let next=0;
 async function worker(){
  while(next<symbols.length){
   const symbol=symbols[next++],position=holdings.find(p=>p.symbol===symbol);
   let quote=state.quotes.get(symbol),bars4h=null;
   try{quote=await getQuote(symbol);}catch(e){if(!quote||Date.now()-quote.asOf>90000)quote=null;}
   try{const h=await D.history(symbol,'4h',Math.floor(Date.now()/H4)*H4-200*DAY);bars4h=h.bars;}catch(e){}
   const linked=H.current(symbol,holdings,state.journal.orders(),state.journal.fills());
   state.monitors.set(symbol,M.watch({position,quote,bars4h,engine:E,
    levels:{stop:linked?.stop??null,target:linked?.target??null}}));
  }
 }
 await Promise.allSettled(Array.from({length:Math.min(3,symbols.length)},worker));renderPositions();
}
function renderScenario(value){
 set('scenarioStatus',value.status);
 set('scenarioReason',value.reason);
 const exists=value.status==='ESCENARIO_CONDICIONAL'&&Number.isFinite(value.trigger);
 if(!exists){
  $('scenarioPrices').hidden=true;
  for(const id of ['scenarioTrigger','scenarioStop','scenarioTarget','scenarioR'])set(id,'—');
  set('scenarioConditions',value.reason+' · No habilita compra.');return;
 }
 set('scenarioTrigger',price(value.trigger));set('scenarioStop',price(value.stop));
 set('scenarioTarget',price(value.target));set('scenarioR',Number.isFinite(value.netR)?fmt(value.netR,2)+' R bruto':'SIN NIVEL');
 $('scenarioPrices').hidden=false;
 set('scenarioConditions',value.conditions.join(' · ')+'. '+value.triggerRule+
   (value.riskWarning?' ADVERTENCIA: '+value.riskWarning:''));
}
async function loadPaper(){
 try{
  const response=await fetch('/data/paper/summary.json?'+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Archivo prospectivo no disponible');
  const summary=P.inspect(await response.json());
  state.lastPaperAt=Date.now();
  set('paperStatus',summary.status);
  set('paperDetails','Último procesamiento remoto: '+utc(summary.generatedAt)+
    ' · '+summary.accounts.length+' cuentas modelo · '+summary.active+' simulaciones abiertas. El seguimiento es teórico y puede quedar atrasado.');
  const out=$('paperPositions');out.replaceChildren();
  const showing=summary.accounts.filter(a=>a.open);
  if(!showing.length){holder(out,'No hay posiciones teóricas abiertas en CARTER_RAW o LATINO. Esto no implica falta de datos.');}
  for(const p of showing){
   const box=document.createElement('article');box.className='position';
   const head=document.createElement('div');head.className='head';
   const title=document.createElement('strong');title.textContent=p.symbol+' · '+p.model;
   const tag=document.createElement('span');tag.className='chip '+(summary.stale?'warn':'');tag.textContent=summary.stale?'ATRASADO':'SIMULADA';
   head.append(title,tag);box.append(head);
   for(const line of ['Entrada simulada '+price(p.entry)+' · cantidad '+fmt(p.quantity,6),
     'Stop simulado '+price(p.stop)+' · TP1 '+price(p.tp1),
     'Marca '+price(p.markPrice)+' · patrimonio simulado '+fmt(p.equity)+' USDT']){
     const e=document.createElement('p');e.textContent=line;box.append(e);
   }
   out.append(box);
  }
  const events=summary.events.slice(0,3);
  if(events.length){const e=document.createElement('p');e.className='micro';
   e.textContent='Últimos eventos teóricos: '+events.map(v=>v.symbol+' '+v.model+' '+v.kind+' '+utc(v.time)+(v.reconstructed?' (reconstruido)':'')).join(' · ');
   out.append(e);}
 }catch(error){set('paperStatus','SIN DATOS');holder($('paperPositions'),'No hay un registro prospectivo verificable: '+error.message);}
}
function renderPositions(){
 const all=state.journal.positions().filter(x=>x.quantity>1e-10),container=$('positionList');container.replaceChildren();
 if(!all.length){holder(container,'No hay tenencias registradas. Preparar una entrada no crea una posición.');set('monitorState','SIN POSICIONES');return;}
 set('monitorState','PÁGINA ABIERTA · COTIZACIÓN PÚBLICA');
 for(const p of all){
  const q=state.quotes.get(p.symbol),fresh=q&&Date.now()-q.asOf<=90000,unreal=fresh?p.quantity*q.bid*(1-.001)-p.basis:NaN;
  const associated=H.current(p.symbol,all,state.journal.orders(),state.journal.fills());
  const stop=associated?.stop??null,target=associated?.target??null;
  const assessment=state.monitors.get(p.symbol);
  const warning=assessment?.status?.startsWith('REVISAR_')?assessment.status:'';
  if(!warning){for(const key of state.alertKeys)if(key.startsWith(p.symbol+':REVISAR_'))state.alertKeys.delete(key);}
  if(warning)notifyIfNew(p.symbol,warning,'ATENCIÓN '+p.symbol+': '+assessment.reason);
  const box=document.createElement('article');box.className='position';
  const head=document.createElement('div');head.className='head';const title=document.createElement('strong');title.textContent=p.symbol;
  const chip=document.createElement('span');chip.className='chip '+(warning?'red':assessment?.priority===3?'warn':'');chip.textContent=warning||assessment?.status||'REGISTRADA';head.append(title,chip);box.append(head);
  for(const line of [
   'Tenencia: '+fmt(p.quantity,8)+' · costo medio '+price(p.avgPrice),
   fresh?'Bid actual '+price(q.bid)+' · '+utc(q.asOf):'COTIZACIÓN NO VERIFICADA · resultado no calculable',
   'Stop de referencia '+(stop?price(stop):'—')+' · objetivo '+(target?price(target):'—'),
   'Seguimiento técnico: '+(assessment?.reason||'Pendiente de actualización'),
   'PnL realizado (historial): '+fmt(p.realized)+' USDT'
  ]){const el=document.createElement('p');el.textContent=line;box.append(el);}
  const pnl=document.createElement('div');pnl.className='pnl '+(unreal>=0?'profit':'loss');pnl.textContent=Number.isFinite(unreal)?(unreal>=0?'+':'')+fmt(unreal)+' USDT':'PnL sin cotización';box.append(pnl);container.append(box);
 }
}
function recordedHolding(symbol){
 if(!state.journal)return null;
 return H.current(symbol,state.journal.positions(),state.journal.orders(),state.journal.fills());
}
function renderOperatingPlan(model){
 const ticket=state.decision?.status==='CANDIDATO'?state.decision.ticket:null,
  candidate=state.scenario?.status==='ESCENARIO_CONDICIONAL'?state.scenario:null,
  holding=recordedHolding(state.symbol),hasPlan=!!(ticket||candidate||holding);
 set('setupName','TL-BASE · 4H (EMA / momentum / ADX)');
 set('setupVerdict',holding?'EN POSICIÓN · MANUAL':ticket?'TICKET EXPERIMENTAL':candidate?'ESCENARIO · NO COMPRAR':'NO OPERAR');
 const why=holding?'Se gestiona una tenencia registrada manualmente; Carter no conoce las órdenes reales del exchange.':
  ticket?'Disparador TL-BASE confirmado; ticket hipotético sujeto a recotización y riesgo. Rentabilidad no demostrada.':
  candidate?'No existe orden habilitada. El nivel de gatillo requiere un NUEVO cierre confirmado 4H y reevaluación completa.':
  state.decision?.reason||'No hay análisis disponible para este activo.';
 set('setupSummary',why);
 const levels=holding?{entry:holding.avgPrice,stop:holding.stop,target:holding.target,r:null}:
  ticket?{entry:ticket.entry,stop:ticket.stop,target:ticket.target,r:ticket.netR}:
  candidate?{entry:candidate.trigger,stop:candidate.stop,target:candidate.target,r:candidate.netR}:{};
 set('opEntry',price(levels.entry));set('opStop',price(levels.stop));set('opTarget',price(levels.target));
 set('opReward',Number.isFinite(levels.r)?fmt(levels.r,2)+' R'+(ticket?' neto':' bruto'):'NO CALCULABLE');
 set('opEntryNote',holding?'Costo medio confirmado por usuario':ticket?'Entrada límite teórica · no enviada':
  candidate?'Superar este nivel AL CIERRE de próxima 4H':'Sin entrada validada');
 set('opStopNote',holding?'Nivel de referencia registrado':ticket?'Stop técnico proyectado':
  candidate?'Solo condicional, sin orden':'No determinado');
 set('opTargetNote',holding?'Objetivo de referencia registrado':ticket?'Resistencia medible, no garantizada':
  candidate?'Resistencia tentativa, no TP habilitado':'Sin salida técnica validada');
 set('opRewardNote',ticket?'Supuestos de comisiones y deslizamiento':
  holding?'Consultar seguimiento de PnL':'Un R bruto no incorpora ejecución ni comisiones');
 const box=$('setupChecks');box.replaceChildren();
 const s=model?.setup,k=state.bars.length-1,part=state.ind?.parts?.[k],
       adx=state.ind?.adx?.[k],prev=state.ind?.adx?.[k-1],
       daily=state.decision?.context?.dailyBull;
 const rows=[
  ['1D · contexto comprador',typeof daily==='boolean'?daily:null],
  ['4H · EMA10 por encima EMA55',part?.valid?!!part.trend:null],
  ['4H · giro de momentum negativo',part?.valid?!!part.turn:null],
  ['ADX · caída desde al menos 23',part?.valid?!!part.weakness:null],
  ['Squeeze · '+(state.ind?.squeeze?.[k]||'—')+' (informativo)',null],
  ['Volumen · POC / VAH / VAL visibles',model?.profile?.bins?.length>0?true:null],
  ['Señal nueva TL-BASE',state.ind?.valid?.[k]===true?!!state.ind?.long?.[k]:null],
  ['Ejecución · liquidez y riesgo',ticket?true:['CAPITAL','QUOTE','PROFILE','EXPIRED','CHASE','VOLUME_ZONE','STOP','STOP_TOO_FAR','RESISTANCE','LOW_R','SIZE','MAX_QTY','DEPTH'].includes(state.decision?.code)?false:null]
 ];
 for(const [name,value] of rows){
  const line=document.createElement('span');line.className='setup-check '+(value===true?'pass':value===false?'fail':'unknown');
  line.textContent=name;box.append(line);
 }
 set('setupMethod',holding?'Gestión de posición: las líneas de costo y salida provienen solo de tus registros manuales.':
 ticket?'ENTRADA SOLO COMO HIPÓTESIS NO VALIDADA · el ticket y los niveles vencen con su señal.':
 candidate?'GATILLO CONDICIONAL: una vela futura debe cerrar por encima; el sistema NO autoriza comprar al tocar la línea.':
 'NO OPERAR: sin disparador confirmado y/o filtros satisfechos. No se dibujan órdenes inexistentes.');
 if(!hasPlan){for(const id of ['opEntry','opStop','opTarget'])set(id,'—');}
}
function drawChart(){
 if(!state.bars.length||!state.ind||!C)return;
 try{
  const model=C.build({bars:state.bars,ind:state.ind,engine:E,decision:state.decision,
   scenario:state.scenario,quote:state.quote,position:recordedHolding(state.symbol),lookback:state.zoom});
  state.chartModel=model;
  if(!C.render($('deskChart'),model))throw Error('Canvas no disponible en este navegador');
  renderOperatingPlan(model);
  set('chartLabel',model.lookback+' velas 4H cerradas · perfil visible ESTIMADO '+model.profile.bins.length+' niveles');
  set('chartFootnote','VP visible = distribución aproximada del volumen OHLCV en el rango de '+model.lookback+
   ' velas; no es volumen ejecutado por precio. POC '+price(model.profile.poc)+
   ' · VAH '+price(model.profile.vah)+' · VAL '+price(model.profile.val)+
   '. VP de filtro operativo distinto: 360 velas 4H. S sobre una vela = señal técnica histórica, NO una compra.');
 }catch(e){
  state.chartModel=null;renderOperatingPlan(null);
  set('chartLabel','SIN GRÁFICO VERIFICABLE · '+String(e.message||e));
 }
}
function showDecision(r){
 state.decision=r;const banner=$('signalBanner');banner.className='signal-banner';
 const names={CANDIDATO:'TICKET EXPERIMENTAL',ESPERAR:'ESPERAR',VIGILAR:'VIGILAR',NO_OPERABLE:'NO OPERAR',CADUCADA:'CADUCADA',SIN_DATOS:'SIN DATOS'};
 set('decision',names[r.status]||r.status);set('decisionWhy',r.reason);
 if(r.status==='CANDIDATO')banner.classList.add('good');if(['SIN_DATOS','NO_OPERABLE','CADUCADA'].includes(r.status))banner.classList.add('bad');
 set('signalTime',r.context?'Señal: '+utc(r.context.signalAt):'—');
 // A re-quote can block the ticket without reloading the asset. Invalidate its
 // visible E1/SL/TP immediately, not one minute later.
 if(r.status==='CADUCADA')state.scenario=null;
 if(state.bars?.length&&state.ind)drawChart();else renderOperatingPlan(null);
 const ticket=r.ticket;set('ticketStatus',ticket?'CANDIDATO':'BLOQUEADO');$('ticketBody').hidden=!ticket;$('ticketEmpty').hidden=!!ticket;
 if(!ticket){set('ticketEmpty',r.reason);return;}
 for(const [id,v] of [
 ['ticketEntry',price(ticket.entry)],['ticketMax',price(ticket.maxChase)],['ticketStop',price(ticket.stop)],
 ['ticketTarget',price(ticket.target)],['ticketR',fmt(ticket.netR,2)+' R'],['ticketQty',fmt(ticket.quantity,8)],
 ['ticketNotional',fmt(ticket.notional,2)+' USDT'],['ticketRisk',fmt(ticket.riskUSDT,2)+' USDT ('+fmt(ticket.riskPct*100,2)+'%)'],
 ['ticketExpiry',utc(ticket.expiresAt)]])set(id,v);
}
async function load(input){
 const symbol=String(input||'').toUpperCase().trim();
 if(!validSymbol(symbol)){message('Símbolo USDT inválido');return;}
 state.symbol=symbol;set('assetTitle',symbol);$('symbolInput').value=symbol;
 const seq=++state.seq;state.bars=[];state.daily=[];state.ind=null;state.profile=null;state.decision=null;state.quote=null;state.scenario=null;state.chartModel=null;
 renderOperatingPlan(null);
 set('decision','CARGANDO…');set('decisionWhy','Descargando velas 4H y 1D independientes, luego cotización y reglas del exchange');
 set('assetSource','Binance spot · esperando validación');set('dailyTrend','—');set('momentum','—');set('adx','—');set('volume','—');
 renderScenario({status:'VERIFICANDO',reason:'Recuperando últimos cierres confirmados'});
 set('ticketStatus','BLOQUEADO');$('ticketBody').hidden=true;$('ticketEmpty').hidden=false;set('ticketEmpty','No hay ticket hasta completar los controles');
 const cv=$('deskChart'),g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
 try{
  const [h4,d1,q]=await Promise.all([
   D.history(symbol,'4h',Math.floor(Date.now()/H4)*H4-200*DAY),
   D.history(symbol,'1d',Math.floor(Date.now()/DAY)*DAY-900*DAY),
   getQuote(symbol)
  ]);
  if(seq!==state.seq)return;
  const bars=h4.bars;state.bars=bars;state.daily=d1.bars;state.ind=E.indicators(bars,'4h');state.quote=q;
  state.profile=E.profile(bars.slice(-360),64);
  const result=G.decide({bars4h:bars,bars1d:d1.bars,quote:q,profile:state.profile,
   capital:capital(),openExposure:exposure(symbol),portfolioExposure:portfolioExposure(),openRisk:portfolioRisk(),engine:E});
  set('assetSource',h4.source+' · 4H '+bars.length+' velas · 1D '+d1.bars.length+' velas · quote '+utc(q.asOf));
  set('sourceLabel','Última cotización '+utc(q.asOf));set('dataHealth','COTIZACIÓN OK');
  const k=bars.length-1;
  set('dailyTrend',result.context?.dailyBull?'ALCISTA CONFIRMADA':result.context?'NO ALCISTA':'NO VERIFICADA');
  set('momentum',fmt(state.ind.momentum[k],4));set('adx',fmt(state.ind.adx[k],1));
  set('volume',state.profile?'POC '+price(state.profile.poc)+' · VAH '+price(state.profile.vah):'NO DISPONIBLE');
  showDecision(result);state.scenario=S.project({bars4h:bars,bars1d:d1.bars,engine:E,profile:state.profile,quote:q});renderScenario(state.scenario);drawChart();
 }catch(e){
  if(seq!==state.seq)return;
  set('dataHealth','SIN DATOS');set('assetSource','Falló validación: '+String(e.message||e));
  showDecision({status:'SIN_DATOS',reason:'No se habilita entrada: '+String(e.message||e)});
  renderScenario({status:'SIN_DATOS',reason:'Sin proyección fiable: '+String(e.message||e)});
  state.scenario=null;renderOperatingPlan(null);
  message('Error verificable en '+symbol+': '+String(e.message||e));
 }
}
function showRadar(){
 const tbody=$('radarRows');tbody.replaceChildren();
 const term=$('search').value.trim().toUpperCase(),filter=$('radarFilter').value;
 const rows=state.rows.filter(x=>(!term||String(x.symbol).includes(term)||String(x.name).toUpperCase().includes(term))&&
 (filter==='all'||(filter==='signal'?x.status==='signal':x.status==='watch')));
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='No hay activos para ese filtro';tr.append(td);tbody.append(tr);return;}
 for(const row of rows){
  const tr=document.createElement('tr');for(const v of [row.rank,row.symbol,row.status==='signal'?'SETUP 4H':row.status==='watch'?'VIGILAR':row.status,
    String(row.reason||'').slice(0,110)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}
  const td=document.createElement('td');if(!['missing','excluded','error'].includes(row.status)){td.append(btn('Analizar',row.symbol+'USDT'));}else td.textContent='—';tr.append(td);tbody.append(tr);
 }
}
function showCandidates(){
 const nowBox=$('nowList'),watch=$('watchList');nowBox.replaceChildren();watch.replaceChildren();
 const candidates=state.candidates.filter(x=>x.status==='CANDIDATO'&&x.ticket&&x.ticket.expiresAt>Date.now());
 set('nCandidates',candidates.length);set('nowCount',String(candidates.length));
 if(!candidates.length)holder(nowBox,'0 entradas habilitadas. Ninguna oportunidad vigente pasó todos los controles del escáner.');
 for(const x of candidates){
  notifyIfNew(x.symbol,'OPORTUNIDAD-'+x.ticket.signalAt,'Ticket experimental '+x.symbol+' · límite '+price(x.ticket.entry)+' · vence '+utc(x.ticket.expiresAt));
  const b=btn(x.symbol+' · Entrada '+price(x.ticket.entry)+' · Stop '+price(x.ticket.stop)+' · '+fmt(x.ticket.netR,2)+'R',x.symbol);
  b.className='opportunity';nowBox.append(b);
 }
 const list=state.rows.filter(x=>x.status==='watch'||x.status==='signal').slice(0,9);
 if(!list.length)holder(watch,'Sin setups en vigilancia según el último escaneo');
 for(const x of list){const row=document.createElement('div');row.className='watch-item';const label=document.createElement('b');label.textContent=x.symbol;row.append(label,btn(x.status==='signal'?'Validar ↗':'Revisar ↗',x.symbol+'USDT'));watch.append(row);}
}
async function loadDeskAudit(){
 try{
  const response=await fetch('/data/desk-audit/summary.json?'+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Informe histórico no publicado');
  const report=await response.json();
  if(report.protocol!=='CARTER-DESK-REPLAY-1'||!Array.isArray(report.records)||report.records.length!==2)
   throw Error('Formato del informe no verificable');
  set('deskAuditStatus',report.status==='AUDITORIA_INCOMPLETA_DATOS'?'SIN DATOS':'NO APROBADA');
  const container=$('deskAuditDetails');container.replaceChildren();
  for(const record of report.records){
   const p=document.createElement('p');p.className='support';
   const test=record.windows?.TEST,verdict=record.verdict;
   p.textContent=record.symbol+': '+(test?
    test.signals+' señales 4H · '+test.eligible+' entradas elegibles · '+test.trades+' cierres · PF '+fmt(test.pf,3)+' · retorno '+fmt(test.returnPct*100,2)+'% · '+verdict?.verdict:
    'SIN EVIDENCIA: '+String(record.error||record.status));
   container.append(p);
   if(test?.vetoCounts){const line=document.createElement('p');line.className='micro';
    line.textContent='Filtros que impidieron operar: '+Object.entries(test.vetoCounts).sort((a,b)=>b[1]-a[1]).map(([name,n])=>name.replaceAll('_',' ')+' ×'+n).join(' · ');
    container.append(line);}
  }
  const p=document.createElement('p');p.className='micro';
  p.textContent='Datos '+utc(Date.parse(report.generatedAt))+' · La reconstrucción carece de profundidad histórica y ejecución real.';
  container.append(p);
 }catch(e){
  set('deskAuditStatus','SIN EVIDENCIA');
  holder($('deskAuditDetails'),'No se pudo consultar una auditoría verificada: '+e.message);
 }
}
async function loadDeskVariants(){
 try{
  const response=await fetch('/data/desk-variants/summary.json?'+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Variantes sin resultados');
  const study=await response.json();
  if(study.protocol!=='DESK-PROFILE-RESEARCH-1'||study.records?.length!==9)throw Error('Formato de variantes inválido');
  const container=$('deskAuditDetails'),p=document.createElement('p');
  p.className='micro';
  const qualified=study.records.filter(x=>x.qualifiedOnPastData).length;
  p.textContent='Estudio de volumen: 9 variantes (120/240/360 velas × tres políticas), '+qualified+
    ' cumplieron criterios históricos completos. Ninguna modificación fue promovida a las entradas de producción.';
  container.append(p);
 }catch(e){/* Main audit remains independently visible when optional research is missing. */}
}
async function loadRadar(){
 try{
  const r=await fetch('/data/tl-radar.json?'+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const snap=await r.json(),expected=Math.floor(Date.now()/H4)*H4-H4;
  if(snap.items?.length!==50||snap.version!==E.version)throw Error('Snapshot incompleto o incompatible');
  const isCurrent=snap.lastCandle===expected;
  state.rows=snap.items;
  set('nScanned','50 / 50');set('radarAge',snap.analyzed+' activos analizables · '+(isCurrent?'cierre ':'CIERRE ANTERIOR ')+utc(snap.lastCandle+H4));showRadar();
  let desk;
  try{const d=await fetch('/data/desk-opportunities.json?'+Date.now(),{cache:'no-store'});if(d.ok)desk=await d.json();}catch(e){}
  if(isCurrent&&desk?.engine===G.version&&desk.lastCandle===expected&&desk.items?.length===50&&Date.now()-Date.parse(desk.generatedAt)<H4+1200000){
   state.candidates=desk.items.filter(x=>x.status==='CANDIDATO');
   set('radarNote','Escaneo Carter Desk '+utc(Date.parse(desk.generatedAt))+' · siempre recotizar antes de preparar ticket');
  }else{state.candidates=[];set('radarNote',isCurrent?'No existe un escaneo completo y vigente de elegibilidad. El análisis individual sigue disponible.':'El radar mostrado es histórico: los 50 activos siguen navegables, pero NO habilitan tickets hasta nuevo cierre validado.');}
  showCandidates();
 }catch(e){state.candidates=[];state.rows=[];set('nScanned','SIN DATOS');set('radarAge',String(e.message||e));holder($('nowList'),'No hay oportunidades publicables: radar incompleto u obsoleto');holder($('watchList'),'Radar no disponible');set('nCandidates',0);set('nowCount',0);holder($('radarRows'),'');message('Radar: '+e.message);}
}
function ticketText(){
 const t=state.decision?.ticket;
 if(!t)return'No existe ticket vigente';
 return [
 'CARTER · TICKET EXPERIMENTAL NO VALIDADO','Activo: '+state.symbol,
 'Estrategia: '+t.strategy,'Compra LIMIT: '+t.entry,'Cantidad: '+t.quantity,
 'Nocional: '+t.notional+' USDT','Máximo precio: '+t.maxChase,
 'Stop de referencia: '+t.stop,'Objetivo de resistencia: '+t.target,
 'R neto estimado: '+fmt(t.netR,2),'Riesgo total estimado: '+fmt(t.riskUSDT,2)+' USDT',
 'Señal: '+utc(t.signalAt),'Vence: '+utc(t.expiresAt),
 'Fuente: Binance Spot · Perfil '+t.profileQuality,'AUDITORÍA: '+t.audit,
 'No equivale a una orden ni a garantía de rentabilidad.'
 ].join('\n');
}
function attach(){
 document.querySelectorAll('[data-zoom]').forEach(button=>{
  button.addEventListener('click',()=>{
   const value=Number(button.getAttribute('data-zoom'));
   if(![48,96,168].includes(value))return;
   state.zoom=value;
   document.querySelectorAll('[data-zoom]').forEach(b=>{
    const active=Number(b.getAttribute('data-zoom'))===value;
    b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
   });
   if(state.bars.length)drawChart();
  });
 });
 $('enableNotifications').onclick=async()=>{if(!('Notification' in window)){message('Este navegador no admite notificaciones');return;}try{const permission=await Notification.requestPermission();message(permission==='granted'?'Avisos habilitados mientras esta página esté abierta.':'Permiso no otorgado.');}catch(e){message('Avisos: '+e.message);}};
 const clock=()=>set('deskClock',utc(Date.now()));clock();setInterval(clock,30000);
 $('analyze').onclick=()=>load($('symbolInput').value);$('symbolInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load(e.target.value);}};
 $('capital').onchange=()=>load(state.symbol);
 $('search').oninput=showRadar;$('radarFilter').onchange=showRadar;
 $('copyTicket').onclick=async()=>{try{await navigator.clipboard.writeText(ticketText());message('Plan copiado, no se envió ninguna orden');}catch(e){message('No se pudo copiar: '+e.message);}};
 $('prepareTicket').onclick=async()=>{
  const btn=$('prepareTicket'),symbol=state.symbol,at=state.decision?.ticket;
  if(!at||!state.bars.length||!state.daily.length){message('No existe ticket vigente');return;}
  if(Date.now()>at.expiresAt){message('Ticket vencido. Debe reanalizarse.');showDecision({status:'CADUCADA',reason:'Ticket caducado'});return;}
  btn.disabled=true;
  try{
   state.journal.expire();
   const q=await getQuote(symbol);
   if(symbol!==state.symbol)throw Error('El activo cambió durante la preparación');
   const current=G.decide({bars4h:state.bars,bars1d:state.daily,quote:q,profile:state.profile,
      capital:capital(),openExposure:exposure(symbol),portfolioExposure:portfolioExposure(),openRisk:portfolioRisk(),engine:E});
   if(current.status!=='CANDIDATO') {showDecision(current);throw Error('El ticket ya no es ejecutable: '+current.reason);}
   showDecision(current);
   const id=state.journal.prepared(current.ticket,symbol);
   message('Preparado '+id+' con cotización y riesgo revalidados. Esto NO envía órdenes.');renderJournal();
  }catch(e){message('No se preparó: '+e.message);}
  finally{btn.disabled=false;}
 };
 $('buyForm').onsubmit=e=>{
  e.preventDefault();try{
   const id=$('orderSelect').value,q=Number($('buyQty').value),p=Number($('buyPrice').value),fee=Number($('buyFee').value);
   if(!id)throw Error('Elegí una orden preparada');
   state.journal.buy({orderId:id,quantity:q,price:p,fee});
   message('Fill registrado manualmente. No se verificó contra el exchange.');
   $('buyForm').reset();renderJournal();refreshPositionQuotes();
  }catch(err){message('No se registró compra: '+err.message);}
 };
 $('sellForm').onsubmit=e=>{
  e.preventDefault();try{
   const symbol=$('sellSymbol').value,q=Number($('sellQty').value),p=Number($('sellPrice').value),fee=Number($('sellFee').value);
   state.journal.sell({symbol,quantity:q,price:p,fee});
   message('Venta registrada manualmente, sin enviar órdenes.');
   $('sellForm').reset();renderJournal();refreshPositionQuotes();
  }catch(err){message('No se registró venta: '+err.message);}
 };
 $('restoreJournal').onchange=async event=>{
  const input=event.target,file=input.files?.[0];if(!file)return;
  try{
   if(file.size>1500000)throw Error('Copia de seguridad demasiado grande');
   const content=await file.text();
   if(!window.confirm('La restauración REEMPLAZARÁ las órdenes y fills de este navegador. ¿Ya exportaste una copia de los actuales?'))return;
   const result=state.journal.restoreJSON(content);
   renderJournal();refreshPositionQuotes();load(state.symbol);
   message('Restaurados '+result.orders+' tickets y '+result.fills+' fills. Esta operación no conecta al exchange.');
  }catch(e){message('No se restauró ningún dato: '+e.message);}
  finally{input.value='';}
 };
 $('exportJournal').onclick=()=>{
  try{const blob=new Blob([state.journal.exportJSON()],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='carter-bitacora-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   message('Bitácora exportada desde este navegador.');
  }catch(e){message('No se pudo exportar: '+e.message);}
 };
 window.addEventListener('resize',()=>{if(state.bars.length)drawChart();});
 setInterval(()=>{if(!document.hidden){renderJournal();refreshPositionQuotes();if(state.bars.length)load(state.symbol);showCandidates();
   if(Date.now()-state.lastPaperAt>15*60000)loadPaper();}},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshPositionQuotes();loadRadar();load(state.symbol);loadPaper();}});
}
function init(){
 if(!E||!D||!G||!J||!M||!S||!P||!C||!H||!BQ){set('dataHealth','ERROR MOTOR');message('Faltan módulos de cálculo');return;}
 try{state.journal=J.create(localStorage);}catch(e){set('dataHealth','SIN ALMACENAMIENTO');message('Bitácora local indisponible: '+e.message);return;}
 attach();renderJournal();loadRadar();loadDeskAudit().then(loadDeskVariants);load('BTCUSDT');refreshPositionQuotes();loadPaper();
 try{window.CarterCloudUI?.mount({journal:state.journal,onRestore:()=>{renderJournal();refreshPositionQuotes();load(state.symbol);}});}
 catch(e){message('Nube opcional deshabilitada: '+e.message);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();