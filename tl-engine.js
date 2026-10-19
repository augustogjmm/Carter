/* Trading Latino — reproducible project hypothesis, NOT official Jaime execution rules.
   Single causal engine: browser + Node. OHLCV prices use UTC candle OPEN timestamp. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.TLEngine=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const PERIOD={ '1h':3600000,'4h':14400000,'1d':86400000 },FEE=.001,SLIP=.0005;
const finite=Number.isFinite;
const nan=n=>Array(n).fill(NaN);
function sma(x,p){let a=nan(x.length),s=0;for(let i=0;i<x.length;i++){s+=x[i];if(i>=p)s-=x[i-p];if(i>=p-1)a[i]=s/p;}return a;}
function ema(x,p){const out=nan(x.length),alpha=2/(p+1);let v;for(let i=0;i<x.length;i++){v=i===0?x[i]:alpha*x[i]+(1-alpha)*v;if(i>=p-1)out[i]=v;}return out;}
function linReg(x,p){let out=nan(x.length),sx=p*(p-1)/2,sxx=p*(p-1)*(2*p-1)/6,d=p*sxx-sx*sx;
 for(let i=p-1;i<x.length;i++){let sy=0,sxy=0;for(let j=0;j<p;j++){sy+=x[i-p+1+j];sxy+=j*x[i-p+1+j];}
 const slope=(p*sxy-sx*sy)/d;out[i]=sy/p+slope*((p-1)-sx/p);}return out;}
function validate(raw,period='4h'){const ms=PERIOD[period];if(!ms)throw Error('Intervalo inválido');
 if(!Array.isArray(raw))throw Error('Datos no son velas');let list=raw.map(x=>({t:+x.t,o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v}));
 list.sort((a,b)=>a.t-b.t);
 for(let i=0;i<list.length;i++){const b=list[i];
  if(![b.t,b.o,b.h,b.l,b.c,b.v].every(finite)||b.o<=0||b.c<=0||b.h<b.l||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.v<0||b.t%ms!==0)throw Error('OHLCV inválido');
  if(b.t+ms>Date.now())throw Error('Vela abierta/incompleta');
  if(i&&b.t<=list[i-1].t)throw Error('Timestamp duplicado');
  if(i&&(b.t-list[i-1].t)%ms!==0)throw Error('Cadencia irregular');
 }
 return list;
}
function indicators(b){const n=b.length,cl=b.map(x=>x.c),sma20=sma(cl,20),ema10=ema(cl,10),ema55=ema(cl,55),ema200=ema(cl,200);
 const tr=Array(n).fill(0),pd=Array(n).fill(0),md=Array(n).fill(0);
 for(let i=0;i<n;i++){tr[i]=i?Math.max(b[i].h-b[i].l,Math.abs(b[i].h-b[i-1].c),Math.abs(b[i].l-b[i-1].c)):b[i].h-b[i].l;
 if(i){const up=b[i].h-b[i-1].h,down=b[i-1].l-b[i].l;pd[i]=up>down&&up>0?up:0;md[i]=down>up&&down>0?down:0;}}
 const tr20=sma(tr,20),atr=nan(n),plus=nan(n),minus=nan(n),dx=nan(n),adx=nan(n);
 let st=0,sp=0,sm=0;
 for(let i=1;i<n;i++){if(i<=14){st+=tr[i];sp+=pd[i];sm+=md[i];}
 else{st=st-st/14+tr[i];sp=sp-sp/14+pd[i];sm=sm-sm/14+md[i];}
 if(i>=14){plus[i]=st?100*sp/st:0;minus[i]=st?100*sm/st:0;dx[i]=plus[i]+minus[i]?100*Math.abs(plus[i]-minus[i])/(plus[i]+minus[i]):0;}}
 if(n>27){let total=0;for(let i=14;i<28;i++)total+=dx[i];adx[27]=total/14;for(let i=28;i<n;i++)adx[i]=(adx[i-1]*13+dx[i])/14;}
 // ATR14: Wilder average TR bars 1..14; stop range seed preserved.
 let sa=0;for(let i=1;i<n;i++){if(i<=14)sa+=tr[i];else sa=(sa/14*13+tr[i]);if(i>=14)atr[i]=sa/14;}
 const momSrc=nan(n),bbU=nan(n),bbL=nan(n),kcU=nan(n),kcL=nan(n),squeeze=Array(n).fill('WARMUP');
 for(let i=19;i<n;i++){
  let hi=-Infinity,lo=Infinity,variance=0;for(let j=i-19;j<=i;j++){hi=Math.max(hi,b[j].h);lo=Math.min(lo,b[j].l);variance+=(cl[j]-sma20[i])**2;}
  momSrc[i]=cl[i]-(((hi+lo)/2+sma20[i])/2);
  const sd=Math.sqrt(variance/20);bbU[i]=sma20[i]+2*sd;bbL[i]=sma20[i]-2*sd;
  kcU[i]=sma20[i]+1.5*tr20[i];kcL[i]=sma20[i]-1.5*tr20[i];
  squeeze[i]=bbL[i]>kcL[i]&&bbU[i]<kcU[i]?'ON':bbL[i]<kcL[i]&&bbU[i]>kcU[i]?'OFF':'NEUTRAL';
 }
 const momentum=linReg(momSrc,20);
 let run=0;const valid=Array(n).fill(false),long=Array(n).fill(false),bear=Array(n).fill(false),parts=Array(n);
 for(let i=0;i<n;i++){
  run=(i&&b[i].t-b[i-1].t!==b[1]?.t-b[0]?.t)?1:run+1;
  valid[i]=i>=205&&run>=205&&[ema10[i],ema55[i],momentum[i],momentum[i-1],momentum[i-2],adx[i],adx[i-1],atr[i]].every(finite);
  const trend=valid[i]&&ema10[i]>ema55[i];
  const turn=valid[i]&&momentum[i]>momentum[i-1]&&momentum[i-1]<=momentum[i-2]&&momentum[i-1]<0;
  const weakness=valid[i]&&adx[i]<adx[i-1]&&adx[i-1]>=23;
  long[i]=!!(trend&&turn&&weakness);
  const down=valid[i]&&ema10[i]<ema55[i]&&momentum[i]<momentum[i-1]&&momentum[i-1]>=momentum[i-2]&&momentum[i-1]>0;
  bear[i]=!!(down&&weakness);
  parts[i]={valid:valid[i],trend:!!trend,turn:!!turn,weakness:!!weakness,early:!!(valid[i]&&turn&&weakness),diBull:valid[i]&&plus[i]>minus[i]};
 }
 return{ema10,ema55,ema200,atr,plus,minus,adx,bbU,bbL,kcU,kcL,squeeze,momentum,valid,long,bear,parts};
}
function latest(b,ind,period='4h',now=Date.now()){const last=b.length-1,ms=PERIOD[period];if(last<0||!ind.valid[last])return{status:'SIN DATOS',reason:'Indicadores incompletos o gaps cercanos'};
 const expected=Math.floor((now-1)/ms)*ms-ms; // last FULLY closed candle, including exact boundary
 if(b[last].t!==expected)return{status:'SIN DATOS',reason:'Última vela cerrada no coincide con el reloj UTC',expected,actual:b[last].t};
 const p=ind.parts[last];
 return{status:ind.long[last]?'LONG CONFIRMADO':ind.bear[last]?'DETERIORO':p.early?'VIGILAR':'SIN ENTRADA',
 signal:ind.long[last],price:b[last].c,at:b[last].t,adx:ind.adx[last],ema10:ind.ema10[last],ema55:ind.ema55[last],mom:ind.momentum[last],
 squeeze:ind.squeeze[last],reason:'EMA10>EMA55 '+(p.trend?'SÍ':'NO')+' · Giro MOM '+(p.turn?'SÍ':'NO')+' · ADX decreciente desde ≥23 '+(p.weakness?'SÍ':'NO')};
}
function backtest(b,ind,{capital=1000,fee=FEE,slip=SLIP,risk=.01}={}){
 let cash=capital,pos=null,orders=[],curve=[],pending=false,pendingExit=false,signalEntries=0;
 for(let i=0;i<b.length;i++){const x=b[i],atr=ind.atr[i-1];
  if(pos&&pendingExit){const exit=x.o*(1-slip),pnl=pos.qty*(exit-pos.entry)-pos.entryFee-pos.qty*exit*fee;cash+=pos.qty*exit*(1-fee);
   orders.push({entryAt:pos.t,exitAt:x.t,entry:pos.entry,exit,pnl,why:'SEÑAL CONTRARIA'});pos=null;}
  pendingExit=false;
  if(!pos&&pending&&finite(atr)&&atr>0){
   const entry=x.o*(1+slip),dist=1.5*atr,qty=Math.min(cash*risk/(dist+entry*fee+(entry-1.5*atr)*fee),cash/(entry*(1+fee)));
   if(qty>0&&entry>dist){const entryFee=entry*qty*fee;cash-=entry*qty+entryFee;pos={entry,qty,sl:entry-dist,tp:entry+2*dist,t:x.t,entryFee};signalEntries++;}
  }
  pending=false;
  if(pos){let exit=NaN,why='';
   if(x.o<=pos.sl||x.l<=pos.sl){exit=Math.min(x.o,pos.sl)*(1-slip);why='STOP';}
   else if(x.o>=pos.tp||x.h>=pos.tp){exit=pos.tp*(1-slip);why='TP 2R';}
   if(finite(exit)){const pnl=pos.qty*(exit-pos.entry)-pos.entryFee-pos.qty*exit*fee;cash+=pos.qty*exit*(1-fee);
    orders.push({entryAt:pos.t,exitAt:x.t,entry:pos.entry,exit,pnl,why});pos=null;}
   else if(ind.bear[i])pendingExit=true;
  }
  curve.push({t:x.t,equity:cash+(pos?pos.qty*x.c:0)});
  if(!pos&&ind.long[i])pending=true;
 }
 return{orders,curve,pos,cash,signalEntries,capital,fee,slip};
}
function stats(bt){const orders=bt.orders,w=orders.filter(x=>x.pnl>0).reduce((a,x)=>a+x.pnl,0),l=-orders.filter(x=>x.pnl<0).reduce((a,x)=>a+x.pnl,0);
 const eq=bt.curve,final=eq.length?eq.at(-1).equity:bt.capital;let peak=bt.capital,dd=0;
 for(let x of eq){peak=Math.max(peak,x.equity);if(peak>0)dd=Math.max(dd,(peak-x.equity)/peak);}
 return{trades:orders.length,winRate:orders.length?orders.filter(x=>x.pnl>0).length/orders.length:NaN,pf:l>0?w/l:NaN,
 returnPct:final/bt.capital-1,drawdown:dd,equity:final,open:!!bt.pos};
}
function profile(b,bins=50){if(!b.length)return null;const lo=Math.min(...b.map(x=>x.l)),hi=Math.max(...b.map(x=>x.h));if(hi<=lo)return null;
 const step=(hi-lo)/bins,vol=Array(bins).fill(0);
 for(const x of b){let ia=Math.max(0,Math.min(bins-1,Math.floor((x.l-lo)/step))),iz=Math.max(ia,Math.min(bins-1,Math.floor((x.h-lo)/step)));
 for(let j=ia;j<=iz;j++)vol[j]+=x.v/(iz-ia+1);}
 let p=vol.indexOf(Math.max(...vol)),left=p,right=p,total=vol.reduce((a,x)=>a+x,0),covered=vol[p];
 while(covered<total*.7&&(left>0||right<bins-1)){if(left===0){right++;covered+=vol[right];}else if(right===bins-1){left--;covered+=vol[left];}
 else if(vol[right+1]>=vol[left-1]){right++;covered+=vol[right];}else{left--;covered+=vol[left];}}
 return{quality:'PERFIL ESTIMADO OHLCV',poc:lo+(p+.5)*step,val:lo+left*step,vah:lo+(right+1)*step,lo,hi,bins:vol};}
return{version:'TL-BASE-1.0',PERIOD,ema,sma,linReg,validate,indicators,latest,backtest,stats,profile};
});