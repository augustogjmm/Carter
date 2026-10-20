/* Carter Trading Desk — price/action chart with visible-volume histogram.
 * Actual candles from Binance Spot; price-volume uses ESTIMATED OHLCV distribution.
 * No interpolated trade-at-price data, invented fills, or drawing of unconfirmed tickets.
 */
(function(root,factory){const mod=factory();if(typeof module==="object"&&module.exports)module.exports=mod;
 if(root)root.CarterChart=mod;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const H4=14400000,finite=Number.isFinite;
function build({bars,ind,engine,decision,scenario,quote,position,lookback=96,now=Date.now()}={}){
 if(!Array.isArray(bars)||bars.length<48||!ind||typeof engine?.profile!=="function")
  throw Error("Faltan velas o indicadores para el gráfico");
 if(![48,96,168].includes(lookback))throw Error("Escala temporal inválida");
 const last=bars.at(-1);
 if(last.t+H4>now||last.t!==Math.floor(now/H4)*H4-H4)throw Error("Último cierre 4H desactualizado");
 const visible=bars.slice(-lookback),offset=bars.length-visible.length;
 if(visible.some((b,i)=>i&&b.t-visible[i-1].t!==H4))throw Error("Huecos de velas en la ventana visible");
 const vp=engine.profile(visible,72);
 if(!vp||!Array.isArray(vp.bins)||vp.bins.length!==72||
 vp.bins.some(x=>!finite(x)||x<0)||!finite(vp.poc)||!finite(vp.val)||!finite(vp.vah))
  throw Error("No se pudo construir perfil de volumen visible");
 const values=vp.bins,peak=Math.max(...values),pocBin=values.indexOf(peak);
 const hvn=values.map((vol,i)=>({i,vol,price:vp.lo+(i+.5)*(vp.hi-vp.lo)/values.length}))
 .filter(x=>x.i>1&&x.i<values.length-2&&x.vol>=values[x.i-1]&&x.vol>=values[x.i+1]&&x.i!==pocBin)
 .sort((a,b)=>b.vol-a.vol).slice(0,3).sort((a,b)=>a.price-b.price);
 const levels=[];
 const ticket=decision?.status==="CANDIDATO"&&decision.ticket;
 const held=position?.quantity>0&&finite(position.avgPrice)&&position.avgPrice>0;
 const condition=!ticket&&!held&&scenario?.status==="ESCENARIO_CONDICIONAL"&&scenario.canBuyNow===false;
 if(held){
  levels.push({type:"entry",value:position.avgPrice,label:"COSTO MEDIO · REGISTRADO",active:true,holding:true});
  if(finite(position.stop)&&position.stop>0)levels.push({type:"stop",value:position.stop,label:"INVALIDACIÓN REGISTRADA",active:true,holding:true});
  if(finite(position.target)&&position.target>0)levels.push({type:"target",value:position.target,label:"SALIDA DE REFERENCIA",active:true,holding:true});
 }else if(ticket&&[ticket.entry,ticket.stop,ticket.target].every(x=>finite(x)&&x>0)&&ticket.stop<ticket.entry&&ticket.target>ticket.entry){
  levels.push({type:"entry",value:ticket.entry,label:"ENTRADA LÍMITE",active:true},
   {type:"stop",value:ticket.stop,label:"INVALIDACIÓN",active:true},
   {type:"target",value:ticket.target,label:"SALIDA OBJETIVO",active:true});
 }else if(condition){
  for(const [type,value,label] of [
    ["entry",scenario.trigger,"GATILLO 4H · COND."],
    ["stop",scenario.stop,"INVAL. CONDICIONAL"],
    ["target",scenario.target,"TP TENTATIVO"]]){
   if(finite(value)&&value>0)levels.push({type,value,label,active:false});
  }
 }
 const signalMarkers=visible.map((b,i)=>({i,at:b.t,price:b.h,signal:!!ind.long?.[offset+i]}))
  .filter(x=>x.signal);
 const setup=ind.parts?.[bars.length-1],k=bars.length-1;
 const currentQuote=quote&&finite(quote.bid)&&finite(quote.asOf)&&now-quote.asOf<=90000&&quote.asOf<=now+5000?quote:null;
 return{visible,offset,lookback,lastClose:last.t+H4,profile:{...vp,hvn,pocBin},
  levels,signalMarkers,ind,decision,scenario,position,quote:currentQuote,
  setup:{
   state:decision?.status||"SIN_DATOS",
   reason:decision?.reason||"No hay decisión del motor",
   technical:!!ind.long?.[k],
   trend:!!setup?.trend,turn:!!setup?.turn,weakness:!!setup?.weakness,
   squeeze:ind.squeeze?.[k]||"SIN DATOS",
   adx:ind.adx?.[k],adxPrevious:ind.adx?.[k-1],
   momentum:ind.momentum?.[k],momentumPrevious:ind.momentum?.[k-1],
   ema10:ind.ema10?.[k],ema55:ind.ema55?.[k],ema200:ind.ema200?.[k],
   last:last.c,volume:vp.quality,profilePoc:vp.poc,profileVal:vp.val,profileVah:vp.vah,
   outcome:held?"TENENCIA REGISTRADA MANUALMENTE · SIN SINCRONIZAR BROKER":ticket?"TICKET EXPERIMENTAL · RECOTIZAR ANTES DE PREPARAR":condition?
    "GATILLO CONDICIONAL · REQUIERE CIERRE Y NUEVA EVALUACIÓN":"NO HAY ORDEN HABILITADA"
  }};
}
const clr={grid:"#24394e",text:"#9bb2cb",up:"#48dbb1",down:"#ed7f93",
 ema10:"#61d8f1",ema55:"#efc57e",ema200:"#a88bfc",poc:"#ffe1a2",
 vah:"#9eaed1",val:"#9eaed1",entry:"#55f0c2",stop:"#ff7893",target:"#edc378",
 momentPos:"#58d5bb",momentNeg:"#ed7f93",adx:"#a9bdff"};
function fmt(x){
 if(!finite(x))return "—";const d=x<1?7:x<100?4:2;
 return x.toLocaleString("en-US",{maximumFractionDigits:d});
}
function render(canvas,model){
 if(!canvas||typeof canvas.getContext!=="function"||!model?.visible?.length)return false;
 const g=canvas.getContext("2d");if(!g)return false;
 const scale=Math.min(2,(typeof window!=="undefined"?window.devicePixelRatio:1)||1);
 const w=Math.max(325,canvas.clientWidth||900),h=Math.max(570,canvas.clientHeight||650);
 canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);g.setTransform(scale,0,0,scale,0,0);
 g.fillStyle="#081725";g.fillRect(0,0,w,h);
 const mobile=w<640,left=15,axis=mobile?65:84,profileW=mobile?82:148,
  profileGap=mobile?8:15,pxR=w-axis-profileW-profileGap-6,profX=pxR+profileGap,
  priceTop=35,priceBottom=h*.59,volTop=priceBottom+18,volBottom=volTop+54,
  momTop=volBottom+20,momBottom=momTop+65,adxTop=momBottom+21,adxBottom=Math.min(h-22,adxTop+58),
  plotW=Math.max(90,pxR-left),last=model.visible.length,n=model.offset;
 const candles=model.visible,mid=Math.max(...candles.map(x=>x.h)),
 min=Math.min(...candles.map(x=>x.l)),span=Math.max((mid-min),mid*.001);
 let hi=mid+span*.075,lo=min-span*.075;
 // Keep price scale legible: do not stretch 4H candles to include speculative faraway targets.
 const chosen=model.levels.filter(v=>v.value>=min-span*.35&&v.value<=mid+span*.35);
 if(chosen.length){hi=Math.max(hi,...chosen.map(x=>x.value+span*.025));lo=Math.min(lo,...chosen.map(x=>x.value-span*.025));}
 const y=v=>priceBottom-(v-lo)/(hi-lo)*(priceBottom-priceTop);
 const x=i=>left+(i+.5)*plotW/last;
 const line=(x1,y1,x2,y2)=>{g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();};
 const label=(s,x,y,color=clr.text,size=10,align="left")=>{g.textAlign=align;g.font="600 "+size+"px system-ui";g.fillStyle=color;g.fillText(s,x,y);g.textAlign="left";};
 const rect=(x1,y1,w1,h1,c)=>{g.fillStyle=c;g.fillRect(x1,y1,w1,h1);};
 const linePrice=(value,color,caption,dashed=false)=>{
  if(!finite(value)||value<lo||value>hi)return false;
  const yp=y(value);g.save();g.strokeStyle=color;g.lineWidth=1.2;g.setLineDash(dashed?[5,4]:[6,3]);
  line(left,yp,profX+profileW,yp);g.restore();
  const text=caption+" "+fmt(value),labelW=Math.min(w-left-10,Math.max(58,text.length*5.9+13));
  const targetX=w-labelW-4;
  rect(targetX,Math.min(priceBottom-16,Math.max(priceTop,yp-10)),labelW,18,"#14283a");
  label(text,targetX+5,Math.min(priceBottom-3,Math.max(priceTop+13,yp+3)),color,9);
  return true;
 };
 g.strokeStyle=clr.grid;g.lineWidth=.8;for(let i=0;i<5;i++){
  const v=lo+(hi-lo)*i/4,yp=y(v);line(left,yp,pxR,yp);label(fmt(v),pxR+4,yp-3,clr.text,9);
 }
 // Estimated visible-range profile. We only allocate OHLCV uniformly over candle ranges;
 // never label it as executed-trade profile or Binance L2.
 const vp=model.profile,range=vp.hi-vp.lo,step=range/vp.bins.length,
 maxVol=Math.max(...vp.bins)||1;
 rect(profX,priceTop,profileW,priceBottom-priceTop,"#102638");
 g.save();g.beginPath();g.rect(profX,priceTop,profileW,priceBottom-priceTop);g.clip();
 vp.bins.forEach((v,i)=>{
  const p=vp.lo+(i+.5)*step;
  if(p+step/2<lo||p-step/2>hi)return;
  const cy=y(p),half=Math.max(.9,(priceBottom-priceTop)*step/(hi-lo)*.47),
    inVA=p>=vp.val&&p<=vp.vah,atPOC=i===vp.pocBin;
  const width=Math.max(.5,(v/maxVol)*(profileW-11));
  rect(profX,cy-half,width,Math.max(1,half*2),atPOC?"#efc47f":inVA?"#4a8e8a":"#375467");
 });
 g.restore();
 // Value area transparent band across candles, POC/VAH/VAL; not conflated with trade exact volume.
 const areaTop=Math.max(priceTop,y(vp.vah)),areaBottom=Math.min(priceBottom,y(vp.val));
 if(areaBottom>areaTop)rect(left,areaTop,plotW,areaBottom-areaTop,"rgba(67,187,160,.048)");
 for(const [v,color,name] of [[vp.poc,clr.poc,"POC"],[vp.vah,clr.vah,"VAH"],[vp.val,clr.val,"VAL"]]){
  if(v<lo||v>hi)continue;
  g.save();g.setLineDash(name==="POC"?[5,3]:[2,5]);g.strokeStyle=color;g.lineWidth=name==="POC"?1.4:.9;
  line(left,y(v),profX+profileW,y(v));g.restore();
  label(name,profX+5,Math.max(priceTop+10,Math.min(priceBottom-3,y(v)-4)),color,9);
 }
 const candleW=Math.max(1,Math.min(9,plotW/last*.62));
 for(let i=0;i<last;i++){
  const b=candles[i],color=b.c>=b.o?clr.up:clr.down;
  g.lineWidth=1;g.strokeStyle=color;line(x(i),y(b.h),x(i),y(b.l));
  rect(x(i)-candleW/2,Math.min(y(b.o),y(b.c)),candleW,Math.max(1,Math.abs(y(b.c)-y(b.o))),color);
 }
 // Use full indicator series, never reinitialize EMA at the zoomed-in window.
 // Clip long EMAs to their OWN price pane so they do not paint over ADX/volume.
 g.save();g.beginPath();g.rect(left,priceTop,plotW,priceBottom-priceTop);g.clip();
 for(const [data,color,weight] of [[model.ind.ema10,clr.ema10,1.6],[model.ind.ema55,clr.ema55,1.6],[model.ind.ema200,clr.ema200,1.3]]){
  if(!data)continue;g.strokeStyle=color;g.lineWidth=weight;g.beginPath();let started=false;
  for(let i=0;i<last;i++){const v=data[n+i];
   if(!finite(v)||v<lo-span||v>hi+span){started=false;continue;}
   if(!started){g.moveTo(x(i),y(v));started=true;}else g.lineTo(x(i),y(v));
  }g.stroke();
 }
 g.restore();
 // Confirmed historical TL-BASE 4H triggers (not a claim of actual past fills).
 for(const item of model.signalMarkers.slice(-12)){const xx=x(item.i),yy=Math.max(priceTop+15,y(item.price)-11);
  rect(xx-5,yy-9,10,10,"#28584f");label("S",xx-3,yy-1,"#91f5d7",8);
 }
 // R:R shaded area, provided level geometry is really actionable/tentative and visible.
 const entry=model.levels.find(v=>v.type==="entry"),stop=model.levels.find(v=>v.type==="stop"),target=model.levels.find(v=>v.type==="target");
 if(entry&&stop&&entry.value>stop.value&&entry.value<=hi&&stop.value>=lo)
  rect(pxR-12,y(entry.value),12,y(stop.value)-y(entry.value),entry.active?"rgba(255,89,129,.25)":"rgba(255,89,129,.12)");
 if(entry&&target&&target.value>entry.value&&target.value<=hi&&entry.value>=lo)
  rect(pxR-12,y(target.value),12,y(entry.value)-y(target.value),entry.active?"rgba(60,218,170,.27)":"rgba(60,218,170,.11)");
 for(const lv of model.levels){
  const title=lv.type==="entry"?(lv.holding?"COSTO":lv.active?"E1":"GATILLO*"):lv.type==="stop"?(lv.holding?"INVAL.":"SL*"):(lv.holding?"SALIDA":"TP*");
  linePrice(lv.value,lv.type==="entry"?clr.entry:lv.type==="stop"?clr.stop:clr.target,title,!lv.active);
 }
 if(model.quote)linePrice(model.quote.bid,"#8dcbfd","BID",true);
 // Momentum and ADX are separate and share the exact 4H candle alignment.
 const maxVolume=Math.max(...candles.map(z=>z.v),1),volScale=volBottom-volTop;
 rect(left,volTop,plotW,volScale,"#0e2232");
 for(let i=0;i<last;i++){const bar=candles[i],height=Math.max(1,bar.v/maxVolume*volScale);
  rect(x(i)-candleW/2,volBottom-height,candleW,height,bar.c>=bar.o?"#317a71":"#8e4d62");}
 const mm=model.ind.momentum||[],absMom=Math.max(0.000001,...candles.map((_,i)=>Math.abs(mm[n+i]||0)));
 const my=v=>momTop+(momBottom-momTop)/2-v/absMom*(momBottom-momTop)*.43;
 g.strokeStyle=clr.grid;line(left,my(0),pxR,my(0));
 for(let i=0;i<last;i++){const v=mm[n+i];if(!finite(v))continue;
  rect(x(i)-candleW/2,Math.min(my(v),my(0)),candleW,Math.max(1,Math.abs(my(v)-my(0))),v>=0?clr.momentPos:clr.momentNeg);
 }
 const adx=model.ind.adx||[],ay=v=>adxBottom-(Math.min(100,Math.max(0,v))/100)*(adxBottom-adxTop);
 g.strokeStyle=clr.grid;line(left,ay(23),pxR,ay(23));
 g.save();g.beginPath();g.rect(left,adxTop,plotW,adxBottom-adxTop);g.clip();g.strokeStyle=clr.adx;g.lineWidth=1.6;g.beginPath();let started=false;
 for(let i=0;i<last;i++){const v=adx[n+i];if(!finite(v)){started=false;continue;}
  if(!started){g.moveTo(x(i),ay(v));started=true;}else g.lineTo(x(i),ay(v));}g.stroke();g.restore();
 label("VOL / VELAS",left+6,volTop+12,clr.text,9);
 label("SQUEEZE MOMENTUM",left+6,momTop+12,clr.text,9);
 label("ADX 14  ·  UMBRAL 23",left+6,adxTop+12,clr.text,9);
 label("VP / PRECIO",profX+5,priceTop-11,clr.text,9);
 label("4H SPOT · DATOS CERRADOS",left+5,16,clr.text,10);
 label(model.levels.some(v=>!v.active)?"* NIVELES CONDICIONALES":"S = DISPARADOR HISTÓRICO, NO FILL",
       left+8,h-5,clr.text,9);
 const starts=[0,Math.floor((last-1)/2),last-1];
 for(const i of starts){const iso=new Date(candles[i].t).toISOString().slice(5,16).replace("T"," ");
  label(iso,x(i),h-15,clr.text,9,i===last-1?"right":"left");}
 return true;
}
return{version:"CTD-CHART-2.0",build,render,fmt};
});