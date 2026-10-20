/* Read-only next-candle scenario; NEVER marks a live buy or creates an order.
   Objective: tell an operator what would need to happen next, not guess the future. */
(function(root,factory){const a=factory();if(typeof module==="object"&&module.exports)module.exports=a;if(root)root.CarterScenario=a;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const H4=14400000,DAY=86400000;
const finite=Number.isFinite,fail=(status,why)=>({status,reason:why,canBuyNow:false,trigger:null,stop:null,target:null,netR:null});
function project({bars4h,bars1d,engine,profile,quote,now=Date.now()}={}){
 if(!engine||!Array.isArray(bars4h)||bars4h.length<220||!Array.isArray(bars1d)||bars1d.length<220)
  return fail("SIN_DATOS","Faltan velas para construir una proyección causal");
 const candle=bars4h.at(-1),signalAt=candle.t+H4;
 if(signalAt>now||candle.t!==Math.floor(now/H4)*H4-H4)
  return fail("SIN_DATOS","No está disponible el cierre 4H más reciente");
 if(bars4h.slice(-220).some((x,i,a)=>i&&x.t-a[i-1].t!==H4))
  return fail("SIN_DATOS","Huecos de velas 4H");
 const daily=bars1d.filter(x=>x.t+DAY<=signalAt).sort((a,b)=>a.t-b.t);
 if(daily.length<220||daily.slice(-220).some((x,i,a)=>i&&x.t-a[i-1].t!==DAY))
  return fail("SIN_DATOS","Sin contexto diario cerrado válido");
 const ix=engine.indicators(bars4h,"4h"),iy=engine.indicators(daily,"1d"),
    k=bars4h.length-1,j=daily.length-1;
 if(!ix.valid?.[k]||!iy.valid?.[j]||![ix.atr[k],ix.ema10[k],ix.ema55[k],ix.momentum[k],iy.ema10[j],iy.ema55[j]].every(finite))
  return fail("SIN_DATOS","Indicadores incompletos");
 const dayBull=iy.ema10[j]>iy.ema55[j]&&daily.at(-1).c>iy.ema55[j];
 if(!dayBull)return fail("NO_LONG","Tendencia diaria no favorece compras: esperar recuperación confirmada");
 const atr=ix.atr[k];
 if(atr<=0)return fail("SIN_DATOS","Volatilidad ATR no válida");
 const f=quote?.filters,validTick=f&&finite(f.tickSize)&&f.tickSize>0;
 if(!validTick)return fail("SIN_DATOS","Sin reglas de precio del exchange para proyectar niveles ejecutables");
 const tick=f.tickSize;
 const ceil=x=>Math.ceil((x-1e-9*tick)/tick)*tick;
 const floor=x=>Math.floor((x+1e-9*tick)/tick)*tick;
 const trigger=ceil(Math.max(...bars4h.slice(-4).map(x=>x.h))+tick);
 const invalidation=floor(Math.min(...bars4h.slice(-10).map(x=>x.l),ix.ema55[k])-0.15*atr);
 const structureBull=ix.ema10[k]>ix.ema55[k];
 const momentumUp=ix.momentum[k]>ix.momentum[k-1];
 const p=profile&&[profile.poc,profile.val,profile.vah].every(finite)?profile:null;
 const reasons=[
  structureBull?"EMA 10/55 alcista 4H":"EMA 10/55 todavía sin confirmar al alza",
  momentumUp?"Momentum 4H aumentando":"Momentum todavía sin recuperación",
  p?"POC y área de valor estimados disponibles":"No hay un perfil de volumen válido"
 ];
 const targetCandidates=[];
 const candidateHighs=bars4h.slice(-120,-4);
 for(let i=2;i<candidateHighs.length-2;i++)if(candidateHighs[i].h>trigger &&
   candidateHighs[i].h>candidateHighs[i-1].h&&candidateHighs[i].h>candidateHighs[i-2].h&&
   candidateHighs[i].h>=candidateHighs[i+1].h&&candidateHighs[i].h>=candidateHighs[i+2].h)
   targetCandidates.push(candidateHighs[i].h);
 if(p&&p.vah>trigger)targetCandidates.push(p.vah);
 const target=targetCandidates.length?floor(Math.min(...targetCandidates)):null;
 const risk=trigger-invalidation;
 const estimatedR=target&&risk>0?(target-trigger)/(risk):null;
 return{status:"ESCENARIO_CONDICIONAL",reason:"Proyección del próximo disparador, no una señal de compra",
    canBuyNow:false,signalAt,expiresAt:signalAt+H4,trigger,
    stop:invalidation>0&&invalidation<trigger?invalidation:null,target,netR:estimatedR,
    dailyKnownAt:daily[j].t+DAY,ema10:ix.ema10[k],ema55:ix.ema55[k],
    momentumUp,structureBull,conditions:reasons,
    triggerRule:"Esperar cierre confirmado de la PRÓXIMA vela 4H por encima del nivel. Recalcular motor de entrada, libro de órdenes y riesgo; nunca comprar automáticamente.",
    riskWarning:estimatedR===null||estimatedR<1.5?"Recorrido objetivo insuficiente o no medible; no habilitar ticket":null,
    profileQuality:p?.quality||"SIN PERFIL",provenance:"CARTER_SCENARIO_EXPERIMENTAL"};
}
return{project};
});