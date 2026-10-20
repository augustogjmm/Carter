/* Carter Trading Desk — real-data interface. No exchange order submission. */
(function(){
"use strict";
const E=window.TLEngine,D=window.TLData,G=window.CarterDeskEngine,J=window.CarterJournal;
const $=id=>document.getElementById(id),fmt=(n,p=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:p}):'—';
const price=n=>fmt(n,Number.isFinite(n)&&n<1?7:n<100?4:2);
const utc=n=>Number.isFinite(n)?new Date(n).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
const DAY=86400000,H4=14400000;
const state={symbol:'BTCUSDT',bars:[],ind:null,profile:null,decision:null,quote:null,rows:[],candidates:[],seq:0,quotes:new Map(),journal:null,alertKeys:new Set()};
const set=(id,v)=>{const el=$(id);if(el)el.textContent=String(v);};
function message(msg){set('message',msg);}
function holder(el,content){el.replaceChildren();if(content){const p=document.createElement('p');p.className='placeholder';p.textContent=content;el.append(p);}}
function btn(label,symbol,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.onclick=()=>load(symbol);return b;}
function validSymbol(s){return/^[A-Z0-9]{2,24}USDT$/.test(s);}
function capital(){const n=Number($('capital').value);return Number.isFinite(n)&&n>=20?n:NaN;}
function exposure(symbol){const p=state.journal.positions().find(x=>x.symbol===symbol);return p?p.basis:0;}
function portfolioRisk(){const current=state.journal.positions();
 return state.journal.orders().reduce((sum,o)=>{
 const p=current.find(x=>x.symbol===o.symbol);if(!p||p.quantity<=0||!o.filledQty)return sum;
 return sum+(o.ticket?.riskUSDT||0)*Math.min(1,o.filledQty/o.qty);
 },0);}
function notifyIfNew(symbol,key,msg){
 const eventKey=symbol+':'+key+':'+Math.floor(Date.now()/60000);
 if(state.alertKeys.has(eventKey))return;
 state.alertKeys.add(eventKey);message(msg);
}
function renderJournal(){
 const os=state.journal.orders().filter(o=>['PREPARED','SUBMITTED','PARTIAL'].includes(o.status)),sel=$('orderSelect');
 sel.replaceChildren();let opt=document.createElement('option');opt.value='';opt.textContent=os.length?'Elegir orden…':'Sin órdenes preparadas';sel.append(opt);
 for(const o of os){opt=document.createElement('option');opt.value=o.id;opt.textContent=o.symbol+' · '+o.status+' · '+fmt(o.qty-o.filledQty,6)+' pendientes';sel.append(opt);}
 const positions=state.journal.positions().filter(x=>x.quantity>1e-10),sell=$('sellSymbol');sell.replaceChildren();opt=document.createElement('option');opt.value='';opt.textContent=positions.length?'Elegir posición…':'Sin posiciones';sell.append(opt);
 for(const p of positions){opt=document.createElement('option');opt.value=p.symbol;opt.textContent=p.symbol+' · '+fmt(p.quantity,8);sell.append(opt);}
 set('nPositions',positions.length);renderPositions();
}
async function getQuote(symbol){
 const r=await fetch('/api/desk-quote?symbol='+encodeURIComponent(symbol),{cache:'no-store'});
 const q=await r.json();if(!r.ok)throw Error(q.error||'Sin cotización');
 state.quotes.set(symbol,q);return q;
}
async function refreshPositionQuotes(){
 const symbols=state.journal.positions().filter(p=>p.quantity>1e-10).map(p=>p.symbol);
 await Promise.allSettled(symbols.map(x=>getQuote(x)));renderPositions();
}
function renderPositions(){
 const all=state.journal.positions().filter(x=>x.quantity>1e-10),container=$('positionList');container.replaceChildren();
 if(!all.length){holder(container,'No hay tenencias registradas. Preparar una entrada no crea una posición.');set('monitorState','SIN POSICIONES');return;}
 set('monitorState','PÁGINA ABIERTA · COTIZACIÓN PÚBLICA');
 for(const p of all){
  const q=state.quotes.get(p.symbol),fresh=q&&Date.now()-q.asOf<=90000,unreal=fresh?p.quantity*q.bid*(1-.001)-p.basis:NaN;
  const op=state.journal.orders().filter(x=>x.symbol===p.symbol&&x.filledQty>0);
  const stops=op.map(x=>x.ticket?.stop).filter(Number.isFinite),targets=op.map(x=>x.ticket?.target).filter(Number.isFinite);
  const stop=stops.length?Math.max(...stops):null,target=targets.length?Math.min(...targets):null;
  const warning=fresh&&stop&&q.bid<=stop?'INVALIDACIÓN / REVISAR':fresh&&target&&q.bid>=target?'OBJETIVO / REVISAR':'';
  if(warning)notifyIfNew(p.symbol,warning,'ATENCIÓN '+p.symbol+': '+warning+'; comprobar mercado y ejecución');
  const box=document.createElement('article');box.className='position';
  const head=document.createElement('div');head.className='head';const title=document.createElement('strong');title.textContent=p.symbol;
  const chip=document.createElement('span');chip.className='chip '+(warning?'red':'');chip.textContent=warning||'REGISTRADA';head.append(title,chip);box.append(head);
  for(const line of [
   'Tenencia: '+fmt(p.quantity,8)+' · costo medio '+price(p.avgPrice),
   fresh?'Bid actual '+price(q.bid)+' · '+utc(q.asOf):'COTIZACIÓN NO VERIFICADA · resultado no calculable',
   'Stop de referencia '+(stop?price(stop):'—')+' · objetivo '+(target?price(target):'—'),
   'PnL realizado (historial): '+fmt(p.realized)+' USDT'
  ]){const el=document.createElement('p');el.textContent=line;box.append(el);}
  const pnl=document.createElement('div');pnl.className='pnl '+(unreal>=0?'profit':'loss');pnl.textContent=Number.isFinite(unreal)?(unreal>=0?'+':'')+fmt(unreal)+' USDT':'PnL sin cotización';box.append(pnl);container.append(box);
 }
}
function drawChart(){
 const cv=$('deskChart');if(!cv||!state.bars.length)return;
 const ratio=Math.min(2,window.devicePixelRatio||1),w=cv.clientWidth||600,h=cv.clientHeight||315;
 cv.width=Math.round(w*ratio);cv.height=Math.round(h*ratio);
 const g=cv.getContext('2d');g.scale(ratio,ratio);g.fillStyle='#091725';g.fillRect(0,0,w,h);
 const bars=state.bars.slice(-95),ind=state.ind,start=state.bars.length-bars.length;
 const right=72,left=16,top=26,bottom=25,chartW=Math.max(20,w-left-right),chartH=h-top-bottom;
 const hi=Math.max(...bars.map(x=>x.h)),lo=Math.min(...bars.map(x=>x.l)),range=hi-lo||1;
 const y=v=>top+(hi+range*.08-v)/(range*1.16)*chartH,x=i=>left+(i+.5)*chartW/bars.length;
 g.lineWidth=1;g.strokeStyle='#1f344b';g.font='10px system-ui';g.fillStyle='#859db7';
 for(let i=0;i<5;i++){const value=lo+range*i/4;g.beginPath();g.moveTo(left,y(value));g.lineTo(w-right,y(value));g.stroke();g.fillText(price(value),w-right+5,y(value)+3);}
 const candleW=Math.max(1.5,chartW/bars.length*.6);
 bars.forEach((b,i)=>{const color=b.c>=b.o?'#4bd4b3':'#f17e90';g.strokeStyle=color;g.fillStyle=color;g.beginPath();g.moveTo(x(i),y(b.h));g.lineTo(x(i),y(b.l));g.stroke();
 g.fillRect(x(i)-candleW/2,Math.min(y(b.o),y(b.c)),candleW,Math.max(1,Math.abs(y(b.c)-y(b.o))));});
 for(const [array,color] of [[ind.ema10,'#61d6ed'],[ind.ema55,'#e9bc75']]){g.beginPath();g.strokeStyle=color;g.lineWidth=1.5;
 bars.forEach((b,i)=>{const v=array[start+i];if(!Number.isFinite(v))return;i?g.lineTo(x(i),y(v)):g.moveTo(x(i),y(v));});g.stroke();}
 if(state.profile){
 for(const [value,color,label] of [[state.profile.poc,'#4bd4b3','POC'],[state.profile.vah,'#bd9d77','VAH'],[state.profile.val,'#bd9d77','VAL']]){
 if(value<lo-range*.08||value>hi+range*.08)continue;
 g.strokeStyle=color;g.setLineDash([4,4]);g.beginPath();g.moveTo(left,y(value));g.lineTo(w-right,y(value));g.stroke();g.setLineDash([]);g.fillStyle=color;g.fillText(label,left+5,y(value)-4);
 }}
 if(state.decision?.ticket){
 const t=state.decision.ticket;
 for(const [v,color,label] of [[t.entry,'#75e2c1','ENTRADA'],[t.stop,'#ef8496','STOP'],[t.target,'#f0bd79','OBJETIVO']]){
 if(v<lo-range*.08||v>hi+range*.08)continue;g.strokeStyle=color;g.setLineDash([6,5]);g.beginPath();g.moveTo(left,y(v));g.lineTo(w-right,y(v));g.stroke();g.setLineDash([]);g.fillStyle=color;g.fillText(label,left+8,y(v)-5);
 }}
 g.fillStyle='#98b0c9';g.fillText('4H · Binance Spot · EMA10 / EMA55 · perfil OHLCV estimado',left+3,14);
}
function showDecision(r){
 state.decision=r;const banner=$('signalBanner');banner.className='signal-banner';
 const names={CANDIDATO:'TICKET EXPERIMENTAL',ESPERAR:'ESPERAR',VIGILAR:'VIGILAR',NO_OPERABLE:'NO OPERAR',CADUCADA:'CADUCADA',SIN_DATOS:'SIN DATOS'};
 set('decision',names[r.status]||r.status);set('decisionWhy',r.reason);
 if(r.status==='CANDIDATO')banner.classList.add('good');if(['SIN_DATOS','NO_OPERABLE','CADUCADA'].includes(r.status))banner.classList.add('bad');
 set('signalTime',r.context?'Señal: '+utc(r.context.signalAt):'—');
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
 const seq=++state.seq;state.bars=[];state.ind=null;state.profile=null;state.decision=null;state.quote=null;
 set('decision','CARGANDO…');set('decisionWhy','Descargando velas 4H y 1D independientes, luego cotización y reglas del exchange');
 set('assetSource','Binance spot · esperando validación');set('dailyTrend','—');set('momentum','—');set('adx','—');set('volume','—');
 set('ticketStatus','BLOQUEADO');$('ticketBody').hidden=true;$('ticketEmpty').hidden=false;set('ticketEmpty','No hay ticket hasta completar los controles');
 const cv=$('deskChart'),g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
 try{
  const [h4,d1,q]=await Promise.all([
   D.history(symbol,'4h',Date.now()-200*DAY),
   D.history(symbol,'1d',Date.now()-900*DAY),
   getQuote(symbol)
  ]);
  if(seq!==state.seq)return;
  const bars=h4.bars;state.bars=bars;state.ind=E.indicators(bars,'4h');state.quote=q;
  state.profile=E.profile(bars.slice(-360),64);
  const result=G.decide({bars4h:bars,bars1d:d1.bars,quote:q,profile:state.profile,
   capital:capital(),openExposure:exposure(symbol),openRisk:portfolioRisk(),engine:E});
  set('assetSource',h4.source+' · 4H '+bars.length+' velas · 1D '+d1.bars.length+' velas · quote '+utc(q.asOf));
  set('sourceLabel','Última cotización '+utc(q.asOf));set('dataHealth','COTIZACIÓN OK');
  const k=bars.length-1;
  set('dailyTrend',result.context?.dailyBull?'ALCISTA CONFIRMADA':result.context?'NO ALCISTA':'NO VERIFICADA');
  set('momentum',fmt(state.ind.momentum[k],4));set('adx',fmt(state.ind.adx[k],1));
  set('volume',state.profile?'POC '+price(state.profile.poc)+' · VAH '+price(state.profile.vah):'NO DISPONIBLE');
  showDecision(result);drawChart();
 }catch(e){
  if(seq!==state.seq)return;
  set('dataHealth','SIN DATOS');set('assetSource','Falló validación: '+String(e.message||e));
  showDecision({status:'SIN_DATOS',reason:'No se habilita entrada: '+String(e.message||e)});
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
  const b=btn(x.symbol+' · Entrada '+price(x.ticket.entry)+' · Stop '+price(x.ticket.stop)+' · '+fmt(x.ticket.netR,2)+'R',x.symbol);
  b.className='opportunity';nowBox.append(b);
 }
 const list=state.rows.filter(x=>x.status==='watch'||x.status==='signal').slice(0,9);
 if(!list.length)holder(watch,'Sin setups en vigilancia según el último escaneo');
 for(const x of list){const row=document.createElement('div');row.className='watch-item';const label=document.createElement('b');label.textContent=x.symbol;row.append(label,btn(x.status==='signal'?'Validar ↗':'Revisar ↗',x.symbol+'USDT'));watch.append(row);}
}
async function loadRadar(){
 try{
  const r=await fetch('/data/tl-radar.json?'+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const snap=await r.json(),expected=Math.floor(Date.now()/H4)*H4-H4;
  if(snap.items?.length!==50||snap.lastCandle!==expected||snap.version!==E.version)throw Error('Snapshot obsoleto o incompleto');
  state.rows=snap.items;
  set('nScanned',snap.analyzed+' / 50');set('radarAge','Cierre '+utc(snap.lastCandle+H4));showRadar();
  let desk;
  try{const d=await fetch('/data/desk-opportunities.json?'+Date.now(),{cache:'no-store'});if(d.ok)desk=await d.json();}catch(e){}
  if(desk?.engine===G.version&&desk.lastCandle===expected&&desk.items?.length===50&&Date.now()-Date.parse(desk.generatedAt)<H4+1200000){
   state.candidates=desk.items.filter(x=>x.status==='CANDIDATO');
   set('radarNote','Escaneo Carter Desk '+utc(Date.parse(desk.generatedAt))+' · siempre recotizar antes de preparar ticket');
  }else{state.candidates=[];set('radarNote','No existe un escaneo completo y vigente de elegibilidad. El análisis individual sigue disponible.');}
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
 const clock=()=>set('deskClock',utc(Date.now()));clock();setInterval(clock,30000);
 $('analyze').onclick=()=>load($('symbolInput').value);$('symbolInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load(e.target.value);}};
 $('capital').onchange=()=>load(state.symbol);
 $('search').oninput=showRadar;$('radarFilter').onchange=showRadar;
 $('copyTicket').onclick=async()=>{try{await navigator.clipboard.writeText(ticketText());message('Plan copiado, no se envió ninguna orden');}catch(e){message('No se pudo copiar: '+e.message);}};
 $('prepareTicket').onclick=()=>{
  const t=state.decision?.ticket;
  if(!t){message('No existe ticket vigente');return;}
  if(Date.now()>t.expiresAt||Date.now()-t.quoteAt>90000){message('Reanalizá: ticket o cotización vencidos');showDecision({status:'CADUCADA',reason:'Ticket o precio caducado'});return;}
  try{const id=state.journal.prepared(t,state.symbol);message('Preparado '+id+'. Esto NO crea una posición ni envía una orden.');renderJournal();}
  catch(e){message(e.message);}
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
 $('exportJournal').onclick=()=>{
  try{const blob=new Blob([state.journal.exportJSON()],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='carter-bitacora-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   message('Bitácora exportada desde este navegador.');
  }catch(e){message('No se pudo exportar: '+e.message);}
 };
 window.addEventListener('resize',()=>{if(state.bars.length)drawChart();});
 setInterval(()=>{if(!document.hidden){refreshPositionQuotes();if(state.bars.length)load(state.symbol);showCandidates();}},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshPositionQuotes();loadRadar();load(state.symbol);}});
}
function init(){
 if(!E||!D||!G||!J){set('dataHealth','ERROR MOTOR');message('Faltan módulos de cálculo');return;}
 try{state.journal=J.create(localStorage);}catch(e){set('dataHealth','SIN ALMACENAMIENTO');message('Bitácora local indisponible: '+e.message);return;}
 attach();renderJournal();loadRadar();load('BTCUSDT');refreshPositionQuotes();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();