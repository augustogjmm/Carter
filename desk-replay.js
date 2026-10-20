/* Independent causal historical replay of the Carter Desk's market-only hypothesis.
   IMPORTANT: historical order book, latency and live quote filters cannot be reconstructed
   from 4H OHLCV; results cannot certify executable tickets or an approved strategy. */
'use strict';
const E=require('./tl-engine.js'),G=require('./desk-engine.js'),H4=14400000,DAY=86400000;
const safe=x=>Number.isFinite(x),withDefault=(v,d)=>v===undefined?d:v;
function planAt(b4,d1,i,ind4,ind1){
 const closeAt=b4[i].t+H4;
 if(!ind4.valid[i]||!ind4.long[i]||i<359)return null;
 let j=-1;for(let n=0;n<d1.length&&d1[n].t+DAY<=closeAt;n++)j=n;
 if(j<205||!ind1.valid[j]||d1[j].c<=ind1.ema55[j]||ind1.ema10[j]<=ind1.ema55[j])return null;
 if(d1[j].t+DAY>closeAt)throw Error('LOOKAHEAD_DAILY');
 const slice=b4.slice(i-359,i+1);
 for(let n=1;n<slice.length;n++)if(slice[n].t-slice[n-1].t!==H4)return null;
 const profile=E.profile(slice,64),atr=ind4.atr[i];
 if(!profile||!safe(atr)||atr<=0)return null;
 const stop=Math.min(...b4.slice(i-8,i+1).map(b=>b.l),ind4.ema55[i])-0.15*atr;
 if(!(stop>0))return null;
 return{signalAt:closeAt,technicalSignalAt:b4[i].t,dailyKnownAt:d1[j].t+DAY,
  stop,atr,maxChase:b4[i].c+.45*atr,profile,snapshotPrice:b4[i].c,signature:'TL-BASE-MTF-VP-CARTER'};
}
function replay(b4,d1,{from,to,capital=1000,fee=.001,slip=.0005}={}){
 if(!Array.isArray(b4)||!Array.isArray(d1)||b4.length<420||d1.length<220)throw Error('Datos históricos insuficientes');
 if(!safe(from)||!safe(to)||from>=to||!safe(capital)||capital<=0||fee<0||slip<0)throw Error('Parámetros de auditoría inválidos');
 const i4=E.indicators(b4,'4h'),i1=E.indicators(d1,'1d');
 let cash=capital,pos=null,pending=null,curve=[],trades=[],signals=0,eligible=0,denied=0;
 for(let i=0;i<b4.length;i++){
  const b=b4[i],inWindow=b.t>=from&&b.t<to;
  if(!inWindow){pending=null;continue;}
  if(pending){
   const plan=pending;pending=null;
   const entry=b.o*(1+slip),stop=plan.stop;
   if(entry<stop||entry>plan.maxChase||entry<plan.profile.val-plan.atr||
     entry>plan.profile.vah+1.5*plan.atr||(entry-stop)/entry>.08){denied++;}
   else{
    const target0=G.resistance(b4.slice(0,i),entry,plan.profile);
    const target=target0;
    const riskPerUnit=entry-stop+entry*fee+stop*(fee+slip);
    const rewardPerUnit=target?target-entry-entry*fee-target*(fee+slip):NaN;
    if(!(rewardPerUnit/riskPerUnit>=1.5)){denied++;}
    else{
     const qty=Math.min(cash*.01/riskPerUnit,cash*.2/(entry*(1+fee)));
     if(qty*entry<5){denied++;}
     else{
      cash-=qty*entry*(1+fee);
      pos={entry,stop,target,qty,entryFee:qty*entry*fee,entryAt:b.t,signalAt:plan.signalAt,dailyKnownAt:plan.dailyKnownAt};
      eligible++;
     }
    }
   }
  }
  if(pos){
   let exit=null,why='';
   if(b.o<=pos.stop||b.l<=pos.stop){exit=Math.min(b.o,pos.stop)*(1-slip);why='STOP';}
   else if(b.o>=pos.target||b.h>=pos.target){exit=pos.target*(1-slip);why='TARGET';}
   if(exit!==null){
    const net=pos.qty*exit*(1-fee)-pos.qty*pos.entry-pos.entryFee;
    cash+=pos.qty*exit*(1-fee);
    trades.push({entryAt:pos.entryAt,exitAt:b.t,signalAt:pos.signalAt,dailyKnownAt:pos.dailyKnownAt,
      entry:pos.entry,exit,qty:pos.qty,net,why});
    pos=null;
   }
  }
  if(!pos&&i<b4.length-1&&b4[i+1].t<to&&i4.long[i]){
   signals++;const candidate=planAt(b4,d1,i,i4,i1);
   if(candidate)pending=candidate;else denied++;
  }
  curve.push(cash+(pos?pos.qty*b.c:0));
 }
 const eq=curve.at(-1)??capital,positive=trades.filter(t=>t.net>0),negative=trades.filter(t=>t.net<0);
 const grossWin=positive.reduce((s,t)=>s+t.net,0),grossLoss=-negative.reduce((s,t)=>s+t.net,0);
 let peak=capital,dd=0;
 for(const value of curve){peak=Math.max(peak,value);dd=Math.max(dd,(peak-value)/peak);}
 const total=trades.reduce((s,t)=>s+t.net,0);
 return{
  model:'DESK_MARKET_ONLY_REPLAY',from:new Date(from).toISOString(),to:new Date(to).toISOString(),
  fee,slip,trades:trades.length,signals,eligible,denied,
  winRate:trades.length?positive.length/trades.length:null,pf:grossLoss>0?grossWin/grossLoss:null,
  returnPct:eq/capital-1,maxDrawdown:dd,totalNetClosed:total,
  openPosition:!!pos,unrealizedPosition:pos?{entryAt:pos.entryAt,entry:pos.entry,stop:pos.stop,target:pos.target}:null,
  causal:trades.every(t=>t.signalAt<=t.entryAt&&t.dailyKnownAt<=t.signalAt),
  limitations:['No historical Binance order book or quote timestamp','OHLCV-derived volume profile is an approximation',
   'Market-order next 4H open proxy differs from live LIMIT at bid/ask','No historic exchange-specific filters or partial fills'],
  samples:trades.slice(-10)
 };
}
function judge(test,stress){
 const reasons=[];
 if(test.trades<30)reasons.push('Menos de 30 operaciones cerradas fuera de muestra');
 if(!(test.pf>1.20))reasons.push('Profit factor neto no supera 1,20');
 if(!(test.returnPct>0))reasons.push('Rentabilidad neta no positiva');
 if(!(test.maxDrawdown<.25))reasons.push('Drawdown no inferior a 25%');
 if(!(stress.returnPct>0))reasons.push('No supera costos duplicados');
 if(!test.causal||!stress.causal)reasons.push('Falla la causalidad de señales');
 reasons.push('Sin históricos del libro de órdenes: solo auditoría parcial de mercado');
 return{verdict:'NO_APROBADA_PARA_EJECUCION_REAL',requirementsPassed:reasons.length===1&&reasons[0].startsWith('Sin históricos'),reasons};
}
module.exports={planAt,replay,judge};
