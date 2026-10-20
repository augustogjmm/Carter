/* Carter Desk Journal — browser-local, user-confirmed fills only.
   No account connection; preparing a ticket NEVER creates a position. */
(function(root,factory){const m=factory();if(typeof module==="object"&&module.exports)module.exports=m;if(root)root.CarterJournal=m;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const KEY="carter-desk-journal-v1";
function assert(p,message){if(!p)throw Error(message);}
const positive=x=>Number.isFinite(x)&&x>0;
function empty(){return{schema:1,orders:[],fills:[],updatedAt:0};}
function read(store){try{const data=JSON.parse(store.getItem(KEY)||"null");if(data?.schema===1&&Array.isArray(data.orders)&&Array.isArray(data.fills))return data;}catch(e){}return empty();}
function create(store){
 assert(store&&typeof store.getItem==="function"&&typeof store.setItem==="function","Almacenamiento no disponible");
 let data=read(store);
 const commit=()=>{data.updatedAt=Date.now();store.setItem(KEY,JSON.stringify(data));};
 function prepared(ticket,symbol){
   assert(ticket?.type==="LIMIT"&&positive(ticket.quantity)&&positive(ticket.entry)&&/^[A-Z0-9]+USDT$/.test(symbol),"Ticket inválido");
   assert(ticket.validFrom<=Date.now()&&ticket.expiresAt>Date.now(),"Ticket vencido o futuro");
   const id="CTD-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
   data.orders.push({id,symbol,qty:ticket.quantity,limit:ticket.entry,createdAt:Date.now(),
      validUntil:ticket.expiresAt,signalAt:ticket.signalAt,strategy:ticket.strategy,
      status:"PREPARED",fills:0,filledQty:0,ticket:{...ticket}});
   commit();return id;
 }
 function setSubmitted(id){
   const o=data.orders.find(x=>x.id===id);assert(o,"Orden no encontrada");
   assert(o.status==="PREPARED","Solo una orden preparada puede marcarse enviada");
   o.status="SUBMITTED";commit();return o;
 }
 function cancel(id){
   const o=data.orders.find(x=>x.id===id);assert(o,"Orden no encontrada");
   assert(["PREPARED","SUBMITTED","PARTIAL"].includes(o.status),"No se puede cancelar");
   o.status=o.filledQty>0?"PARTIAL_CANCELLED":"CANCELLED";commit();return o;
 }
 function buy({orderId,quantity,price,fee=0,fillId,at=Date.now()}){
   assert(positive(quantity)&&positive(price)&&Number.isFinite(fee)&&fee>=0,"Fill de compra inválido");
   const order=data.orders.find(x=>x.id===orderId);assert(order,"Orden no encontrada");
   assert(["PREPARED","SUBMITTED","PARTIAL"].includes(order.status),"Orden cerrada");
   assert(Number.isFinite(at)&&at>=order.createdAt,"Fecha de fill inválida");
   if(fillId&&data.fills.some(x=>x.id===fillId))return order;
   const prior=data.fills.filter(x=>x.kind==="BUY"&&x.orderId===orderId).reduce((a,x)=>a+x.quantity,0);
   assert(prior+quantity<=order.qty+1e-8,"Cantidad supera ticket preparado");
   // A manual fill is an explicit user assertion, not proof that the exchange executed it.
   data.fills.push({id:fillId||"B-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
     kind:"BUY",symbol:order.symbol,orderId,quantity,price,fee,at});
   order.filledQty=prior+quantity;order.fills++;
   order.status=order.filledQty>=order.qty-1e-8?"FILLED":"PARTIAL";
   commit();return order;
 }
 function positions(){
   const pos=new Map();
   for(const fill of [...data.fills].sort((a,b)=>a.at-b.at)){
     const p=pos.get(fill.symbol)||{symbol:fill.symbol,quantity:0,basis:0,realized:0,buys:0,sells:0,lastFill:0};
     if(fill.kind==="BUY"){p.quantity+=fill.quantity;p.basis+=fill.quantity*fill.price+fill.fee;p.buys++;}
     else if(fill.kind==="SELL"){
       assert(fill.quantity<=p.quantity+1e-8,"Historial inconsistente: venta sin tenencia");
       const share=fill.quantity/p.quantity,cost=p.basis*share;
       p.realized+=fill.quantity*fill.price-fill.fee-cost;
       p.quantity-=fill.quantity;p.basis-=cost;p.sells++;
       if(p.quantity<1e-8){p.quantity=0;p.basis=0;}
     }
     p.lastFill=Math.max(p.lastFill,fill.at);pos.set(fill.symbol,p);
   }
   return [...pos.values()].map(p=>({...p,avgPrice:p.quantity?p.basis/p.quantity:0}));
 }
 function sell({symbol,quantity,price,fee=0,fillId,at=Date.now()}){
   assert(/^[A-Z0-9]+USDT$/.test(symbol)&&positive(quantity)&&positive(price)&&Number.isFinite(fee)&&fee>=0,"Venta inválida");
   if(fillId&&data.fills.some(x=>x.id===fillId))return;
   const p=positions().find(x=>x.symbol===symbol);
   assert(p&&quantity<=p.quantity+1e-8,"No se puede vender más cantidad que la registrada");
   data.fills.push({id:fillId||"S-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
     kind:"SELL",symbol,quantity,price,fee,at});commit();
 }
 const orders=()=>data.orders.map(o=>({...o,ticket:{...o.ticket}}));
 const fills=()=>data.fills.map(o=>({...o}));
 const exportJSON=()=>JSON.stringify(data,null,2);
 return{prepared,setSubmitted,cancel,buy,sell,orders,fills,positions,exportJSON,storage:"SOLO ESTE NAVEGADOR"};
}
return{create,empty,key:KEY};
});