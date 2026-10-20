/* Reference levels for only the CURRENT manually-recorded holding cycle.
 * A sell has no lot/order attribution: never infer stale or ambiguous stops. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.CarterHoldingLevels=api;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
function current(symbol,positions,orders,fills){
 const p=positions?.find(x=>x.symbol===symbol&&x.quantity>1e-10);
 if(!p)return null;
 let quantity=0;let liveIds=new Set();let unmatched=false;
 const relevant=(fills||[]).filter(f=>f.symbol===symbol).sort((a,b)=>a.at-b.at);
 for(const f of relevant){
  const q=Number(f.quantity);
  if(!(q>0)||!Number.isFinite(q)){unmatched=true;break;}
  if(f.kind==="BUY"){
   if(quantity<=1e-10){quantity=0;liveIds=new Set();}
   if(typeof f.orderId!=="string")unmatched=true;else liveIds.add(f.orderId);
   quantity+=q;
  }else if(f.kind==="SELL"){
   quantity-=q;
   if(quantity<-1e-8){unmatched=true;break;}
   if(quantity<=1e-10){quantity=0;liveIds.clear();}
  }else unmatched=true;
 }
 const consistent=!unmatched&&Math.abs(quantity-p.quantity)<1e-8;
 const originating=(orders||[]).filter(o=>liveIds.has(o.id)&&o.symbol===symbol&&o.filledQty>0);
 const fullyAttributed=consistent&&originating.length===liveIds.size&&liveIds.size>0;
 const positive=x=>Number.isFinite(x)&&x>0;
 const stops=originating.map(o=>o.ticket?.stop),targets=originating.map(o=>o.ticket?.target);
 const unique=x=>x.length>0&&x.every(positive)&&x.every(v=>Math.abs(v-x[0])<=Math.max(1e-8,x[0]*1e-9))?x[0]:null;
 return{...p,stop:fullyAttributed?unique(stops):null,target:fullyAttributed?unique(targets):null,
  levelsVerified:fullyAttributed&&unique(stops)!==null&&unique(targets)!==null,
  levelSource:fullyAttributed?"CURRENT_CYCLE":"AMBIGUOUS_OR_MISSING"};
}
return{current};
});