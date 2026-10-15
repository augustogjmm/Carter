/* Carter 4H: historical execution audit. Version 1, frozen rules, no optimizer.
 * ALL features at candle i are computed from history <=i. Fills at i+1 open.
 * 70/30 chronological split. Bars in training cannot use future candles in testing.
 * Commission 0.1% per side. Stop prioritized if TP and SL hit same candle.
 */
(function(){
'use strict';
const CE=window.CarterEngine, F=Number.isFinite, COMM=.001, HORIZON=24, MIN_RR=1.5;
function calcLevels(c,s,i,entry,multistage=false){
 const atr=s.at[i];
 if(!F(atr)||atr<=0)return null;
 const history=c.slice(Math.max(0,i-180),i+1);
 const vp=CE.volumeProfile(history,60);
 const piv=CE.pivotLevels(c.slice(0,i+1),160);
 const candidates=[
  ...piv.lows,{price:s.ema55[i],source:'EMA55'},{price:s.bbL[i],source:'BB inferior'},
  {price:vp?.val,source:'VAL'},{price:vp?.poc,source:'POC'},
  ...(vp?.hvns||[]).map(x=>({price:x.price,source:'Nodo volumen'})),
  {price:Math.min(...history.slice(-20).map(x=>x.l)),source:'mínimo 20'}
 ].filter(x=>F(x.price)&&x.price>0&&x.price<entry-.12*atr&&x.price>entry-8*atr).sort((a,b)=>b.price-a.price);
 const levels=[];
 for(const v of candidates){if(levels.every(x=>x.price-v.price>.55*atr)){levels.push(v);if(levels.length>=2)break;}}
 const entries=[{price:entry,source:'Carter · siguiente apertura'}];
 if(multistage)for(const x of levels)entries.push(x);
 const lo=entries.at(-1).price;
 const lows=pivsLowBelow(pivs(c.slice(0,i+1)),lo,atr);
 const stop=multistage?Math.min(lo,lows??lo)-.45*atr:entry-2*atr;
 if(!F(stop)||stop<=0||stop>=entry)return null;
 const resistance=[
  ...(piv.highs||[]),{price:s.bbU[i],source:'BB superior'},
  {price:vp?.vah,source:'VAH'},{price:vp?.poc,source:'POC'},
  ...(vp?.hvns||[]).map(x=>({price:x.price,source:'HVN'})),
  {price:Math.max(...history.slice(-20).map(x=>x.h)),source:'máximo 20'},
  {price:Math.max(...history.slice(-60).map(x=>x.h)),source:'máximo 60'}
 ].filter(x=>F(x.price)&&x.price>entry+.15*atr).sort((a,b)=>a.price-b.price);
 const first=resistance[0]??null;
 if(!first)return{valid:false,reason:'Sin resistencia',entries,stop};
 const rr=(first.price-entry)/(entry-stop);
 if(rr<MIN_RR)return{valid:false,reason:'R/R < 1.5 en primera resistencia',entries,stop,first,rr};
 return{valid:true,entries,stop,target:first.price,first,rr,atr};
}
function pivs(c){return CE.pivotLevels(c,160);}
function pivsLowBelow(p,level,atr){const lows=(p.lows||[]).filter(x=>x.price<level&&x.price>level-1.6*atr).sort((a,b)=>b.price-a.price);return lows[0]?.price??null;}
function fixedTrade(c,i,bound,stop,tp){
 const entry=c[i+1].o;
 let exitIndex=Math.min(i+HORIZON,bound-1);
 let exit=c[exitIndex].c,why='time';
 for(let j=i+1;j<=exitIndex;j++){
  const candle=c[j],down=candle.l<=stop,up=candle.h>=tp;
  if(down){exitIndex=j;exit=stop;why='stop';break;} // adverse assumption even when TP also hit
  if(up){exitIndex=j;exit=tp;why='tp';break;}
 }
 const unitRisk=entry-stop,netR=(exit-entry-COMM*(entry+exit))/unitRisk;
 return {exitIndex,exit,why,netR,mfe:Math.max(...c.slice(i+1,exitIndex+1).map(x=>x.h-entry))/unitRisk,mae:Math.min(...c.slice(i+1,exitIndex+1).map(x=>x.l-entry))/unitRisk,added:0};
}
function stagedTrade(c,s,i,bound,lev){
 const {entries,stop,target}=lev;
 let exitIndex=Math.min(i+HORIZON,bound-1),why='time',exit=c[exitIndex].c;
 const proportions=[.40,.35,.25].slice(0,entries.length),sum=proportions.reduce((a,b)=>a+b,0),weights=proportions.map(x=>x/sum);
 let q=0;
 let riskUnit=0,investedPlan=0;
 for(let j=0;j<entries.length;j++){riskUnit+=weights[j]*(entries[j].price-stop+entries[j].price*2*COMM);investedPlan+=weights[j]*entries[j].price;}
 if(!F(riskUnit)||riskUnit<=0)return null;
 q=Math.min(10/riskUnit,1000/investedPlan);
 const fills=[{index:0,qty:q*weights[0],price:c[i+1].o}];
 let next=1;
 for(let j=i+1;j<=exitIndex;j++){
  const b=c[j],hStop=b.l<=stop,hTP=b.h>=target;
  if(hStop){why='stop';exit=stop;exitIndex=j;break;}
  if(hTP){why='tp';exit=target;exitIndex=j;break;}
  if(next<entries.length&&j+1<=exitIndex){
   const z=entries[next],recover=b.l<=z.price && b.c>z.price;
   if(recover&&s.trend[j]&&s.momentumOK[j]&&(!s.__auditAdx||s.adxOK[j])){
    fills.push({index:next,qty:q*weights[next],price:c[j+1].o});next++;
   }
  }
 }
 const pnl=fills.reduce((total,f)=>total+f.qty*(exit-f.price)-COMM*f.qty*(f.price+exit),0);
 return{exitIndex,exit,why,netR:pnl/10,added:fills.length-1,invested:fills.reduce((v,f)=>v+f.qty*f.price,0)};
}
function stats(trades,skipped,signals){
 const n=trades.length,w=trades.filter(x=>x.netR>0).length;
 let pos=0,neg=0,total=0,peak=0,dd=0,wonTP=0,lostSL=0,expired=0,filled2=0,filled3=0;
 for(const t of trades){
  total+=t.netR;peak=Math.max(peak,total);dd=Math.max(dd,peak-total);
  if(t.netR>0)pos+=t.netR;else neg+=-t.netR;
  if(t.why==='tp')wonTP++;if(t.why==='stop')lostSL++;if(t.why==='time')expired++;
  if(t.added>=1)filled2++;if(t.added>=2)filled3++;
 }
 const mean=n?total/n:null;
 const wr=n?w/n:null;
 // Wilson 95% confidence interval for the proportion of positive NET returns
 let low=null,high=null;
 if(n){const z=1.96,z2=z*z,den=1+z2/n,center=(wr+z2/(2*n))/den,half=z*Math.sqrt((wr*(1-wr)+z2/(4*n))/n)/den;low=Math.max(0,center-half);high=Math.min(1,center+half);}
 return{n,signals,skipped,wins:w,winrate:wr,ciLow:low,ciHigh:high,meanR:mean,totalR:total,pf:neg>0?pos/neg:null,maxDDR:dd,wonTP,lostSL,expired,filled2,filled3,adequate:n>=30};
}
function evaluate(c,s,split,mode,start,end,opts={}){
 const trades=[],maxIndex=end-HORIZON-1;
 let skips=0,signals=0,lastExit=start-1;
 const filter=mode!=='base';
 for(let i=Math.max(230,start);i<=maxIndex;i++){
  const base=s.fire[i]&&F(s.mom[i])&&s.mom[i]>0&&s.momentumOK[i];
  if(!base)continue;
  if(filter&&(!s.trend[i]||(opts.useADX&&!s.adxOK[i])))continue;
  if(i<=lastExit)continue; // only one position at a time per strategy
  signals++;
  if(!F(s.at[i])||s.at[i]<=0){skips++;continue;}
  const entry=c[i+1].o;
  let trade=null;
  if(mode==='base'||mode==='filtered'){
    const stop=entry-2*s.at[i],tp=entry+3*s.at[i];
    if(stop>0)trade=fixedTrade(c,i,end,stop,tp);
  }else{
    const level=calcLevels(c,s,i,entry,true);
    if(!level?.valid){skips++;continue;}
    // The historical stopped trade is explicitly anchored to a historical 4H trigger.
    trade=stagedTrade(c,s,i,end,level);
  }
  if(!trade){skips++;continue;}
  trades.push({...trade,signalAt:i,price:entry});
  lastExit=trade.exitIndex;
 }
 return stats(trades,skips,signals);
}
function run(c,s,useADX=true){
 if(!Array.isArray(c)||c.length<450)return{valid:false,reason:'Se necesitan al menos 450 velas 4H'};
 const n=c.length,cut=Math.floor(n*.7),reserved=HORIZON+1;
 const scan={...s,__auditAdx:useADX};
 const models=[
  {key:'base',name:'Carter 4H · base',detail:'Squeeze liberado + momentum positivo creciente; apertura siguiente; SL 2 ATR; TP 3 ATR (R/R bruto 1.5).'},
  {key:'filtered',name:'Carter 4H · EMA/ADX',detail:'Carter base + EMA10>55>200, precio sobre EMA10; ADX14 y +DI si está activado. Misma salida 2/3 ATR.'},
  {key:'staged',name:'Carter 4H · perfil y escalonado',detail:'Carter filtrado; soportes calculados ANTES de la señal, E1 siguiente apertura, E2/E3 solo con reacción + confirmación 4H. TP primera resistencia si R/R ≥1.5; SL debajo del soporte inferior.'}
 ];
 return{
  valid:true,markets:c.length,split:cut,from:c[0].t,to:c.at(-1).t,
  periodEndTrain:c[cut-reserved].t,periodStartTest:c[cut].t,
  feesPct:COMM*200, // total 0.2% for 0.1% each side
  horizonBars:HORIZON,
  models:models.map(m=>({key:m.key,name:m.name,detail:m.detail,
   train:evaluate(c,scan,cut,m.key,0,cut,{useADX}),
   test:evaluate(c,scan,cut,m.key,cut,n,{useADX})})),
  notes:'Apertura siguiente 4H. Sin información futura para el cálculo de señal, soportes o resistencias. STOP antes que TP si ambos ocurren en la misma vela (supuesto conservador). 70% train, 30% test cronológico. Costos 0.1% de entrada + 0.1% salida; sin slippage/gaps ni financiación. Sólo Long Spot. Sin optimización de parámetros. E2/E3 limitadas a recuperaciones confirmadas; para simularlas, la compra ocurre en la APERTURA siguiente, no en el toque del soporte.'
 };
}
window.CarterAudit={run,evaluate,calcLevels,stats};
})();