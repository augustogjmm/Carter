/* PCS Squeeze Regime Pro — independent visual/research engine.
   Fixed rules, UTC 4h, next-bar execution, no live orders. */
(function(){
'use strict';
const BAR=14400000, START=Date.UTC(2020,0,1), CUT=Date.UTC(2023,0,1);
const FEE=0.001, $=id=>document.getElementById(id);
const state={symbol:'BTCUSDT',candles:[],ind:null,back:null,provider:'',rangeComplete:false,gaps:0,busy:false,view:145,offset:0,drag:null,hover:-1,token:0};
const num=x=>Number(x);
const finite=Number.isFinite;
const fmt=(x,n=2)=>finite(x)?x.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=x=>finite(x)?(x>=0?'+':'')+fmt(x*100,2)+'%':'—';
const iso=t=>new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC';
const local=t=>new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
const set=(id,v)=>{if($(id))$(id).textContent=String(v);};
const els={};
const downloads=new Map();
function ema(src,n){let arr=Array(src.length).fill(NaN),alpha=2/(n+1),last=NaN;for(let i=0;i<src.length;i++){last=finite(last)?last+alpha*(src[i]-last):src[i];if(i>=n-1)arr[i]=last;}return arr;}
function sma(src,n){let out=Array(src.length).fill(NaN),sum=0;for(let i=0;i<src.length;i++){sum+=src[i];if(i>=n)sum-=src[i-n];if(i>=n-1)out[i]=sum/n;}return out;}
function indicators(bars){
const n=bars.length,cl=bars.map(x=>x.c),vol=bars.map(x=>x.v),e10=ema(cl,10),e50=ema(cl,50),e200=ema(cl,200),e20=ema(cl,20),s20=sma(cl,20),v20=sma(vol,20);
const tr=Array(n).fill(0),atr=Array(n).fill(NaN),up=Array(n).fill(0),down=Array(n).fill(0);
for(let i=0;i<n;i++){let b=bars[i];tr[i]=i?Math.max(b.h-b.l,Math.abs(b.h-bars[i-1].c),Math.abs(b.l-bars[i-1].c)):b.h-b.l;
if(i){let u=b.h-bars[i-1].h,d=bars[i-1].l-b.l;up[i]=u>d&&u>0?u:0;down[i]=d>u&&d>0?d:0;}}
let trRoll=sma(tr,20);for(let i=0;i<n;i++)atr[i]=trRoll[i];
const bbU=Array(n).fill(NaN),bbL=Array(n).fill(NaN),kcU=Array(n).fill(NaN),kcL=Array(n).fill(NaN),sq=Array(n).fill(false),sqWindow=Array(n).fill(false),priorHH=Array(n).fill(NaN);
let sqN=0;
for(let i=0;i<n;i++){
 if(i>=19){let variance=0;for(let j=i-19;j<=i;j++)variance+=(cl[j]-s20[i])**2;let sd=Math.sqrt(variance/20);bbU[i]=s20[i]+2*sd;bbL[i]=s20[i]-2*sd;kcU[i]=e20[i]+1.5*atr[i];kcL[i]=e20[i]-1.5*atr[i];sq[i]=bbU[i]<=kcU[i]&&bbL[i]>=kcL[i];}
 if(i>=21){let h=-Infinity;for(let j=i-21;j<i;j++)h=Math.max(h,bars[j].h);priorHH[i]=h;}
 if(sq[i])sqN++;if(i>=16&&sq[i-16])sqN--;sqWindow[i]=sqN>0;
}
const adx=Array(n).fill(NaN),plus=Array(n).fill(NaN),minus=Array(n).fill(NaN),dx=Array(n).fill(NaN),p=14;
if(n>=p+1){let smoothTR=0, smoothUp=0,smoothDown=0;for(let i=1;i<=p;i++){smoothTR+=tr[i];smoothUp+=up[i];smoothDown+=down[i];}
for(let i=p;i<n;i++){if(i>p){smoothTR=smoothTR-smoothTR/p+tr[i];smoothUp=smoothUp-smoothUp/p+up[i];smoothDown=smoothDown-smoothDown/p+down[i];}
plus[i]=smoothTR>0?100*smoothUp/smoothTR:0;minus[i]=smoothTR>0?100*smoothDown/smoothTR:0;
dx[i]=(plus[i]+minus[i])>0?100*Math.abs(plus[i]-minus[i])/(plus[i]+minus[i]):0;
}
if(n>=2*p){let first=0;for(let i=p;i<2*p;i++)first+=dx[i];adx[2*p-1]=first/p;for(let i=2*p;i<n;i++)adx[i]=((p-1)*adx[i-1]+dx[i])/p;}
}
const sig=Array.from({length:n},()=>({regime:false,A:false,B:false,squeeze:false,breakout:false,volume:false,adxA:false,touch:false,bull:false,adxB:false,emaB:false}));
for(let i=199;i<n;i++){
 let b=bars[i],regime=b.c>e200[i]&&e50[i]>e50[i-5],sqRecent=sqWindow[i],breakout=b.c>priorHH[i],volume=b.v>1.3*v20[i],adxA=adx[i]>=18,emaB=e10[i]>e50[i],touch=b.l<=e10[i],bull=b.c>b.o,adxB=adx[i]>=20;
 sig[i]={regime,A:regime&&sqRecent&&breakout&&volume&&adxA,B:regime&&emaB&&touch&&bull&&adxB,squeeze:sqRecent,breakout,volume,adxA,emaB,touch,bull,adxB};
}
return{ema10:e10,ema50:e50,ema200:e200,atr,bbU,bbL,kcU,kcL,sq,v20,priorHH,adx,plus,minus,sig};
}
function backtest(b,s,capital=1000,cap=3){
let cash=capital,pos=null,pending=null,ops=[],legs=[],curve=[];
for(let k=0;k<b.length;k++){
const c=b[k];
if(pending!==null&&!pos&&cash>0&&finite(s.atr[pending])&&s.atr[pending]>0){
let entry=c.o,dist=1.5*s.atr[pending],qty=Math.min(0.01*cash/dist,cap*cash/(entry*(cap===1?1+FEE:1)));
if(qty>0&&finite(qty)){
cash-=qty*entry*(1+FEE);
pos={entry,dist,sl:entry-dist,tp:entry+dist,qty,orig:qty,tpDone:false,start:k,entryT:c.t,pnl:0,parts:0,signal:pending};
}}
pending=null;
if(pos){
const sell=(quantity,price,why)=>{
 const pnl=quantity*(price-pos.entry)-quantity*pos.entry*FEE-quantity*price*FEE;
 cash+=quantity*price*(1-FEE);pos.qty-=quantity;pos.pnl+=pnl;pos.parts++;
 legs.push({entry:pos.entryT,exit:c.t,why,pnl,qty:quantity,entryIdx:pos.start,exitIdx:k});
 if(pos.qty<1e-10){ops.push({entry:pos.entryT,exit:c.t,pnl:pos.pnl,legs:pos.parts,signal:pos.signal,why,entryPrice:pos.entry,exitPrice:price});pos=null;}
};
if(c.l<=pos.sl){sell(pos.qty,Math.min(pos.sl,c.o),'SL');}
else{
 if(!pos.tpDone&&c.h>=pos.tp){let half=pos.orig*0.5;sell(half,pos.tp,'TP1');if(pos){pos.tpDone=true;pos.sl=Math.max(pos.sl,pos.entry);}}
 if(pos&&k-pos.start>=300)sell(pos.qty,c.c,'TIEMPO');
 if(pos&&pos.tpDone&&finite(s.atr[k]))pos.sl=Math.max(pos.sl,c.c-2.5*s.atr[k]);
}}
const equity=cash+(pos?pos.qty*c.c:0);
curve.push({t:c.t,equity});
if(!pos&&(s.sig[k].A||s.sig[k].B)&&k+1<b.length)pending=k;
}
return{curve,ops,legs,pos,capital,cap};
}
function stats(back,start=0,end=Infinity){
const curve=back.curve.filter(x=>x.t>=start&&x.t<=end);
if(curve.length<2)return null;
const prev=back.curve.slice().reverse().find(x=>x.t<start);
const first=prev?prev.equity:back.capital,final=curve[curve.length-1].equity;
const days=(curve[curve.length-1].t+BAR-Math.max(start,curve[0].t))/86400000;
let peak=first,dd=0;for(let v of curve){peak=Math.max(peak,v.equity);if(peak>0)dd=Math.max(dd,1-v.equity/peak);}
const legs=back.legs.filter(x=>x.exit>=start&&x.exit<=end),ops=back.ops.filter(x=>x.entry>=start&&x.entry<=end);
let wins=0,loss=0;for(let x of legs){if(x.pnl>0)wins+=x.pnl;else loss-=x.pnl;}
const ann=first>0&&final>0&&days>0?Math.pow(final/first,365.25/days)-1:NaN;
return{ann,dd,calmar:dd>0?ann/dd:NaN,pf:loss>0?wins/loss:NaN,wr:legs.length?legs.filter(x=>x.pnl>0).length/legs.length:NaN,ops:ops.length,legs:legs.length,ret:first>0?final/first-1:NaN,first,final};
}
function dedup(rows){let m=new Map();for(let b of rows){if([b.t,b.o,b.h,b.l,b.c,b.v].every(finite)&&b.h>=b.l&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c)&&b.l>0&&b.v>=0&&b.t%BAR===0)m.set(b.t,b);}return [...m.values()].sort((a,b)=>a.t-b.t);}
async function getJson(url){
 const urls=[url];
 if(typeof document!=='undefined'&&/^https:\/\//.test(url)){
  const parsed=new URL(url);
  if(parsed.pathname==='/api/v3/klines'||parsed.pathname==='/api/v3/exchangeInfo'||parsed.pathname==='/v5/market/kline')urls.push('/api/market?'+new URLSearchParams({path:parsed.pathname,query:parsed.search.slice(1)}));
 }
 let error;
 for(const target of urls){
  try{const r=await fetch(target,{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
  catch(e){error=e;}
 }
 throw error;
}
function updateProgress(message){if(typeof document!=='undefined')set('pcsProgress',message);}
async function binance(symbol,base){
let cursor=START,rows=[],lastClosed=Math.floor(Date.now()/BAR)*BAR-BAR;
for(let page=0;page<30&&cursor<=lastClosed;page++){
 let params='?symbol='+symbol+'&interval=4h&limit=1000&startTime='+cursor+'&endTime='+(lastClosed+BAR);
 let r=await getJson(base+'/api/v3/klines'+params);if(!Array.isArray(r))throw new Error('Formato Binance inválido');
 if(!r.length)break;
 for(let z of r)rows.push({t:+z[0],o:+z[1],h:+z[2],l:+z[3],c:+z[4],v:+z[5]});
 let last=+r[r.length-1][0];if(last<cursor)throw new Error('Paginación Binance no avanza');
 cursor=last+BAR;updateProgress('Binance Spot · '+symbol+' · '+rows.length+' velas descargadas');
 if(r.length<1000)break;
}
return dedup(rows).filter(x=>x.t>=START&&x.t+BAR<=Date.now());
}
async function bybit(symbol){
let rows=[],end=Date.now(),last=Infinity;
for(let page=0;page<30;page++){
 let u='https://api.bybit.com/v5/market/kline?category=spot&symbol='+symbol+'&interval=240&end='+end+'&limit=1000';
 let r=await getJson(u);if(r.retCode!==0||!Array.isArray(r.result?.list))throw new Error('Bybit: '+(r.retMsg||'datos inválidos'));
 if(!r.result.list.length)break;
 let batch=r.result.list;for(let z of batch)rows.push({t:+z[0],o:+z[1],h:+z[2],l:+z[3],c:+z[4],v:+z[5]});
 let earliest=Math.min(...batch.map(x=>+x[0]));if(earliest>=last)break;last=earliest;end=earliest-1;
 updateProgress('Bybit spot · '+symbol+' · '+rows.length+' velas descargadas');
 if(earliest<=START||batch.length<1000)break;
}
return dedup(rows).filter(x=>x.t>=START&&x.t+BAR<=Date.now());
}
async function fetchHistory(symbol){
let errors=[],bars=[],provider='';
for(let url of ['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com']){
 try{bars=await binance(symbol,url);if(bars.length<250)throw new Error('Muy pocas velas');provider='Binance Spot · '+new URL(url).hostname;break;}
 catch(e){errors.push(e.message);}
}
if(!provider){
 updateProgress('Binance no respondió; intentando Bybit V5 spot…');
 try{bars=await bybit(symbol);if(bars.length<250)throw new Error('Muy pocas velas');provider='Bybit V5 Spot (respaldo)';}catch(e){errors.push(e.message);}
}
if(!provider)throw new Error('Sin datos suficientes: '+errors.join(' | '));
let gaps=0;for(let i=1;i<bars.length;i++)if(bars[i].t-bars[i-1].t!==BAR)gaps++;
return{bars,provider,gaps,complete:bars.length>250&&bars[0].t===START&&gaps===0};
}
async function download(symbol){
 if(!/^[A-Z0-9]{2,24}USDT$/.test(symbol))throw new Error('Par inválido');
 const slot=Math.floor(Date.now()/BAR),key=symbol+':'+slot;
 for(const old of downloads.keys())if(Number(old.split(':').at(-1))<slot)downloads.delete(old);
 if(!downloads.has(key)){
  const job=fetchHistory(symbol).then(result=>{
   const expected=Math.floor(Date.now()/BAR)*BAR-BAR;
   if(result.bars.at(-1)?.t!==expected)throw new Error('Histórico obsoleto: falta la última vela 4H cerrada');
   for(let i=Math.max(1,result.bars.length-350);i<result.bars.length;i++)if(result.bars[i].t-result.bars[i-1].t!==BAR)throw new Error('Hueco en las últimas 350 velas: señal suspendida');
   return result;
  }).catch(e=>{downloads.delete(key);throw e;});
  downloads.set(key,job);
 }
 return downloads.get(key);
}
function calcAndShow(){
if(!state.candles.length)return;
let capital=Math.max(1,Number($('pcsCapital').value)||1000),cap=Number($('pcsLeverage').value)||3;
state.back=backtest(state.candles,state.ind,capital,cap);
render();draw();
}
function mark(check){return check?'✓':'×';}
function flag(id,on){set(id,on?'CUMPLE':'NO CUMPLE');$(id).className=on?'pcs-pass':'pcs-fail';}
function lineCheck(root,n,ok,note){let r=document.createElement('div');r.className='pcs-check';let a=document.createElement('span');a.textContent=n+(note?' · '+note:'');let b=document.createElement('b');b.textContent=mark(ok);b.className=ok?'pcs-pass':'pcs-fail';r.append(a,b);root.append(r);}
function render(){
const b=state.candles,s=state.ind,last=b.length-1,x=b[last],q=s.sig[last],p=state.back.pos,cap=state.back.capital,limit=state.back.cap;
const fmtp=x=>fmt(x,!finite(x)?2:Math.abs(x)>=100?2:Math.abs(x)>=1?3:Math.abs(x)>=.01?5:8);
set('pcsSource',state.provider+' · 4H');set('pcsChartTitle',state.symbol+' · 4H · '+b.length.toLocaleString('es-AR')+' velas');
set('pcsDataSpan','Desde '+iso(b[0].t)+' hasta '+iso(x.t)+' (aperturas UTC)');
set('pcsCompleteness',state.rangeComplete?'COBERTURA 2020 · SIN GAPS':'HISTÓRICO INCOMPLETO · PRECAUCIÓN');
set('pcsEvidence','BACKTEST LOCAL · NO AUDITADO');set('pcsPrice',fmtp(x.c));set('pcsPriceAt',local(x.t+BAR)+' · último cierre');
set('pcsRegime',q.regime?'ALCISTA':'SIN RÉGIMEN');set('pcsRegimeSub','EMA50 '+fmtp(s.ema50[last])+' · EMA200 '+fmtp(s.ema200[last]));
set('pcsSqueeze',s.sq[last]?'EN COMPRESIÓN':'FUERA');set('pcsSqSub',q.squeeze?'ON en últimas 16 velas':'Sin ON reciente');
set('pcsADX',fmt(s.adx[last],1));set('pcsADXSub','+DI '+fmt(s.plus[last],1)+' / −DI '+fmt(s.minus[last],1));
set('pcsAtr',fmtp(s.atr[last]));set('pcsVolSub','V / SMA20: '+fmt(x.v/s.v20[last],2)+'×');
set('pcsSignalWhen','Vela cerrada: '+local(x.t+BAR)+' · sin anticipación');
set('pcsNextClose',local((Math.floor(Date.now()/BAR)+1)*BAR));
flag('pcsRegFlag',q.regime);flag('pcsAFlag',q.A);flag('pcsBFlag',q.B);
set('pcsRegText','Cierre '+fmtp(x.c)+' '+(x.c>s.ema200[last]?'>':'≤')+' EMA200 '+fmtp(s.ema200[last])+'; EMA50 ahora '+fmtp(s.ema50[last])+' / hace 5 velas '+fmtp(s.ema50[last-5]));
const a=$('pcsAConditions');a.replaceChildren();lineCheck(a,'Squeeze ON en últimas 16',q.squeeze);lineCheck(a,'Cierre supera máximos previos 21',q.breakout,fmtp(s.priorHH[last]));lineCheck(a,'ADX ≥ 18',q.adxA,fmt(s.adx[last],1));lineCheck(a,'Volumen > 1,3× media',q.volume,fmt(x.v/s.v20[last],2)+'×');
const c=$('pcsBConditions');c.replaceChildren();lineCheck(c,'EMA10 > EMA50',q.emaB);lineCheck(c,'Mínimo toca EMA10',q.touch,fmtp(s.ema10[last]));lineCheck(c,'Cierre > apertura',q.bull);lineCheck(c,'ADX ≥ 20',q.adxB,fmt(s.adx[last],1));
const title=$('pcsDecision'),hasSignal=q.A||q.B;
title.className='pcs-decision '+(p?'long':hasSignal?'wait':q.regime?'wait':'block');
if(p){set('pcsDecisionTitle','POSICIÓN TEÓRICA ABIERTA');set('pcsDecisionDetail','El backtest muestra una operación todavía abierta al cierre. No implica que hayas comprado. Stop y TP1 se basan en fills históricos simulados.');}
else if(hasSignal){set('pcsDecisionTitle','SEÑAL '+(q.A&&q.B?'A + B':q.A?'A · RUPTURA':'B · REBOTE'));set('pcsDecisionDetail','Confirmada al cierre anterior. PCS exige ejecutar en la apertura de la vela siguiente: esa apertura ya ocurrió. No se debe convertir una señal pasada en una orden tardía.');}
else{set('pcsDecisionTitle',q.regime?'ESPERAR DISPARO A / B':'NO HABILITAR LONG');set('pcsDecisionDetail',q.regime?'Régimen alcista, pero ninguna de las dos puertas cumple todos los requisitos al cierre.':'El cierre no supera EMA200 con pendiente EMA50 positiva a cinco velas. Las puertas A/B quedan bloqueadas.');}
const stopDist=p?p.dist:1.5*s.atr[last],proxy=p?p.entry:x.c,riskEq=p?NaN:cap,qty=p?p.orig:Math.min(0.01*cap/stopDist,limit*cap/(proxy*(limit===1?1+FEE:1))),sl=p?p.sl:proxy-stopDist,tp=p?p.tp:proxy+stopDist;
set('pcsPlanState',p?'POSICIÓN SIMULADA':hasSignal?'SEÑAL CERRADA':'HIPÓTESIS · SIN ENTRADA');
set('pcsEntry',fmtp(proxy)+(p?' · fill histórico':' · cierre proxy'));
set('pcsSL',fmtp(sl));set('pcsTP1',fmtp(tp)+(p?.tpDone?' · 50% realizado':''));
set('pcsTrail',p?(p.tpDone?'ACTIVO · SL '+fmtp(p.sl):'Tras TP1; no activo'):'Solo después de TP1');
set('pcsQty',fmt(p?p.qty:qty,6)+' '+state.symbol.replace(/USDT$/,'')+(p?' · remanente':''));
set('pcsRisk',fmt(qty*stopDist,2)+' USDT · '+fmt(qty*stopDist/cap*100,2)+'%');
if(!p&&!hasSignal){for(const id of ['pcsEntry','pcsSL','pcsTP1','pcsQty','pcsRisk'])set(id,'—');}
set('pcsPlanNote',p?'Posición simulada, no consta ninguna tenencia real. Vela en curso excluida.':hasSignal?'Entrada de la vela siguiente NO disponible retroactivamente. Los niveles con el cierre son estimaciones: los definitivos dependen de la apertura y del ATR de la señal.':'No hay señal PCS vigente: no se construye un plan de compra. Esperar confirmación de A o B al cierre.');
set('pcsCaution',limit===3?'Modo original: exposición máxima 3×. Requiere margen cuando el notional supera el capital; no es operativa spot al contado sin financiación. Intereses, funding y slippage no están modelados.':'Modo contado: exposición máxima 1×, por lo que NO replica exactamente el sizing original 3×. Se mantienen las demás reglas PCS.');
let complete=state.rangeComplete,sections=[['FULL (2020→hoy)',stats(state.back)],['IS (2020–2022)',stats(state.back,START,CUT-1)],['OOS (2023→hoy)',stats(state.back,CUT)]];
let body=$('pcsStats');body.replaceChildren();for(let [name,v] of sections){let tr=document.createElement('tr');let values=v?[name,pct(v.ann),pct(-v.dd),fmt(v.calmar,2),fmt(v.pf,2),pct(v.wr),v.ops+' / '+v.legs]:[name,'—','—','—','—','—','—'];for(let value of values){let td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
if(!complete)set('pcsCompleteness','INCOMPLETO · NO COMPARABLE A §8');
const trades=$('pcsTrades');trades.replaceChildren();for(let op of state.back.ops.slice(-8).reverse()){let tr=document.createElement('tr');for(let text of [local(op.entry),local(op.exit),op.why+' · '+op.legs+' piernas',fmt(op.pnl,2)]){let td=document.createElement('td');td.textContent=text;tr.append(td);}trades.append(tr);}
if(!state.back.ops.length){let tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Sin posiciones cerradas';tr.append(td);trades.append(tr);}
set('pcsFingerprint',state.symbol+' · '+b.length+' velas cerradas · primera '+iso(b[0].t)+' · última '+iso(x.t)+' · gaps '+state.gaps+' · fuente '+state.provider+'. '+(complete?'Inicio íntegro 2020-01-01.':'Cobertura parcial; no comparar contra FULL/IS/OOS originales.'));
}
function stroke(ctx,points,stroke,width=1,dash=[]){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();let seen=false;for(let p of points){if(!p||!finite(p[0])||!finite(p[1])){seen=false;continue;}if(!seen)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);seen=true;}ctx.stroke();ctx.setLineDash([]);}
function text(ctx,s,x,y,color='#9fb5cf',size=10,align='left'){ctx.fillStyle=color;ctx.font=size+'px system-ui';ctx.textAlign=align;ctx.fillText(s,x,y);}
function draw(){
const canvas=$('pcsChart');if(!canvas||!state.candles.length)return;
let box=canvas.getBoundingClientRect(),w=box.width,h=box.height,dpr=Math.min(window.devicePixelRatio||1,2);if(!w||!h)return;
canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
const b=state.candles,s=state.ind,n=b.length,view=Math.min(state.view,n),rightIdx=n-Math.max(0,state.offset),start=Math.max(0,rightIdx-view),end=Math.min(n,rightIdx);
if(end<=start)return;
const left=56,axis=100,plotR=w-axis,plotW=plotR-left,spacing=plotW/Math.max(1,end-start),x=i=>left+(i-start+0.5)*spacing;
const top=18,priceBottom=h*.61,volTop=h*.635,volBottom=h*.75,sqTop=h*.775,sqBottom=h*.807,adxTop=h*.84,adxBottom=h-32;
let lo=Infinity,hi=-Infinity;for(let i=start;i<end;i++){lo=Math.min(lo,b[i].l);hi=Math.max(hi,b[i].h);for(let v of [s.ema10[i],s.ema50[i],s.ema200[i]])if(finite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}
if($('pcsShowBands').checked){for(let i=start;i<end;i++)for(let v of [s.bbU[i],s.bbL[i],s.kcU[i],s.kcL[i]])if(finite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}
const pos=state.back.pos;if(pos&&rightIdx===n){lo=Math.min(lo,pos.sl);hi=Math.max(hi,pos.tp);}
const pad=(hi-lo)*.08||1;lo-=pad;hi+=pad;
const digit=v=>Math.abs(v)>=100?2:Math.abs(v)>=1?3:Math.abs(v)>=.01?5:8;
const yp=v=>top+(hi-v)/(hi-lo)*(priceBottom-top);
ctx.fillStyle='#0d1828';ctx.fillRect(left,top,plotW,priceBottom-top);ctx.fillRect(left,volTop,plotW,volBottom-volTop);ctx.fillRect(left,sqTop,plotW,sqBottom-sqTop);ctx.fillRect(left,adxTop,plotW,adxBottom-adxTop);
for(let k=0;k<6;k++){let y=top+k*(priceBottom-top)/5;stroke(ctx,[[left,y],[plotR,y]],'#26364b',.7);text(ctx,fmt(hi-k*(hi-lo)/5,digit(hi-k*(hi-lo)/5)),w-7,y+3,'#8faac3',10,'right');}
for(let z=0;z<5;z++){let i=start+Math.floor(z*(end-start-1)/4),xx=x(i);stroke(ctx,[[xx,top],[xx,adxBottom]],'#1d2b3e',.7);text(ctx,local(b[i].t).slice(0,5),xx,h-10,'#98abc1',10,'center');}
function drawSeries(arr,color,weight=1.3,dash=[]){let points=[];for(let i=start;i<end;i++)points.push(finite(arr[i])?[x(i),yp(arr[i])]:null);stroke(ctx,points,color,weight,dash);}
if($('pcsShowBands').checked){drawSeries(s.bbU,'#516c98',1,[4,3]);drawSeries(s.bbL,'#516c98',1,[4,3]);drawSeries(s.kcU,'#5f9e8e',1,[2,4]);drawSeries(s.kcL,'#5f9e8e',1,[2,4]);}
drawSeries(s.ema200,'#7fafff',1.8);drawSeries(s.ema50,'#b9a0ff',1.5);drawSeries(s.ema10,'#f5c47f',1.3);
const width=Math.max(1,Math.min(10,spacing*.65)),maxVol=Math.max(...b.slice(start,end).map(x=>x.v),...s.v20.slice(start,end).filter(finite).map(v=>v*1.3),1);
for(let i=start;i<end;i++){
let v=b[i],xx=x(i),green=v.c>=v.o,col=green?'#56cba6':'#ed8096';
stroke(ctx,[[xx,yp(v.h)],[xx,yp(v.l)]],col,1);ctx.fillStyle=col;
let y1=yp(Math.max(v.o,v.c)),y2=yp(Math.min(v.o,v.c));ctx.fillRect(xx-width/2,y1,width,Math.max(1,y2-y1));
ctx.globalAlpha=.65;ctx.fillRect(xx-width/2,volBottom-v.v/maxVol*(volBottom-volTop),width,v.v/maxVol*(volBottom-volTop));ctx.globalAlpha=1;
if(s.sq[i]){ctx.fillStyle='#e4c477';ctx.fillRect(xx-Math.max(1,width/2),sqTop+3,Math.max(2,width),sqBottom-sqTop-6);}
if($('pcsShowSignals').checked){
let g=s.sig[i];if(g.A||g.B){let py=yp(v.l)+11;ctx.fillStyle=g.A&&g.B?'#e5aaff':g.A?'#f5a969':'#5de2ab';ctx.beginPath();ctx.moveTo(xx,py);ctx.lineTo(xx-5,py+10);ctx.lineTo(xx+5,py+10);ctx.closePath();ctx.fill();if(spacing>12)text(ctx,g.A&&g.B?'AB':g.A?'A':'B',xx,py+20,ctx.fillStyle,9,'center');}
}
}
if($('pcsShowSignals').checked){
 const seen=new Set();
 for(const leg of state.back.legs){
  const i=leg.entryIdx,j=leg.exitIdx;
  if(i>=start&&i<end&&!seen.has(i)){seen.add(i);const yy=yp(b[i].l)+30;text(ctx,'E',x(i),yy,'#72e7bd',10,'center');}
  if(j>=start&&j<end){const yy=yp(b[j].h)-10;ctx.fillStyle=leg.why==='TP1'?'#f5c47f':'#ed8096';ctx.fillRect(x(j)-3,yy-3,6,6);if(spacing>9)text(ctx,leg.why,x(j),yy-7,ctx.fillStyle,8,'center');}
 }
 if(pos&&pos.start>=start&&pos.start<end&&!seen.has(pos.start))text(ctx,'E',x(pos.start),yp(b[pos.start].l)+30,'#72e7bd',10,'center');
}
let vThresh=[];for(let i=start;i<end;i++)vThresh.push(finite(s.v20[i])?[x(i),volBottom-(s.v20[i]*1.3)/maxVol*(volBottom-volTop)]:null);
stroke(ctx,vThresh,'#dfc36e',1,[4,4]);text(ctx,'VOL / 1,3×',left+6,volTop+12,'#9eb1c9',10);
text(ctx,'SQUEEZE ON',left+6,sqTop+12,'#afbdcf',9);
const yad=v=>adxBottom-Math.min(Math.max(v,0),60)/60*(adxBottom-adxTop);
for(let [v,name] of [[18,'18'],[20,'20']]){let y=yad(v);stroke(ctx,[[left,y],[plotR,y]],'#52617a',.9,[3,4]);text(ctx,name,w-7,y+2,'#889db7',10,'right');}
const adxColors=[['adx','#f0d085'],['plus','#60d7ac'],['minus','#fa8297']];
for(let [field,color] of adxColors){let pts=[];for(let i=start;i<end;i++)pts.push(finite(s[field][i])?[x(i),yad(s[field][i])]:null);stroke(ctx,pts,color,1.35);}
text(ctx,'ADX14',left+5,adxTop+12,'#e7cb81',10);text(ctx,'+DI',left+58,adxTop+12,'#61d4a4',10);text(ctx,'−DI',left+92,adxTop+12,'#ef90a0',10);
if($('pcsShowLevels').checked&&rightIdx===n&&(pos||s.sig[n-1].A||s.sig[n-1].B)){
let last=b[n-1],ref=pos?pos.entry:last.c,dist=1.5*s.atr[n-1],levels=pos?[['ENTRY',pos.entry,'#9bc8ec'],['SL',pos.sl,'#ff879c'],['TP1',pos.tp,'#ebbd72']]:[['C. PROXY',ref,'#9bc8ec'],['SL HIP.',ref-dist,'#ff879c'],['TP1 HIP.',ref+dist,'#ebbd72']];
for(let [name,v,col] of levels){if(v<lo||v>hi)continue;let y=yp(v);stroke(ctx,[[x(n-1),y],[plotR,y]],col,1,[5,4]);ctx.fillStyle='#142335';ctx.fillRect(plotR,y-11,axis-3,19);text(ctx,name+' '+fmt(v,digit(v)),w-5,y+3,col,10,'right');}
}
if(state.hover>=start&&state.hover<end){
let i=state.hover,v=b[i];stroke(ctx,[[x(i),top],[x(i),adxBottom]],'#b9cde0',.8,[3,3]);set('pcsHover',iso(v.t)+' · O '+fmt(v.o,2)+' · H '+fmt(v.h,2)+' · L '+fmt(v.l,2)+' · C '+fmt(v.c,2)+' · ADX '+fmt(s.adx[i],1)+' · '+(s.sig[i].A?'A ':'')+(s.sig[i].B?'B':'')+(s.sq[i]?' · SQUEEZE ON':''));}
else set('pcsHover','Rueda: zoom · arrastrar: historial · doble clic: últimas velas. Marcadores de señales al cierre; la ejecución ocurre en la siguiente apertura.');}
async function load(symbol){
const token=++state.token;state.busy=true;state.symbol=symbol;state.hover=-1;state.offset=0;state.view=145;
state.candles=[];state.ind=null;state.back=null;
const canvas=$('pcsChart');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
for(const id of ['pcsPrice','pcsPriceAt','pcsRegime','pcsRegimeSub','pcsSqueeze','pcsSqSub','pcsADX','pcsADXSub','pcsAtr','pcsVolSub','pcsEntry','pcsSL','pcsTP1','pcsTrail','pcsQty','pcsRisk','pcsDataSpan','pcsRegFlag','pcsAFlag','pcsBFlag','pcsRegText','pcsPlanNote','pcsSignalWhen','pcsFingerprint'])set(id,'—');
set('pcsChartTitle',symbol+' · cargando 4H');set('pcsDecisionTitle','EVALUANDO '+symbol);set('pcsDecisionDetail','Verificando datos actuales. Señal anterior suspendida.');$('pcsDecision').className='pcs-decision block';
for(const id of ['pcsAConditions','pcsBConditions'])set(id,'Esperando datos');
for(const id of ['pcsStats','pcsTrades'])$(id).replaceChildren();
set('pcsSource','Conectando…');set('pcsCompleteness','PENDIENTE');set('pcsPlanState','SIN DATOS');
$('pcsRefresh').disabled=true;$('pcsError').classList.remove('show');set('pcsProgress','Solicitando histórico 4H cerrado de '+symbol+' desde 2020…');set('pcsStatus','Cargando '+symbol);$('pcsDot').className='dot';
try{
const r=await download(symbol);if(token!==state.token)return;
state.candles=r.bars;state.provider=r.provider;state.rangeComplete=r.complete;state.gaps=r.gaps;
state.ind=indicators(r.bars);calcAndShow();set('pcsProgress','');set('pcsStatus','4H actualizado');$('pcsDot').className='dot ok';
}catch(e){if(token!==state.token)return;set('pcsProgress','');set('pcsDecisionTitle','SIN DATOS · '+symbol);set('pcsDecisionDetail','No se habilita una entrada sin datos vigentes. Reintentá actualizar.');set('pcsStatus','SIN DATOS');$('pcsDot').className='dot err';set('pcsError',e.message);$('pcsError').classList.add('show');
}finally{if(token===state.token){state.busy=false;$('pcsRefresh').disabled=false;}}
}
function init(){
for(let el of document.querySelectorAll('[data-symbol]'))el.addEventListener('click',()=>{for(let b of document.querySelectorAll('[data-symbol]'))b.classList.toggle('selected',b===el);load(el.dataset.symbol);});
$('pcsRefresh').addEventListener('click',()=>load(state.symbol));
$('pcsLeverage').addEventListener('change',calcAndShow);
$('pcsCapital').addEventListener('change',calcAndShow);
for(let id of ['pcsShowBands','pcsShowSignals','pcsShowLevels'])$(id).addEventListener('change',draw);
const canvas=$('pcsChart');
canvas.addEventListener('wheel',e=>{if(!state.candles.length)return;e.preventDefault();state.view=Math.max(35,Math.min(330,state.view+(e.deltaY>0?18:-18)));state.offset=Math.min(state.offset,Math.max(0,state.candles.length-state.view));draw();},{passive:false});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);state.drag={x:e.clientX,offset:state.offset};});
canvas.addEventListener('pointerup',()=>{state.drag=null;});
canvas.addEventListener('pointercancel',()=>{state.drag=null;});
canvas.addEventListener('pointermove',e=>{
 if(!state.candles.length)return;let r=canvas.getBoundingClientRect(),w=r.width,visible=Math.min(state.view,state.candles.length),spacing=(w-156)/visible;
 if(state.drag){state.offset=Math.max(0,Math.min(state.candles.length-visible,Math.round(state.drag.offset+(e.clientX-state.drag.x)/Math.max(1,spacing))));draw();return;}
 let i=state.candles.length-state.offset-visible+Math.floor((e.clientX-r.left-56)/Math.max(1,spacing));state.hover=Math.max(0,Math.min(state.candles.length-1,i));draw();});
canvas.addEventListener('pointerleave',()=>{if(!state.drag){state.hover=-1;draw();}});
canvas.addEventListener('dblclick',()=>{state.offset=0;draw();});
window.addEventListener('resize',draw);
let lastSlot=Math.floor(Date.now()/BAR);
const refreshIfDue=()=>{const slot=Math.floor((Date.now()-30000)/BAR);if(!state.busy&&slot>lastSlot){lastSlot=slot;load(state.symbol);}};
setInterval(refreshIfDue,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshIfDue();});
load(state.symbol);
}
window.PCSEngine={indicators,backtest,stats,dedup,download,getJson};
window.PCSApp={loadSymbol(symbol){for(const el of document.querySelectorAll('[data-symbol]'))el.classList.toggle('selected',el.dataset.symbol===symbol);return load(symbol);},getSymbol(){return state.symbol;}};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();}
})();
