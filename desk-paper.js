/* Read-only prospective paper monitor. Never maps hypothetical fills to user holdings. */
(function(root,factory){const a=factory();if(typeof module==="object"&&module.exports)module.exports=a;if(root)root.CarterPaper=a;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const VERSION="CARTER-PAPER-READ-1",H4=14400000;
function inspect(snapshot,now=Date.now()){
 if(!snapshot||snapshot.mode!=="PAPER_ONLY"||!Array.isArray(snapshot.accounts)||!Array.isArray(snapshot.events))
  throw Error("Registro prospectivo inexistente o incompatible");
 const generated=Date.parse(snapshot.generatedAt);
 if(!Number.isFinite(generated)||generated>now+60000)throw Error("Marca temporal del registro inválida");
 const stale=now-generated>H4+2*3600000;
 const keys=new Set(["LATINO","CARTER_RAW"]);
 const accounts=snapshot.accounts.filter(a=>keys.has(a.model)&&/^(BTC|ETH|SOL|BNB)USDT$/.test(a.symbol))
 .map(a=>({symbol:a.symbol,model:a.model,open:a.open===true,
  entry:a.open?Number(a.position?.entry):null,stop:a.open?Number(a.position?.stop):null,
  quantity:a.open?Number(a.position?.qty):null,
  tp1:a.open?Number(a.position?.tp1):null,markPrice:Number(a.markPrice),
  equity:Number(a.equity),returnPct:Number(a.return)*100,
  closed:Number(a.closed),lastClosedAt:Number(a.markAt)}))
 .sort((a,b)=>Number(b.open)-Number(a.open)||a.model.localeCompare(b.model)||a.symbol.localeCompare(b.symbol));
 const events=snapshot.events.filter(x=>keys.has(x.model)).slice(-12).reverse().map(e=>({
  model:e.model,symbol:e.symbol,kind:e.kind,price:Number(e.price),
  time:Number(e.time),recordedAt:Number(e.recordedAt),reconstructed:e.reconstructed===true,
  reason:e.reason||"APERTURA SIGUIENTE"}));
 return {version:VERSION,generatedAt:generated,stale,accounts,events,
   status:stale?"DATOS ATRASADOS":"SIMULACION ACTUALIZADA",
   active:accounts.filter(a=>a.open).length,
   disclosure:"OPERACIONES TEORICAS: NO SON COMPRAS DEL USUARIO NI ENTRADAS AUDITADAS"};
}
return{version:VERSION,inspect};
});