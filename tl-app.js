/* Trading Latino 1.0 — presentation only; all signals shared with scheduled Node scanner. */
(function(){
'use strict';
const E=window.TLEngine,D=window.TLData,$=id=>document.getElementById(id),MS=E.PERIOD;
const state={rows:[],active:'BTCUSDT',period:'4h',bars:[],ind:null,back:null,profile:null,view:100,offset:0,
 busy:false,seq:0,radarSeq:0,drawHover:-1,drag:null,radarTime:0};
const fmt=(x,n=2)=>Number.isFinite(x)?Number(x).toLocaleString('en-US',{maximumFractionDigits:n}):'—';
const price=x=>fmt(x,!Number.isFinite(x)?2:x>=100?2:x>=1?4:x>=.01?6:9);
const percent=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'—';
const utc=t=>Number.isFinite(t)?new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
const set=(id,s)=>{if($(id))$(id).textContent=String(s);};
const priority={signal:0,watch:1,position:2,bear:3,blocked:4,queued:5,excluded:6,missing:6,error:7};
const tag=x=>({signal:'LONG CONFIRMADO',watch:'VIGILAR',position:'POSICIÓN TEÓRICA',bear:'DETERIORO',blocked:'SIN ENTRADA',
 queued:'EN COLA',error:'SIN DATOS',excluded:'NO APLICA',missing:'SIN PAR'})[x]||x;
function clear(){state.bars=[];state.ind=null;state.profile=null;state.back=null;
 for(const id of ['tlChecks','tlProfile','tlMatrix','tlPlan','tlStop','tlTrades','tlPF','tlReturn','tlDD','tlConfirmed','tlValidity','tlChartHint'])
 set(id,'—');for(const id of ['tlPriceChart','tlMomentumChart','tlADXChart']){let c=$(id);c.getContext('2d').clearRect(0,0,c.width,c.height);}}
function make(tagName,text,className=''){const el=document.createElement(tagName);el.textContent=text;el.className=className;return el;}
function renderRadar(){
 const rows=state.rows,term=$('tlSearch').value.trim().toUpperCase(),filter=$('tlFilter').value,done=rows.filter(x=>x.status!=='queued').length;
 set('tlDone',done+' / '+(rows.length||50));set('tlGreen',rows.filter(x=>x.status==='signal').length);
 set('tlWatch',rows.filter(x=>x.status==='watch').length);
 const sorted=[...rows].filter(x=>(filter==='all'||x.status===filter||(filter==='error'&&['error','missing','excluded'].includes(x.status)))
 &&(x.symbol?.includes(term)||x.name?.toUpperCase().includes(term))).sort((a,b)=>(priority[a.status]??8)-(priority[b.status]??8)||a.rank-b.rank);
 const tb=$('tlRows');tb.replaceChildren();
 for(const x of sorted){const tr=document.createElement('tr');
 const info=[String(x.rank),x.symbol,price(x.price),tag(x.status),
 Number.isFinite(x.ema10)?price(x.ema10)+' / '+price(x.ema55):'—',
 Number.isFinite(x.momentum)?fmt(x.momentum,4)+' / '+x.squeeze:'—',fmt(x.adx,1),x.reason||''];
 for(let i=0;i<info.length;i++){let td=make('td',info[i]);if(i===1)td.append(make('small',x.name));if(i===3){td.textContent='';td.append(make('span',info[i],'pill '+x.status));}tr.append(td);}
 const td=document.createElement('td');if(!['excluded','missing','error','queued'].includes(x.status)){
 const button=make('button','Ver gráfico ↗','opener');button.type='button';button.addEventListener('click',()=>{loadCoin(x.symbol+'USDT',state.period);$('tlDetail').scrollIntoView({behavior:'smooth'});});td.append(button);}else td.textContent='—';tr.append(td);tb.append(tr);}
 if(!sorted.length){let tr=document.createElement('tr'),td=make('td','No hay activos para este filtro');td.colSpan=9;tr.append(td);tb.append(tr);}
}
async function radar(force=false){let seq=++state.radarSeq;state.rows=[];renderRadar();set('tlRadarMsg','Validando snapshot remoto y ranking de mercado…');
 if(!force){try{
  const response=await fetch('/data/tl-radar.json?cache='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('Sin snapshot');
  const snap=await response.json(),expected=Math.floor(Date.now()/MS['4h'])*MS['4h']-MS['4h'];
  if(snap.version!==E.version||snap.lastCandle!==expected||Date.now()-Date.parse(snap.generatedAt)>MS['4h']+15*60000
  ||snap.items?.length!==50)throw Error('Snapshot caducado');
  if(seq!==state.radarSeq)return;state.rows=snap.items;state.radarTime=Date.parse(snap.generatedAt);
  set('tlRadarMsg','Snapshot automatizado · '+utc(state.radarTime)+' · '+snap.analyzed+' activos analizados');
  set('tlData','RADAR REMOTO');set('tlLast',utc(snap.lastCandle+MS['4h']));renderRadar();return;
 }catch(e){set('tlRadarMsg','Snapshot ausente / obsoleto: '+e.message+'. Escaneando directamente…');}}
 try{const [r,markets]=await Promise.all([D.rank(),D.exchange()]);if(seq!==state.radarSeq)return;
 const counts=new Map();for(const x of r.coins)counts.set(x.symbol,(counts.get(x.symbol)||0)+1);
 const duplicates=new Set([...counts].filter(([,n])=>n>1).map(([s])=>s));
 state.rows=r.coins.map(c=>{let reason=D.gate(c,markets,duplicates);return{...c,status:reason?(markets.has(c.symbol)?'excluded':'missing'):'queued',reason:reason||'Analizando velas cerradas…'};});
 set('tlData','BINANCE SPOT');set('tlLast','Top 50 '+utc(Date.now()));renderRadar();
 let next=0;const worker=async()=>{while(seq===state.radarSeq&&next<state.rows.length){const x=state.rows[next++];if(x.status!=='queued')continue;
  try{Object.assign(x,D.classify(await D.history(x.symbol+'USDT','4h')));}
  catch(e){x.status='error';x.reason=String(e.message||e);}
  if(seq===state.radarSeq){set('tlRadarMsg','Verificación independiente en navegador: '+state.rows.filter(y=>y.status!=='queued').length+'/50 · sin persistencia remota');renderRadar();}
 }};
 await Promise.all([worker(),worker(),worker()]);
 if(seq===state.radarSeq)set('tlRadarMsg','Escaneo local finalizado · el scheduler remoto publica snapshots separados cuando está disponible');
 }catch(e){if(seq===state.radarSeq){set('tlData','ERROR DE MERCADO');set('tlRadarMsg','No se pudo validar el universo: '+e.message);renderRadar();}}
}
async function loadCoin(symbol=state.active,period=state.period){symbol=String(symbol).toUpperCase().trim();if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol)){set('tlProvider','Par inválido · usar BTCUSDT, ETHUSDT, etc.');return;}
 state.active=symbol;state.period=period;state.seq++;const seq=state.seq;clear();set('tlPair',symbol+' · '+period.toUpperCase());set('tlSymbol',symbol);$('tlTimeframe').value=period;
 set('tlDecision','CARGANDO…');set('tlWhy','Validando histórico y última vela cerrada…');set('tlProvider','Binance Spot · '+period+' · verificando cobertura');
 try{const downloaded=await D.history(symbol,period);if(seq!==state.seq)return;
 const ind=E.indicators(downloaded.bars),last=E.latest(downloaded.bars,ind,period);
 if(last.status==='SIN DATOS')throw Error(last.reason);
 const back=E.backtest(downloaded.bars,ind),results=E.stats(back);
 state.bars=downloaded.bars;state.ind=ind;state.back=back;
 const n=downloaded.bars.length,k=n-1,b=downloaded.bars[k];
 const windowDays=30,first=b.t-windowDays*86400000;
 state.profile=E.profile(downloaded.bars.filter(x=>x.t>=first),60);
 set('tlProvider',downloaded.source+' · '+n+' velas · '+downloaded.gaps+' huecos históricos');
 const live=back.pos?'MANTENER (TEÓRICO)':last.signal?'LONG CONFIRMADO':last.status==='DETERIORO'?'DETERIORO BAJISTA':last.status==='VIGILAR'?'VIGILAR':'ESPERAR';
 set('tlDecision',live);set('tlWhy',back.pos?'Existe posición en la simulación. No implica que el usuario haya comprado.':last.reason);
 set('tlConfirmed','Cierre '+utc(b.t+MS[period]));set('tlValidity','La apertura siguiente ya pudo ocurrir: señal confirmada ≠ orden a mercado.');
 const atr=ind.atr[k];set('tlPlan','ATR14: '+price(atr)+' · stop a 1,5 ATR · objetivo 2R');
 set('tlStop',back.pos?'Stop teórico: '+price(back.pos.sl)+' · TP: '+price(back.pos.tp):
  'Referencia sobre último cierre (NO ejecutable): SL '+price(b.c-1.5*atr)+' · TP '+price(b.c+3*atr)+'. Precio de próxima apertura aún no validado.');
 const conditions=[['Tendencia EMA10 > EMA55',ind.parts[k].trend],['Histograma negativo gira al alza',ind.parts[k].turn],
 ['ADX cae desde ≥23',ind.parts[k].weakness],['Datos e indicadores suficientes',ind.parts[k].valid],
 ['Confirmación +DI > −DI (informativa)',ind.parts[k].diBull]];
 const checks=$('tlChecks');checks.replaceChildren();for(const [label,pass] of conditions){const c=make('div','','check');c.append(make('span',label),make('b',pass?'SÍ':'NO',pass?'yes':'no'));checks.append(c);}
 set('tlProfile',state.profile?'POC '+price(state.profile.poc)+' · VAH '+price(state.profile.vah)+' · VAL '+price(state.profile.val):
 'Histórico insuficiente para volumen estimado');
 set('tlTrades',results.trades);set('tlPF',fmt(results.pf,2));set('tlReturn',percent(results.returnPct));
 set('tlDD',percent(results.drawdown));set('tlVerdict','EVIDENCIA INSUFICIENTE');
 set('tlChartHint','Vela '+utc(b.t)+' · perfil derivado de OHLCV 30 días / estimado · fuente '+downloaded.source);
 state.offset=0;draw();
 }catch(e){if(seq!==state.seq)return;clear();set('tlDecision','SIN DATOS');set('tlWhy','No se puede habilitar operación: '+String(e.message||e));set('tlProvider','Error verificable · sin señales ni niveles heredados');}
}
function canvas(id){let cv=$(id),rect=cv.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(250,rect.width),h=Number(cv.getAttribute('height'))||112;
 cv.width=Math.round(w*ratio);cv.height=Math.round(h*ratio);const ctx=cv.getContext('2d');ctx.scale(ratio,ratio);return{ctx,w,h};}
function draw(){if(!state.bars.length)return;const b=state.bars,s=state.ind,n=b.length,amount=Math.min(state.view,n),last=n-state.offset,start=Math.max(0,last-amount),sub=b.slice(start,last);
 if(!sub.length)return;const px=canvas('tlPriceChart'),{ctx,w,h}=px;const left=18,right=65,top=25,bottom=27,plotW=w-left-right;
 const min=Math.min(...sub.map(x=>x.l)),max=Math.max(...sub.map(x=>x.h)),range=max-min||1,pad=range*.1;
 const ymin=min-pad,ymax=max+pad,Y=x=>top+(ymax-x)/(ymax-ymin)*(h-top-bottom),X=j=>left+(j+.5)*plotW/sub.length;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0e1925';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#29384b';ctx.lineWidth=1;ctx.fillStyle='#9eb5c7';ctx.font='11px system-ui';
 for(let k=0;k<5;k++){const val=ymin+(ymax-ymin)*k/4,y=Y(val);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right+5,y);ctx.stroke();ctx.fillText(price(val),w-right+7,y+4);}
 const barW=Math.max(1,plotW/sub.length*.62);
 for(let j=0;j<sub.length;j++){const z=sub[j],green=z.c>=z.o,col=green?'#34d399':'#fb7185',x=X(j);
 ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,Y(z.h));ctx.lineTo(x,Y(z.l));ctx.stroke();
 ctx.fillRect(x-barW/2,Math.min(Y(z.c),Y(z.o)),barW,Math.max(1,Math.abs(Y(z.c)-Y(z.o))));}
 for(const [series,col] of [[s.ema10,'#43d2ee'],[s.ema55,'#f3ba62']]){
  ctx.strokeStyle=col;ctx.lineWidth=1.4;ctx.beginPath();let begun=false;
  for(let j=0;j<sub.length;j++){let v=series[start+j];if(!Number.isFinite(v))continue;begun?ctx.lineTo(X(j),Y(v)):ctx.moveTo(X(j),Y(v));begun=true;}ctx.stroke();}
 const p=state.profile;if(p){for(const [v,color,label] of [[p.poc,'#d6aa52','POC'],[p.vah,'#798ee0','VAH'],[p.val,'#798ee0','VAL']]){
 if(v<ymin||v>ymax)continue;ctx.strokeStyle=color;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(left,Y(v));ctx.lineTo(w-right,Y(v));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.fillText(label,left+5,Y(v)-3);}}
 const hot=state.drawHover>=start&&state.drawHover<last?state.drawHover:last-1,z=b[hot],j=hot-start;
 ctx.fillStyle='#b7cada';ctx.fillText(utc(z.t).slice(0,16)+' · O '+price(z.o)+' H '+price(z.h)+' L '+price(z.l)+' C '+price(z.c),left+3,15);
 ctx.strokeStyle='#5f7388';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(X(j),top);ctx.lineTo(X(j),h-bottom);ctx.stroke();ctx.setLineDash([]);
 for(const [id,data,color,baseline] of [['tlMomentumChart',s.momentum,'#44c9df',0],['tlADXChart',s.adx,'#e8bc70',23]]){
 const c=canvas(id),g=c.ctx,width=c.w,height=c.h,vals=data.slice(start,last).filter(Number.isFinite);
 g.clearRect(0,0,width,height);g.fillStyle='#94a9bc';g.font='11px system-ui';
 g.fillText(id==='tlMomentumChart'?'SQUEEZE MOMENTUM — LazyBear':'ADX 14 / nivel 23',12,14);
 if(!vals.length)continue;let lo=Math.min(...vals,baseline),hi=Math.max(...vals,baseline);
 if(hi===lo){hi+=1;lo-=1;}let toY=v=>22+(hi-v)/(hi-lo)*(height-34);
 g.strokeStyle='#43546b';g.beginPath();g.moveTo(left,toY(baseline));g.lineTo(width-10,toY(baseline));g.stroke();
 g.strokeStyle=color;g.fillStyle=color;
 for(let i=0;i<sub.length;i++){let v=data[start+i];if(!Number.isFinite(v))continue;let x=left+(i+.5)*(width-left-10)/sub.length;
 if(id==='tlMomentumChart'){g.fillStyle=v>=0?'#3fc7ad':'#dd7a92';g.fillRect(x-1.5,Math.min(toY(0),toY(v)),3,Math.max(1,Math.abs(toY(v)-toY(0))));}
 else{if(i===0)g.beginPath();i?g.lineTo(x,toY(v)):g.moveTo(x,toY(v));}}
 if(id==='tlADXChart')g.stroke();
 }
}
async function multiTime(){let symbol=state.active,seq=state.seq;set('tlMatrix','Descargando 1H / 4H / 1D por separado…');const rows=[];
 for(const period of ['1h','4h','1d']){try{const r=await D.history(symbol,period);if(seq!==state.seq)return;const ind=E.indicators(r.bars),x=E.latest(r.bars,ind,period),k=r.bars.length-1;
 rows.push(period.toUpperCase()+' · '+x.status+' · EMA '+(ind.ema10[k]>ind.ema55[k]?'↑':'↓')+' · ADX '+fmt(ind.adx[k],1)+' · '+utc(r.bars[k].t+MS[period]));}
 catch(e){rows.push(period.toUpperCase()+' · SIN DATOS · '+e.message);}}
 if(seq===state.seq)set('tlMatrix',rows.join('  |  '));
}
function init(){set('tlClock',new Date().toLocaleString('es-AR',{timeZone:'UTC'})+' UTC');
 $('tlRefresh').onclick=()=>radar(true);$('tlFilter').onchange=renderRadar;$('tlSearch').oninput=renderRadar;
 $('tlAnalyze').onclick=()=>loadCoin($('tlSymbol').value,$('tlTimeframe').value);
 $('tlTimeframe').onchange=()=>loadCoin(state.active,$('tlTimeframe').value);
 $('tlMTF').onclick=multiTime;
 $('tlZoomIn').onclick=()=>{state.view=Math.max(35,Math.floor(state.view*.8));draw();};
 $('tlZoomOut').onclick=()=>{state.view=Math.min(300,Math.ceil(state.view*1.25));draw();};
 $('tlEnd').onclick=()=>{state.offset=0;draw();};
 const c=$('tlPriceChart');c.addEventListener('wheel',e=>{e.preventDefault();state.view=Math.max(35,Math.min(300,state.view+(e.deltaY>0?10:-10)));draw();},{passive:false});
 c.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,offset:state.offset};c.setPointerCapture(e.pointerId);});
 c.addEventListener('pointerup',()=>{state.drag=null;});c.addEventListener('pointercancel',()=>{state.drag=null;});
 c.addEventListener('pointermove',e=>{if(!state.bars.length)return;
 if(state.drag){state.offset=Math.max(0,Math.min(state.bars.length-state.view,Math.round(state.drag.offset+(e.clientX-state.drag.x)/Math.max(3,c.clientWidth/state.view))));}
 else{let ratio=(e.clientX-c.getBoundingClientRect().left-18)/Math.max(1,c.clientWidth-83);
 state.drawHover=Math.max(0,Math.min(state.bars.length-1,state.bars.length-state.offset-state.view+Math.floor(ratio*state.view)));}
 draw();});
 window.addEventListener('resize',draw);
 let stamp=Math.floor(Date.now()/MS['4h']);setInterval(()=>{const x=Math.floor(Date.now()/MS['4h']);if(x!==stamp){stamp=x;radar();loadCoin();}},60000);
 loadCoin('BTCUSDT','4h');radar();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();