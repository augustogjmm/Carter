const test=require("node:test"),a=require("node:assert/strict"),C=require("../desk-cloud.js");
const local={schema:1,orders:[],fills:[],updatedAt:200};
test("cloud refuses invalid schemas and oversized journals",()=>{
 a.deepEqual(C.parseJournal(JSON.stringify(local)),local);
 a.throws(()=>C.parseJournal("{}"),/incompatible/);
 a.throws(()=>C.parseJournal("oops"),/JSON inválido/);
});
test("RLS client never overwrites a cloud revision from another device",()=>{
 a.throws(()=>C.preflight({revision:2,payload:{updatedAt:100}},local,1),/CONFLICTO/);
 a.throws(()=>C.preflight({revision:2,payload:{updatedAt:300}},local,2),/más nuevo/);
 a.doesNotThrow(()=>C.preflight({revision:2,payload:{updatedAt:100}},local,2));
 a.throws(()=>C.preflight(null,local,1),/CONFLICTO/);
});
test("cloud requires authenticated principal from Supabase Auth",async()=>{
 const client={auth:{getUser:async()=>({data:{user:null}})},from:()=>{throw Error("should not query")}};
 const c=C.create(client);
 await a.rejects(c.read(),/iniciar sesión/);
 await a.rejects(c.save(local,null),/iniciar sesión/);
});
test("cloud never writes another principal ID or overwrites concurrent revisions",async()=>{
 const uid="00000000-0000-0000-0000-000000000003";
 let row=null;
 const client={
  auth:{getUser:async()=>({data:{user:{id:uid,email:"test@example.com"}}})},
  from(name){
   a.equal(name,"carter_user_journals");
   let operation=null,write=null,conditions=[];
   const chain={
    select(){return chain;},
    eq(k,v){conditions.push([k,v]);return chain;},
    insert(value){operation="insert";write=value;return chain;},
    update(value){operation="update";write=value;return chain;},
    async maybeSingle(){
     if(!operation)return{data:row,error:null};
     if(conditions.some(([k,v])=>k==="revision"&&v!==row.revision))return{data:null,error:null};
     row={...row,...write};return{data:{revision:row.revision},error:null};
    },
    async single(){row={...write};return{data:{revision:row.revision},error:null};}
   };return chain;
  }
 };
 const c=C.create(client);
 const s=await c.save(JSON.stringify(local),null);a.equal(s.revision,1);
 a.equal(row.user_id,uid);
 const r=await c.read();a.equal(r.record.revision,1);
 const newer={...local,updatedAt:300};
 const next=await c.save(newer,1);a.equal(next.revision,2);
 await a.rejects(c.save(newer,1),/CONFLICTO/);
});