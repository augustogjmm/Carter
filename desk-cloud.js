/* Carter Cloud: opt-in, per-user RLS secured journal sync; never submits orders.
   Requires Supabase publishable key only; NO service role or credentials in code.
   Writes use an optimistic revision check, so concurrent devices cannot silently overwrite. */
(function(root,factory){const c=factory();if(typeof module==="object"&&module.exports)module.exports=c;if(root)root.CarterCloud=c;})(typeof window!=="undefined"?window:globalThis,function(){
"use strict";
const TABLE="carter_user_journals";
const error=s=>new Error(s);
function parseJournal(input){
 let data;
 try{data=typeof input==="string"?JSON.parse(input):input;}catch(e){throw error("JSON inválido");}
 if(!data||data.schema!==1||!Array.isArray(data.orders)||!Array.isArray(data.fills)||
 data.orders.length>5000||data.fills.length>20000)
  throw error("Formato de bitácora incompatible");
 if(JSON.stringify(data).length>1500000)throw error("Bitácora supera el máximo de 1,5 MB");
 return data;
}
function preflight(remote,local,expectedRevision){
 if(remote){
  if(!Number.isInteger(expectedRevision)||expectedRevision!==remote.revision)
   throw error("CONFLICTO: otra sesión modificó la copia de la nube. Descargá y revisá antes de guardar.");
  if(Number(remote.payload?.updatedAt)>Number(local.updatedAt||0))
   throw error("CONFLICTO: el archivo remoto es más nuevo que la copia local; no se sobrescribió.");
 }else if(expectedRevision!==null&&expectedRevision!==undefined)
  throw error("CONFLICTO: no existe la versión remota esperada");
}
function create(client){
 if(!client?.auth?.getUser||!client.from)throw error("Cliente autenticado no disponible");
 async function identify(){
  const {data,error:e}=await client.auth.getUser();
  if(e)throw e;
  if(!data?.user?.id)throw error("Debés iniciar sesión antes de sincronizar");
  return data.user;
 }
 async function read(){
  const user=await identify();
  const {data,error:e}=await client.from(TABLE).select("revision,payload,updated_at").eq("user_id",user.id).maybeSingle();
  if(e)throw e;
  return{userId:user.id,record:data||null};
 }
 async function save(raw,expectedRevision){
  const payload=parseJournal(raw),{userId,record}=await read();
  preflight(record,payload,expectedRevision);
  if(!record){
   const {data,error:e}=await client.from(TABLE).insert({user_id:userId,payload,revision:1})
    .select("revision,updated_at").single();
   if(e)throw e;return{revision:data.revision,created:true};
  }
  const {data,error:e}=await client.from(TABLE)
   .update({payload,revision:record.revision+1,updated_at:new Date().toISOString()})
   .eq("user_id",userId).eq("revision",record.revision).select("revision,updated_at").maybeSingle();
  if(e)throw e;
  if(!data)throw error("CONFLICTO: otra sesión actualizó el registro mientras guardabas. No se sobrescribió.");
  return{revision:data.revision,created:false};
 }
 return{read,save,identify};
}
return{create,parseJournal,preflight,table:TABLE};
});