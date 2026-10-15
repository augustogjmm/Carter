(function(){
'use strict';
const $=id=>document.getElementById(id);
const CE=window.CarterEngine;
const API=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com'];
const BAR=14400000,MAX_4H=2000;
const S={pair:'SOLUSDT',quoteAsset:'USDT',baseAsset:'SOL',precision:4,c:[],forming:null,s:null,profile:null,profileSource:'',plan:null,forecast:null,quoteAt:0,source:'',loadId:0,controller:null,ws:null,poller:null,lastProfile:0,offset:0,view:140,drag:null,hover:-1,busy:false};
const fmt=(p,n=S.precision)=>Number.isFinite(p)?Number(p).toLocaleString('en-US',{minimumFractionDigits:Math.min(n,8),maximumFractionDigits:Math.min(n,8)}):'—';
const f2=p=>Number.isFinite(p)?p.toFixed(2):'—';
const date=t=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
const endUTC=()=>new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const label=(id,value)=>$(id).textContent=value;
function status(value,type=''){label('status',value);$('statusDot').className='dot '+type;label('stamp',endUTC()+' · AR');}
function error(msg){$('error').textContent=msg;$('error').classList.toggle('show',!!msg);}
function candle(r){return{t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],closed:+r[6]<=Date.now()-500};}
async function api(path,signal){
let last;for(let u of API){try{const resp=await fetch(u+path,{cache:'no-store',signal});const data=await resp.json();if(!resp.ok){const e=new Error(data.msg||('HTTP '+resp.status));e.fatal=data.code===-1121||resp.status===400||resp.status===404;throw e;}return data;}catch(e){if(e.name==='AbortError')throw e;if(e.fatal)throw e;last=e;}}
throw last||new Error('No hay conexión con Binance');}
async function fetchRange(pair,tf,bars,signal){
let pages=[],end=Date.now(),remaining=bars;while(remaining>0){let limit=Math.min(1000,remaining),rows=await api('/api/v3/klines?symbol='+encodeURIComponent(pair)+'&interval='+tf+'&limit='+limit+'&endTime='+end,signal);if(!Array.isArray(rows)||!rows.length)break;pages.unshift(rows);end=+rows[0][0]-1;remaining-=rows.length;if(rows.length<limit)break;}
const map=new Map();for(let page of pages)for(let r of page){let b=candle(r);map.set(b.t,b);}return Array.from(map.values()).sort((a,b)=>a.t-b.t);
}
function profileDays(){return Math.max(14,Math.min(90,Number($('profileDays').value)||30));}
async function fetchVolume(pair,signal){let count=profileDays()*24+2;const rows=await fetchRange(pair,'1h',count,signal);if(rows.length<72)throw new Error('No hay suficientes velas 1H para el perfil');return rows;}
async function updateProfile(signal){
const resolution=$('vpResolution').value;
if(resolution==='4h'){
 S.profile=CE.volumeProfile(S.c.slice(-profileDays()*6));
 S.profileSource='4H · misma temporalidad';
}else{
 try{
   const rows=await fetchVolume(S.pair,signal);
   S.profile=CE.volumeProfile(rows);
   S.profileSource='1H · únicamente detalle del perfil';
 }catch(e){
   if(e.name==='AbortError')throw e;
   S.profile=CE.volumeProfile(S.c.slice(-profileDays()*6));
   S.profileSource='4H · respaldo (falló fuente 1H)';
   error('No se pudo obtener el detalle 1H del perfil. Las señales siguen siendo 4H. '+e.message);
 }
}
label('profileMethod',S.profileSource.startsWith('1H')?'1H (solo perfil)':'4H');
S.lastProfile=Date.now();
}
function closeFeeds(){if(S.controller){S.controller.abort();S.controller=null;}if(S.poller){clearInterval(S.poller);S.poller=null;}if(S.ws){try{S.ws.onclose=null;S.ws.close();}catch(_){}S.ws=null;}}
function applyLatest(rows){let map=new Map(S.c.map(x=>[x.t,x]));for(let b of rows){if(b.closed)map.set(b.t,b);else S.forming=b;}let oldLast=S.c.at(-1)?.t;S.c=Array.from(map.values()).sort((a,b)=>a.t-b.t).slice(-MAX_4H);return oldLast!==S.c.at(-1)?.t;}
async function load(pair){
pair=norm(pair);if(!pair){error('Ingresá un par de Binance Spot, por ejemplo BTCUSDT.');return;}
const id=++S.loadId;closeFeeds();S.busy=true;S.c=[];S.s=null;S.forming=null;S.profile=null;S.plan=null;S.forecast=null;S.pair=pair;S.offset=0;S.view=140;S.quoteAt=0;S.source='';$('symbol').value=pair;$('analyze').disabled=true;error('');status('Validando '+pair,'');redraw();
const controller=new AbortController();S.controller=controller;
try{
const info=await api('/api/v3/exchangeInfo?symbol='+encodeURIComponent(pair),controller.signal);
const market=info?.symbols?.[0];if(!market||market.symbol!==pair||market.status!=='TRADING'||market.isSpotTradingAllowed===false)throw new Error('El par no existe o no está habilitado en Binance Spot.');
S.quoteAsset=market.quoteAsset||'USDT';S.baseAsset=market.baseAsset||S.pair;label('quoteCapital',S.quoteAsset);const tick=market.filters?.find(x=>x.filterType==='PRICE_FILTER')?.tickSize||'0.0001';
S.precision=Math.min(8,Math.max(0,(tick.split('.')[1]||'').replace(/0+$/,'').length));
status('Descargando velas 4H','');
const candles=await fetchRange(pair,'4h',MAX_4H,controller.signal);
if(id!==S.loadId)return;
S.c=candles.filter(x=>x.closed);S.forming=candles.find(x=>!x.closed)||null;if(S.c.length<220)throw new Error('El par necesita al menos 220 velas 4H cerradas para EMA200 y Carter.');
S.quoteAt=Date.now();S.source='REST 4H';compute();
status('Calculando perfil '+$('vpResolution').value.toUpperCase()+' (operación 4H)','');
await updateProfile(controller.signal);
if(id!==S.loadId)return;
compute();status('Datos REST actualizados','ok');subscribe(id);
}catch(e){if(e.name==='AbortError')return;status('DATOS NO DISPONIBLES','err');error(e.message);S.c=[];S.profile=null;S.plan=null;redraw();}
finally{if(id===S.loadId){S.busy=false;$('analyze').disabled=false;S.controller=null;}}
}
function compute(){if(S.c.length<220)return;S.s=CE.indicators(S.c,Number($('adxMin').value),$('adxEnabled').checked);refresh();}
function current(){return S.forming?.c??S.c.at(-1)?.c??null;}
function executable(){if(!S.s||!S.c.length)return false;let i=S.c.length-1,last=S.c[i],forming=S.forming,age=Date.now()-(last.t+BAR),at=S.s.at[i];return !!S.s.signal[i]&&forming?.t===last.t+BAR&&age>=0&&age<=10*60000&&Number.isFinite(at)&&Math.abs(forming.c-forming.o)<=.25*at&&Date.now()-S.quoteAt<=120000;}
function refresh(){if(!S.s||!S.c.length)return;let i=S.c.length-1,b=S.c[i],c=S.s,px=current();S.plan=CE.tradePlan(S.c,c,S.profile,px,executable(),Number($('capital').value)||0,Number($('riskPct').value)||0);
S.forecast=CE.projectScenarios(S.c,c,S.profile,S.plan,px);
label('chartTitle',S.pair+' · Binance Spot · 4H');
label('chartData',S.c.length.toLocaleString('es-AR')+' velas cerradas · '+date(S.c[0].t)+' — '+date(b.t+BAR));
label('lastPrice',fmt(px));label('priceState',(S.forming?'4H en formación':'Última 4H cerrada')+' · '+S.source);
label('trend',c.trend[i]?'ALCISTA':'NO ALINEADA');$('trend').className=c.trend[i]?'green':'';label('trendDetail','EMA10 '+fmt(c.ema10[i])+' / EMA55 '+fmt(c.ema55[i]));
label('squeeze',c.fire[i]?'LIBERADO':c.sq[i]?'COMPRIMIDO':'SIN DISPARO');
label('squeezeDetail',c.fire[i]?'Liberación confirmada ON → OFF':c.sq[i]?'Dentro de Keltner':'Aún sin liberación nueva');
let mom=c.mom[i];label('momentum',Number.isFinite(mom)?(mom>=0?'POSITIVO ':'NEGATIVO ')+(mom>c.mom[i-1]?'↗':'↘'):'—');label('momDetail',fmt(mom,4)+' · '+(mom>c.mom[i-1]?'acelerando':'desacelerando'));
label('adx',fmt(c.adx[i],1));label('adxDetail','+DI '+fmt(c.plusDI[i],1)+' · −DI '+fmt(c.minusDI[i],1));$('adx').className=c.adxOK[i]?'green':'';
let cond=[['EMA10 > EMA55 > EMA200 y cierre > EMA10',c.trend[i]],['Squeeze ON → OFF recién liberado',c.fire[i]],['Momentum positivo y creciente',c.momentumOK[i]],['ADX '+$('adxMin').value+' / +DI > −DI',!$('adxEnabled').checked||c.adxOK[i]]];
$('conditions').innerHTML=cond.map(x=>'<div class="condition"><span>'+x[0]+'</span><em class="'+(x[1]?'ok':'no')+'">'+(x[1]?'CONFIRMADO':'NO')+'</em></div>').join('');
if(S.profile){label('poc',fmt(S.profile.poc));label('vah',fmt(S.profile.vah));label('val',fmt(S.profile.val));label('vpWindow',profileDays()+' días · '+S.profile.candles+' velas');label('vpStatus',S.profileSource);}
else{for(let k of ['poc','vah','val','vpWindow'])label(k,'—');label('vpStatus','CARGANDO');}
showPlan();showForecast();showDecision();redraw();
}
function showPlan(){
let p=S.plan,entries=p?.entries||[];
for(let j=0;j<3;j++){
let e=entries[j];
label('e'+(j+1),e?fmt(e.price):'—');
label('e'+(j+1)+'Label',e?(e.source+(j?' · reconfirmar rebote 4H':' · esperar cierre 4H')):'Sin soporte independiente');
}
label('average',Number.isFinite(p?.avg)?fmt(p.avg):'—');label('stop',Number.isFinite(p?.stop)?fmt(p.stop):'—');
label('takeProfit',p?.target?fmt(p.target.price):'SIN TP VÁLIDO');
label('rrFirst',Number.isFinite(p?.rrFirst)?f2(p.rrFirst)+' : 1':'—');label('rrFull',Number.isFinite(p?.rrAvg)?f2(p.rrAvg)+' : 1':'—');
label('riskAmount',Number.isFinite(p?.riskBudget)?fmt(p.riskBudget,2)+' '+S.quoteAsset:'—');
label('exposure',Number.isFinite(p?.exposure)?fmt(p.exposure,2)+' '+S.quoteAsset:'—');
label('units',Number.isFinite(p?.units)?fmt(p.units,6)+' '+S.baseAsset:'—');
let text=p?.reason||'El perfil de volumen todavía no está disponible.';
if(p?.target)text+=' Objetivo estructural: '+p.target.source+'.';
else if(p?.nearest)text+=' Primera resistencia observada: '+fmt(p.nearest.price)+' ('+p.nearest.source+'); no alcanza el R/R mínimo.';
label('planSummary',text);
label('warning',entries.length>1?'E2 y E3 son ZONAS CONDICIONALES, no compras automáticas. Antes de cada promedio debe repetirse una confirmación 4H y seguir vigente la estructura alcista. Si se pierde el stop, se cancela el plan.':'Sin señal validada, los niveles son referencias para esperar. No comprar un soporte solo por tocarlo.');
}
function showForecast(){
const f=S.forecast,p=S.plan;
if(!f){
 label('forecastPullback','SIN ZONA');
 label('forecastPullbackRule','Esperando un perfil válido para ubicar soporte. No inventar entradas.');
 label('forecastContinuation','SIN OBJETIVO');
 label('forecastContinuationRule','Sin resistencia identificada no hay TP justificable.');
 label('forecastFailure','SIN NIVEL');
 label('forecastFailureRule','Todavía no se determinó la invalidación.');
 label('entryChecklist','No activar compras hasta disponer de una estructura 4H y niveles coherentes.');
 label('forecastStatus','PLAN NO DISPONIBLE');
 return;
}
let entry=f.entries[0],current=f.price;
if(entry){
 const pct=(entry.price/current-1)*100;
 label('forecastPullback',fmt(entry.zoneMin)+' — '+fmt(entry.zoneMax));
 label('forecastPullbackRule','Zona E1 '+fmt(entry.price)+' ('+(pct>=0?'+':'')+f2(pct)+'% desde precio). '+entry.source+'. Contactar la zona NO activa compra; esperar confirmación 4H.');
 label('entryChecklist','Si el precio alcanza E1 ('+fmt(entry.zoneMin)+'–'+fmt(entry.zoneMax)+'), esperar una vela 4H cerrada recuperando '+fmt(entry.price)+', momentum girando al alza y estructura vigente'+($('adxEnabled').checked?', con ADX y +DI validando':'')+'. E2 y E3 requieren esa validación nuevamente. No activar por simple toque.');
 label('forecastStatus',p?.ready?'E1 HABILITADA AHORA':'E1 FUTURA · ESPERAR CONFIRMACIÓN');
}else{
 label('forecastPullback','SIN SOPORTE');
 label('forecastPullbackRule','No hay un soporte independiente cercano y justificable para E1.');
 label('entryChecklist','Sin zona E1 estructural no se prepara una compra. Reevaluar tras el próximo cierre 4H.');
 label('forecastStatus','NO HAY E1 PROPUESTA');
}
if(f.barrier){
 const tp=f.target?' · TP válido':' · obstáculo previo';
 label('forecastContinuation',fmt(f.barrier.price));
 label('forecastContinuationRule','Primera resistencia: '+f.barrier.source+tp+'. Si no hay retroceso a E1, esperar una señal Carter 4H nueva, comprobar R/R y no perseguir precio.');
}else{
 label('forecastContinuation','SIN RESISTENCIA');
 label('forecastContinuationRule','No se identifica un objetivo estructural superior. No asumir extensión alcista sin evidencia.');
}
if(f.invalidation){
 label('forecastFailure',fmt(f.invalidation));
 label('forecastFailureRule','Si cierra una 4H por debajo de esta invalidación, cancelar compras pendientes. No promediar por inercia.');
}else{
 label('forecastFailure','SIN STOP');
 label('forecastFailureRule','El soporte inferior no permite construir una invalidación coherente. No activar entradas.');
}
}
function showDecision(){
if(!S.c.length||!S.s)return;let i=S.c.length-1,c=S.s,b=S.c[i],p=S.plan,now=Date.now(),next=b.t+2*BAR;if(next<=now)next=Math.ceil((now+1)/BAR)*BAR;
let rem=Math.max(0,next-now),hh=Math.floor(rem/3600000),mm=Math.floor(rem%3600000/60000);
label('nextBar',String(hh).padStart(2,'0')+'h '+String(mm).padStart(2,'0')+'m');label('signalTime',date(next)+' · Argentina');
label('decisionTime','Último cierre: '+date(b.t+BAR)+' · AR');
let title='SIN ENTRADA',reason='Carter 4H no habilita una compra inmediata.',note='La proyección estructura escenarios futuros con activaciones pendientes.',cls='bad';
const f=S.forecast,first=f?.entries?.[0];
if(p?.ready){
title='E1 HABILITADA';
reason='Carter 4H confirmado y oportunidad vigente. TP en la primera resistencia, con R/R adecuado.';
note='E1 '+fmt(p.entries[0].price)+' · TP '+fmt(p.target.price)+' · invalidación '+fmt(p.stop)+'. Revalidar antes de operar.';cls='good';
}else if(first&&p?.target){
title='PREPARAR E1';
reason='Zona de compra futura '+fmt(first.zoneMin)+'–'+fmt(first.zoneMax)+'; todavía NO habilitada.';
note='Esperar llegada + recuperación confirmada al cierre 4H + impulso y ADX si corresponde. TP '+fmt(p.target.price)+'.';cls='wait';
}else if(first&&f?.barrier){
title='ESPERAR · R/R';
reason='E1 está proyectada, pero la primera resistencia '+fmt(f.barrier.price)+' queda demasiado cerca.';
note='No saltear resistencias para justificar una entrada. Reevaluar con estructura nueva.';cls='wait';
}else if(first){
title='ESPERAR E1';
reason='Hay un soporte futuro '+fmt(first.price)+' pero falta salida técnica o confirmación suficiente.';
note='No ejecutar mientras no exista un objetivo y un stop coherentes.';cls='wait';
}else if(c.sq[i]){
title='ESPERAR SEÑAL';
reason='Squeeze comprimido en la última 4H cerrada.';
note='La posible liberación futura es un escenario, no una compra habilitada.';cls='wait';
}
$('decisionCard').className='decision '+cls;label('decisionTitle',title);label('decisionReason',reason);label('decisionNote',note);
}
function subscribe(id){
try{let ws=new WebSocket('wss://stream.binance.com:9443/ws/'+S.pair.toLowerCase()+'@kline_4h');S.ws=ws;
ws.onopen=()=>{if(id===S.loadId)status('Binance en vivo','ok');};
ws.onmessage=e=>{if(id!==S.loadId)return;let o;try{o=JSON.parse(e.data).k;}catch(_){return;}if(!o)return;let b={t:+o.t,o:+o.o,h:+o.h,l:+o.l,c:+o.c,v:+o.v,closed:!!o.x};if(o.x){let pos=S.c.findIndex(x=>x.t===b.t);if(pos>=0)S.c[pos]=b;else if(b.t>S.c.at(-1).t)S.c.push(b);S.c=S.c.slice(-MAX_4H);S.forming=null;S.quoteAt=Date.now();S.source='WebSocket';if($('vpResolution').value==='4h'){S.profile=CE.volumeProfile(S.c.slice(-profileDays()*6));S.lastProfile=Date.now();}compute();}else{S.forming=b;S.quoteAt=Date.now();S.source='WebSocket';refresh();}};
ws.onclose=()=>{if(id===S.loadId){S.ws=null;status('REST · reconectando','');}};
ws.onerror=()=>{try{ws.close();}catch(_){}};
}catch(e){status('REST · sin WebSocket','');}
S.poller=setInterval(async()=>{
if(id!==S.loadId)return;
try{let bars=(await api('/api/v3/klines?symbol='+encodeURIComponent(S.pair)+'&interval=4h&limit=4')).map(candle);const changed=applyLatest(bars);S.quoteAt=Date.now();S.source='REST';if(changed)compute();else refresh();if(!S.ws||S.ws.readyState!==1)status('REST actualizado','ok');
if(Date.now()-S.lastProfile>10*60000){try{await updateProfile();refresh();}catch(_){}}
}catch(e){if(!S.ws||S.ws.readyState!==1)status('Sin datos recientes','err');}
},90000);
}
const canvas=$('chart'),ctx=canvas.getContext('2d'),tip=$('crosshair');let geom=null,req=null;
function redraw(){if(req)return;req=requestAnimationFrame(()=>{req=null;paint();});}
function paint(){
let rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;if(w<25)return;let dpi=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(w*dpi);canvas.height=Math.round(h*dpi);ctx.setTransform(dpi,0,0,dpi,0,0);ctx.fillStyle='#0c1725';ctx.fillRect(0,0,w,h);
if(!S.s||!S.c.length){ctx.fillStyle='#a6bad0';ctx.font='13px sans-serif';ctx.fillText('Cargando velas 4H y perfil de volumen…',20,40);return;}
let c=S.c,s=S.s,N=c.length,count=Math.min(S.view,N),maxOffset=Math.max(0,N-count);S.offset=Math.min(maxOffset,Math.max(0,S.offset));let end=N-S.offset,start=Math.max(0,end-count);
let x0=49,x1=w-113,plot=x1-x0,dx=plot/count,yt=17,yb=h*.61,volTop=h*.645,volBot=h*.738,momTop=h*.762,momBot=h*.872,adxTop=h*.897,adxBot=h*.963;
let shown=c.slice(start,end),lo=Math.min(...shown.map(x=>x.l)),hi=Math.max(...shown.map(x=>x.h)),plan=S.plan;
if(S.offset===0&&plan&&$('planVisible').checked){for(let v of [plan.stop,plan.target?.price,...(plan.entries||[]).map(x=>x.price)]){if(Number.isFinite(v)&&v>0){lo=Math.min(lo,v);hi=Math.max(hi,v);}}}
let margin=(hi-lo)*.07||hi*.01||1;lo-=margin;hi+=margin;let X=i=>x0+(i-start+.5)*dx,Y=v=>yt+(hi-v)/(hi-lo)*(yb-yt);
geom={x0,x1,dx,start,end,yt,yb,lo,hi,volTop,volBot,momTop,momBot,adxTop,adxBot};
ctx.lineWidth=1;ctx.font='10px ui-monospace,monospace';for(let k=0;k<=6;k++){let v=lo+(hi-lo)*k/6,y=Y(v);ctx.strokeStyle='#1f3146';ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.fillStyle='#95a9bd';ctx.fillText(fmt(v),x1+7,y+3);}
const profile=S.profile;
if(profile&&$('vpVisible').checked){let width=125,maxV=Math.max(...profile.vol)||1;ctx.fillStyle='#16263a99';ctx.fillRect(x1-width-4,yt,width+4,yb-yt);ctx.save();ctx.beginPath();ctx.rect(x1-width-4,yt,width+4,yb-yt);ctx.clip();
for(let j=0;j<profile.vol.length;j++){let base=profile.low+j*profile.step,top=base+profile.step,y1=Y(top),y2=Y(base);if(y2<yt||y1>yb)continue;ctx.fillStyle=base>=profile.val&&top<=profile.vah?'#607eac88':'#3b52744b';ctx.fillRect(x1-width+(1-profile.vol[j]/maxV)*width,Math.max(yt,y1),profile.vol[j]/maxV*width,Math.max(1,Math.min(yb,y2)-Math.max(yt,y1)));}ctx.restore();
for(let q of [[profile.poc,'POC','#cbb7ff'],[profile.vah,'VAH','#786ba9'],[profile.val,'VAL','#786ba9']]){let y=Y(q[0]);if(y<yt||y>yb)continue;ctx.strokeStyle=q[2];ctx.globalAlpha=.8;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=q[2];ctx.font='bold 9px sans-serif';ctx.fillText(q[1],x1-36,y-3);}}
const maxVol=Math.max(1,...shown.map(x=>x.v));
let moms=s.mom.slice(start,end).filter(Number.isFinite),maxMom=Math.max(1,...moms.map(Math.abs))*1.15,momZero=(momTop+momBot)/2;
for(let i=start;i<end;i++){let b=c[i],x=X(i),bw=Math.max(1,Math.min(12,dx*.68)),up=b.c>=b.o,color=up?'#41ceaa':'#f16c80';
ctx.fillStyle=color;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x,Y(b.h));ctx.lineTo(x,Y(b.l));ctx.stroke();ctx.fillRect(x-bw/2,Math.min(Y(b.o),Y(b.c)),bw,Math.max(1,Math.abs(Y(b.c)-Y(b.o))));
ctx.globalAlpha=.5;ctx.fillRect(x-bw/2,volBot-b.v/maxVol*(volBot-volTop),bw,b.v/maxVol*(volBot-volTop));ctx.globalAlpha=1;
if(Number.isFinite(s.mom[i])){let v=s.mom[i],mag=Math.abs(v)/maxMom*(momBot-momTop)*.45;ctx.fillStyle=v>=0?(v>=s.mom[i-1]?'#46dfa9':'#2e8876'):(v<=s.mom[i-1]?'#f7778a':'#9c6377');ctx.fillRect(x-bw/2,v>=0?momZero-mag:momZero,bw,Math.max(1,mag));}
ctx.fillStyle=s.fire[i]?'#fac47a':s.sq[i]?'#a18cff':'#5e748e';ctx.beginPath();ctx.arc(x,momZero,Math.max(1.3,Math.min(3,dx*.2)),0,Math.PI*2);ctx.fill();
if((i-start)%Math.max(1,Math.floor(count/7))===0){ctx.fillStyle='#8ba2bc';ctx.font='9px sans-serif';ctx.fillText(date(b.t).slice(0,5),x-12,h-6);}
if(s.signal[i]){ctx.fillStyle='#65efbe';ctx.beginPath();let y=Y(b.l)+12;ctx.moveTo(x,y);ctx.lineTo(x-4,y+8);ctx.lineTo(x+4,y+8);ctx.fill();}}
function line(values,color,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.55;ctx.setLineDash(dash);ctx.beginPath();let init=false;for(let i=start;i<end;i++){if(!Number.isFinite(values[i])){init=false;continue;}let x=X(i),y=Y(values[i]);if(!init){ctx.moveTo(x,y);init=true;}else ctx.lineTo(x,y);}ctx.stroke();ctx.restore();}
if($('emaVisible').checked){line(s.ema10,'#f1c069');line(s.ema55,'#b19afa');line(s.ema200,'#6fbaff');}
if($('bandsVisible').checked){line(s.bbU,'#899fc8',[4,3]);line(s.bbL,'#899fc8',[4,3]);line(s.kcU,'#496cab',[3,3]);line(s.kcL,'#496cab',[3,3]);}
if(S.offset===0&&plan&&$('planVisible').checked){let levels=(plan.entries||[]).map((e,i)=>[e.price,'E'+(i+1),['#6df3c0','#52cbae','#409d95'][i]]);if(plan.entries?.length>1)levels.push([plan.avg,'PROM','#a6e3dd']);if(Number.isFinite(plan.stop))levels.push([plan.stop,'SL','#ff7a8e']);if(plan.target)levels.push([plan.target.price,'TP','#f4c27d']);
for(let t of levels){let y=Y(t[0]);if(y<yt||y>yb)continue;ctx.strokeStyle=t[2];ctx.lineWidth=t[1]==='TP'||t[1]==='SL'?1.8:1.2;ctx.setLineDash(t[1]==='PROM'?[3,4]:t[1].startsWith('E')?[6,4]:[]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=t[2];ctx.font='bold 10px ui-monospace,monospace';ctx.fillText(t[1]+' '+fmt(t[0]),x1+6,y-4);}}
ctx.strokeStyle='#3c536b';ctx.beginPath();ctx.moveTo(x0,momZero);ctx.lineTo(x1,momZero);ctx.stroke();let adxSeries=[s.adx,s.plusDI,s.minusDI],adxMaximum=Math.max(50,...adxSeries.flatMap(x=>x.slice(start,end).filter(Number.isFinite)))*1.04,ADY=v=>adxBot-v/adxMaximum*(adxBot-adxTop);
for(let q of [[s.adx,'#f4c27d'],[s.plusDI,'#54d4b0'],[s.minusDI,'#ef7c91']]){ctx.strokeStyle=q[1];ctx.lineWidth=1.5;ctx.beginPath();let init=false;for(let j=start;j<end;j++){if(!Number.isFinite(q[0][j])){init=false;continue;}let x=X(j),y=ADY(q[0][j]);if(!init){ctx.moveTo(x,y);init=true;}else ctx.lineTo(x,y);}ctx.stroke();}
let thr=Number($('adxMin').value)||25;ctx.strokeStyle='#657790';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x0,ADY(thr));ctx.lineTo(x1,ADY(thr));ctx.stroke();ctx.setLineDash([]);
ctx.fillStyle='#839ab5';ctx.font='10px system-ui';ctx.fillText('VOLUMEN 4H',x0+4,volTop+11);ctx.fillText('SQUEEZE / MOMENTUM',x0+4,momTop+11);ctx.fillText('ADX +DI −DI',x0+4,adxTop+11);ctx.fillText(String(thr),x1+9,ADY(thr)+3);
if(S.offset===0&&Number.isFinite(current())){let y=Y(current());if(y>yt&&y<yb){ctx.strokeStyle='#aac2dfbb';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);}}
if(S.hover>=start&&S.hover<end){let x=X(S.hover);ctx.strokeStyle='#bdc9e266';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(x,yt);ctx.lineTo(x,adxBot);ctx.stroke();ctx.setLineDash([]);}
}
function tooltip(e){if(!geom)return;let r=canvas.getBoundingClientRect(),x=e.clientX-r.left,ix=Math.floor((x-geom.x0)/geom.dx)+geom.start;
if(ix<geom.start||ix>=geom.end){tip.style.display='none';S.hover=-1;redraw();return;}
let b=S.c[ix],s=S.s;S.hover=ix;tip.style.display='block';tip.style.left=x>r.width/2?'14px':Math.max(14,r.width-285)+'px';tip.style.top=Math.max(15,Math.min(r.height-165,e.clientY-r.top-135))+'px';
tip.textContent=date(b.t)+' · 4H\nO '+fmt(b.o)+' · H '+fmt(b.h)+'\nL '+fmt(b.l)+' · C '+fmt(b.c)+'\nVol '+fmt(b.v,2)+'\nADX '+fmt(s.adx[ix],1)+' · DI+ '+fmt(s.plusDI[ix],1)+' / DI− '+fmt(s.minusDI[ix],1)+'\nMomentum '+fmt(s.mom[ix],4)+' · '+(s.signal[ix]?'SEÑAL':'sin señal');tip.style.whiteSpace='pre-line';redraw();}
canvas.addEventListener('wheel',e=>{e.preventDefault();S.view=Math.max(45,Math.min(350,Math.round(S.view*(e.deltaY>0?1.15:.87))));S.offset=Math.min(S.offset,Math.max(0,S.c.length-S.view));redraw();},{passive:false});
canvas.addEventListener('mousedown',e=>{if(geom)S.drag={x:e.clientX,offset:S.offset};});
window.addEventListener('mouseup',()=>{S.drag=null;});
canvas.addEventListener('mousemove',e=>{if(S.drag&&geom){S.offset=Math.max(0,Math.min(S.c.length-S.view,Math.round(S.drag.offset+(e.clientX-S.drag.x)/geom.dx)));tip.style.display='none';redraw();}else tooltip(e);});
canvas.addEventListener('mouseleave',()=>{tip.style.display='none';S.hover=-1;redraw();});
canvas.addEventListener('dblclick',()=>{S.offset=0;S.view=140;redraw();});
new ResizeObserver(redraw).observe(canvas);
$('analyze').addEventListener('click',()=>load($('symbol').value));
$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter')load($('symbol').value);});
document.querySelectorAll('[data-pair]').forEach(b=>b.addEventListener('click',()=>{$('symbol').value=b.dataset.pair;load(b.dataset.pair);}));
$('profileDays').addEventListener('change',()=>load(S.pair));
$('vpResolution').addEventListener('change',()=>load(S.pair));
for(let id of ['adxEnabled','adxMin'])$(id).addEventListener('change',()=>compute());
for(let id of ['emaVisible','bandsVisible','vpVisible','planVisible'])$(id).addEventListener('change',redraw);
for(let id of ['capital','riskPct'])$(id).addEventListener('input',refresh);
setInterval(()=>{if(S.c.length){refresh();}},15000);
load('SOLUSDT');
})();