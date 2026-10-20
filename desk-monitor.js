/* Carter position surveillance: deterministic, read-only advisory states.
   Never submits orders. Invalid/future data fail closed. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.CarterPositionMonitor=api;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const H4=14400000,finite=Number.isFinite,VERSION="CTD-MONITOR-1.0";
function watch({position,quote,bars4h,engine,levels={},now=Date.now()}={}){
 const base={version:VERSION,position:position?.symbol||null,levelStop:null,levelTarget:null,technicalClose:null};
 if(!position||!(position.quantity>0))return{...base,status:"SIN_POSICION",reason:"No existe tenencia confirmada",priority:0};
 const stop=finite(levels.stop)&&levels.stop>0?levels.stop:null;
 const target=finite(levels.target)&&levels.target>0?levels.target:null;
 base.levelStop=stop;base.levelTarget=target;
 if(!quote||!finite(quote.bid)||quote.bid<=0||!finite(quote.asOf)||quote.asOf>now+5000||now-quote.asOf>90000)
  return{...base,status:"SIN_COTIZACION",reason:"Cotización de venta no verificable: sin decisión vigente",priority:3};
 if(stop!==null&&quote.bid<=stop)return{...base,status:"REVISAR_STOP",reason:"Bid actual alcanzó o atravesó la invalidación registrada; confirmar mercado y orden externa",priority:5,bid:quote.bid};
 if(target!==null&&quote.bid>=target)return{...base,status:"REVISAR_OBJETIVO",reason:"Bid actual alcanzó objetivo registrado; comprobar si corresponde gestionar salida",priority:4,bid:quote.bid};
 if(!Array.isArray(bars4h)||bars4h.length<210||!engine||typeof engine.indicators!=="function")
  return{...base,status:"SIN_DATOS_TECNICOS",reason:"Sin histórico suficiente para revisión de régimen",priority:2,bid:quote.bid};
 const last=bars4h.at(-1);
 if(last.t+H4>now||last.t!==Math.floor(now/H4)*H4-H4)return{...base,status:"SIN_DATOS_TECNICOS",reason:"No hay última vela 4H confirmada",priority:2,bid:quote.bid};
 if(bars4h.slice(-210).some((b,i,a)=>i&&b.t-a[i-1].t!==H4))
  return{...base,status:"SIN_DATOS_TECNICOS",reason:"Huecos recientes impiden seguimiento técnico fiable",priority:2,bid:quote.bid};
 const d=engine.indicators(bars4h,"4h"),i=bars4h.length-1;base.technicalClose=last.t+H4;
 if(!d.valid?.[i]||!finite(d.ema55?.[i])||!finite(d.momentum?.[i]))
  return{...base,status:"SIN_DATOS_TECNICOS",reason:"Indicadores técnicos incompletos",priority:2,bid:quote.bid};
 const lostTrend=last.c<d.ema55[i],negative=d.momentum[i]<0;
 if(lostTrend&&negative)return{...base,status:"REVISAR_DETERIORO",reason:"El último cierre 4H está bajo EMA55 y momentum es negativo: reevaluar, no implica venta automática",priority:4,bid:quote.bid,ema55:d.ema55[i],momentum:d.momentum[i]};
 if(lostTrend)return{...base,status:"VIGILAR_TENDENCIA",reason:"El último cierre 4H está bajo EMA55; vigilar estructura y riesgo",priority:3,bid:quote.bid,ema55:d.ema55[i],momentum:d.momentum[i]};
 return{...base,status:"SEGUIMIENTO",reason:"Sin invalidación de precio ni deterioro simultáneo EMA55/momentum en último cierre 4H",priority:1,bid:quote.bid,ema55:d.ema55[i],momentum:d.momentum[i]};
}
return{version:VERSION,watch};
});