/* Carter Trading Desk — eligibility engine; project hypothesis, NOT an official Jaime rule.
   Pure module: no browser state, no exchange orders, no promises of profitability. */
(function(root,factory){
 const mod=factory(); if(typeof module==="object"&&module.exports)module.exports=mod;
 if(root)root.CarterDeskEngine=mod;
})(typeof window!=="undefined"?window:globalThis,function(){
 "use strict";
 const H4=14400000,DAY=86400000,VERSION="CTD-ELIGIBILITY-1.0";
 const roundDown=(v,s)=>Math.floor((v+1e-10*s)/s)*s;
 const roundUp=(v,s)=>Math.ceil((v-1e-10*s)/s)*s;
 const finite=x=>Number.isFinite(x);
 function fail(status,code,detail,extras={}){
   return {status,code,reason:detail,ticket:null,version:VERSION,...extras};
 }
 function knownDaily(bars,at){
   if(!Array.isArray(bars))return [];
   return bars.filter(b=>b.t+DAY<=at).sort((a,b)=>a.t-b.t);
 }
 function quoteGate(q,now){
   if(!q||!finite(q.bid)||!finite(q.ask)||q.bid<=0||q.ask<q.bid) return "Sin cotización bid/ask válida";
   if(!finite(q.asOf)||Math.abs(now-q.asOf)>90000)return "Cotización desactualizada o futura";
   if(!q.filters||q.filters.trading!==true)return "Mercado spot no habilitado";
   for(const field of ["tickSize","stepSize","minQty","minNotional"])
     if(!finite(q.filters[field])||q.filters[field]<0||(field!=="minNotional"&&q.filters[field]===0))
       return "Restricciones de intercambio incompletas: "+field;
   if(!finite(q.quoteVolume24h)||q.quoteVolume24h<2000000)return "Liquidez 24h insuficiente o desconocida";
   const spread=(q.ask-q.bid)/q.ask;
   if(spread>.0035)return "Spread superior a 0,35%";
   return null;
 }
 function resistance(bars,entry,profile){
   // Confirmed local pivots only: highs at i with two full bars on each side.
   const highs=[];
   for(let i=Math.max(2,bars.length-95);i<bars.length-2;i++){
     if(bars[i].h>entry&&bars[i].h>bars[i-1].h&&bars[i].h>bars[i-2].h&&
         bars[i].h>=bars[i+1].h&&bars[i].h>=bars[i+2].h)highs.push(bars[i].h);
   }
   if(profile&&finite(profile.vah)&&profile.vah>entry)highs.push(profile.vah);
   return highs.length?Math.min(...highs):null;
 }
 function decide({bars4h,bars1d,quote,profile,capital=1000,openExposure=0,openRisk=0,now=Date.now(),engine}={}){
   if(!engine||typeof engine.indicators!=="function")return fail("SIN_DATOS","ENGINE","Motor de indicadores ausente");
   if(!Array.isArray(bars4h)||bars4h.length<210)return fail("SIN_DATOS","BARS_4H","Histórico 4H insuficiente");
   const b=bars4h.at(-1),closeAt=b.t+H4;
   if(closeAt>now||b.t!==Math.floor(now/H4)*H4-H4)
     return fail("SIN_DATOS","STALE_4H","No está disponible la última vela 4H cerrada");
   if(bars4h.slice(-210).some((z,i,a)=>i&&z.t-a[i-1].t!==H4))
     return fail("SIN_DATOS","GAPS","Existen huecos recientes en velas 4H");
   const ind=engine.indicators(bars4h,"4h"),k=bars4h.length-1;
   if(!ind.valid?.[k])return fail("SIN_DATOS","INDICATORS","Indicadores 4H no confirmados");
   const daily=knownDaily(bars1d,closeAt);
   if(daily.length<210)return fail("SIN_DATOS","DAILY","No hay suficientes velas diarias cerradas en el momento de la señal");
   if(daily.slice(-210).some((z,i,a)=>i&&z.t-a[i-1].t!==DAY))
     return fail("SIN_DATOS","DAILY_GAPS","Hay huecos en la tendencia diaria");
   const d=engine.indicators(daily,"1d"),j=daily.length-1;
   if(!d.valid?.[j]||!finite(d.ema10[j])||!finite(d.ema55[j]))
     return fail("SIN_DATOS","DAILY_IND","Tendencia diaria sin confirmar");
   const dailyBull=d.ema10[j]>d.ema55[j]&&daily.at(-1).c>d.ema55[j];
   const context={dailyBull,dailyKnownAt:daily[j].t+DAY,ema10d:d.ema10[j],ema55d:d.ema55[j],
      signalAt:closeAt,technicalSignal:!!ind.long[k],trend4h:ind.ema10[k]>ind.ema55[k],
      momentum:ind.momentum[k],adx:ind.adx[k],profileQuality:profile?.quality||"NO DISPONIBLE"};
   if(!dailyBull)return fail("ESPERAR","DAILY_TREND","Tendencia diaria no favorece operaciones LONG",{context});
   if(!ind.long[k])return fail(ind.parts?.[k]?.early?"VIGILAR":"ESPERAR","NO_SIGNAL",
      "No existe señal TL-BASE nueva en la última vela 4H",{context});
   if(!finite(capital)||capital<=0||!finite(openExposure)||!finite(openRisk)||openRisk<0)
     return fail("NO_OPERABLE","CAPITAL","Capital o riesgo de cartera inválido",{context});
   const qFail=quoteGate(quote,now);
   if(qFail)return fail("NO_OPERABLE","QUOTE",qFail,{context});
   if(!profile||!finite(profile.poc)||!finite(profile.val)||!finite(profile.vah))
     return fail("NO_OPERABLE","PROFILE","Perfil de volumen no verificable",{context});
   if(now>closeAt+H4-30000)
     return fail("CADUCADA","EXPIRED","La ventana operativa de esta señal terminó",{context});
   const atr=ind.atr[k],f=quote.filters;
   if(!finite(atr)||atr<=0)return fail("SIN_DATOS","ATR","ATR no válido",{context});
   const entry=roundUp(quote.ask,f.tickSize),maxChase=b.c+0.45*atr;
   if(entry>maxChase)return fail("NO_OPERABLE","CHASE","El precio superó el máximo admisible de entrada",{context,maxChase});
   if(entry<profile.val-atr||entry>profile.vah+1.5*atr)
     return fail("NO_OPERABLE","VOLUME_ZONE","Precio fuera de zona de volumen admisible",{context});
   // Carter experimental hypothesis: swing low / EMA55 invalidation with volatility buffer.
   const low=Math.min(...bars4h.slice(-9).map(x=>x.l));
   const stop=roundDown(Math.min(low,ind.ema55[k])-0.15*atr,f.tickSize);
   if(!(stop>0&&stop<entry))return fail("NO_OPERABLE","STOP","No se obtuvo invalidación técnica válida",{context});
   const stopPct=(entry-stop)/entry;
   if(stopPct>.08)return fail("NO_OPERABLE","STOP_TOO_FAR","Invalidación superior al 8% del precio de entrada",{context});
   const target0=resistance(bars4h,entry,profile);
   if(!target0)return fail("NO_OPERABLE","RESISTANCE","No existe resistencia superior medible para fijar objetivo",{context});
   const target=roundDown(target0,f.tickSize);
   // Conservative assumptions, non-live estimated round-trip charges.
   const feeRate=.001,slippageRate=.0005;
   const riskPerUnit=(entry-stop)+entry*(feeRate+slippageRate)+stop*(feeRate+slippageRate);
   const rewardPerUnit=(target-entry)-entry*(feeRate+slippageRate)-target*(feeRate+slippageRate);
   const r=rewardPerUnit/riskPerUnit;
   if(!(r>=1.5))return fail("NO_OPERABLE","LOW_R","Recorrido neto a resistencia insuficiente (<1,5R)",{context,r});
   const riskLimit=Math.max(0,capital*.01-openRisk),exposureLimit=Math.max(0,capital*.20-openExposure);
   const qty=roundDown(Math.min(riskLimit/riskPerUnit,exposureLimit/(entry*(1+feeRate))),f.stepSize);
   const notional=qty*entry;
   if(qty<f.minQty||notional<Math.max(f.minNotional,0)||qty<=0)
     return fail("NO_OPERABLE","SIZE","Cantidad inferior al mínimo del mercado o al presupuesto de riesgo",{context});
   if(f.maxQty&&qty>f.maxQty)return fail("NO_OPERABLE","MAX_QTY","Cantidad superior al máximo permitido",{context});
   const ticket={side:"BUY",type:"LIMIT",entry,minimum:Math.max(profile.val,entry-0.25*atr),
      maxChase:roundDown(maxChase,f.tickSize),stop,target,quantity:qty,notional,
      riskUSDT:qty*riskPerUnit,riskPct:qty*riskPerUnit/capital,netR:r,
      estimatedCostsUSDT:qty*(entry+target)*(feeRate+slippageRate),
      validFrom:closeAt,expiresAt:closeAt+H4-30000,
      signalClose:b.c,signalAt:closeAt,dailyKnownAt:context.dailyKnownAt,
      profileQuality:context.profileQuality,
      provenance:"CARTER_HIPOTESIS",strategy:"TL-BASE-MTF-VP-EXPERIMENTAL",
      audit:"VENTAJA ESTADISTICA NO DEMOSTRADA",quoteAt:quote.asOf};
   return{status:"CANDIDATO",code:"TECHNICALLY_EXECUTABLE",reason:"Ticket técnico experimental; NO es una estrategia aprobada para operar capital real",
      context,ticket,version:VERSION};
 }
 return{version:VERSION,decide,knownDaily,quoteGate,roundDown,roundUp,resistance};
});