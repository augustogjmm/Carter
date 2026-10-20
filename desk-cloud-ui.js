/* Optional Carter Cloud UI: lazy-loads pinned public Supabase SDK without blocking Desk. */
(function(){
"use strict";
const PROJECT="https://swhfftkhqmbtmbnoskoj.supabase.co";
const PUBLISHABLE="sb_publishable_EbjOQ0SprPfdKLTQ6zER0w_DGsf128M";
const SDK="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
const $=id=>document.getElementById(id);
const report=msg=>{$('cloudInfo').textContent=msg;};
let sdkPromise=null,client=null,cloud=null,remoteRevision=null,remoteUpdatedAt=null,loggedIn=false;
function getSdk(){
 if(window.supabase?.createClient)return Promise.resolve(window.supabase);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src=SDK;s.async=true;s.crossOrigin="anonymous";
  s.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(Error("No se pudo cargar SDK de autenticación"));
  s.onerror=()=>reject(Error("No se pudo acceder al servicio de inicio de sesión"));
  document.head.append(s);
 });return sdkPromise;
}
async function connect(){
 if(cloud)return cloud;
 const sdk=await getSdk();
 client=sdk.createClient(PROJECT,PUBLISHABLE,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 cloud=window.CarterCloud.create(client);return cloud;
}
async function showUser(){
 const c=await connect();
 const {data,error}=await client.auth.getUser();
 if(error)throw error;
 loggedIn=!!data?.user;
 $('cloudLogin').hidden=loggedIn;$('cloudOperations').hidden=!loggedIn;
 $('cloudUser').textContent=data?.user?.email||"—";
 if(!loggedIn){$('cloudState').textContent="SIN SESIÓN";remoteRevision=null;remoteUpdatedAt=null;return;}
 const r=await c.read();remoteRevision=r.record?.revision??null;remoteUpdatedAt=r.record?.payload?.updatedAt??null;
 $('cloudState').textContent=r.record?"NUBE ACTIVA":"NUBE VACÍA";
 report(r.record?"Copias con revisión "+remoteRevision+". Para restaurar, hacé antes una exportación local.":
 "Tu cuenta está conectada. Todavía no existe copia remota; podés subirla explícitamente.");
}
function mount({journal,onRestore}){
 if(!journal||typeof journal.exportJSON!=="function")throw Error("Bitácora no disponible");
 $('cloudLogin').hidden=false;$('cloudOperations').hidden=true;
 $('cloudEmailSend').onclick=async()=>{
  const email=$('cloudEmail').value.trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){report("Correo electrónico inválido");return;}
  $('cloudEmailSend').disabled=true;
  try{
   await connect();
   const {error:e}=await client.auth.signInWithOtp({email,options:{
    emailRedirectTo:window.location.origin+"/desk.html",shouldCreateUser:true}});
   if(e)throw e;
   report("Se envió el acceso al correo indicado, si el servicio acepta la dirección. Abrí el enlace o ingresá el código recibido. No compartas enlaces ni códigos.");
  }catch(e){report("No se pudo enviar el acceso: "+e.message);}
  finally{$('cloudEmailSend').disabled=false;}
 };
 $('cloudVerify').onclick=async()=>{
  const email=$('cloudEmail').value.trim(),token=$('cloudToken').value.trim();
  if(!/^\d{6,8}$/.test(token)){report("Ingresá el código de 6 a 8 cifras recibido por correo (si tu plantilla envió uno)");return;}
  try{
   await connect();const {error:e}=await client.auth.verifyOtp({email,token,type:"email"});if(e)throw e;
   $('cloudToken').value="";await showUser();
  }catch(e){report("No se pudo verificar el acceso: "+e.message);}
 };
 $('cloudRefresh').onclick=async()=>{try{await showUser();}catch(e){report("Sesión: "+e.message);}};
 $('cloudSave').onclick=async()=>{
  if(!loggedIn){report("Primero iniciá sesión");return;}
  if(!window.confirm("¿Querés subir una COPIA de tus órdenes y fills manuales a tu cuenta privada en la nube? No se envían órdenes a ningún exchange."))return;
  $('cloudSave').disabled=true;
  try{
   const result=await cloud.save(journal.exportJSON(),remoteRevision);remoteRevision=result.revision;
   remoteUpdatedAt=JSON.parse(journal.exportJSON()).updatedAt;
   $('cloudState').textContent="NUBE ACTIVA";
   report("Copia subida. Revisión "+result.revision+". No se enviaron órdenes al exchange.");
  }catch(e){report("No se guardó la copia: "+e.message);}
  finally{$('cloudSave').disabled=false;}
 };
 $('cloudLoad').onclick=async()=>{
  if(!loggedIn){report("Primero iniciá sesión");return;}
  try{
   const {record}=await cloud.read();if(!record){report("Todavía no hay copia remota");return;}
   if(!window.confirm("Esto REEMPLAZARÁ tu bitácora local. Exportá primero una copia de seguridad JSON de este navegador. ¿Confirmás?"))return;
   const saved=journal.restoreJSON(JSON.stringify(record.payload));remoteRevision=record.revision;
   remoteUpdatedAt=record.payload?.updatedAt??null;
   onRestore?.();
   report("Copia remota restaurada: "+saved.orders+" órdenes y "+saved.fills+" fills. No se transmitió ninguna operación.");
  }catch(e){report("No se restauró la copia remota: "+e.message);}
 };
 $('cloudLogout').onclick=async()=>{
  try{await connect();const {error:e}=await client.auth.signOut();if(e)throw e;
   remoteRevision=null;remoteUpdatedAt=null;await showUser();report("Sesión de la nube cerrada. La bitácora local permanece en este navegador.");}
  catch(e){report("No se pudo cerrar sesión: "+e.message);}
 };
 // A returning magic link or existing local session is recognized; no data is uploaded automatically.
 if(window.location.hash.includes("access_token=")||window.location.search.includes("code=")||
 Object.keys(localStorage).some(k=>k.startsWith("sb-")&&k.endsWith("-auth-token"))){
  showUser().catch(e=>report("Sesión no validada: "+e.message));
 }
}
window.CarterCloudUI={mount};
})();