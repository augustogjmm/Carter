/* Carter static build for Cloudflare Pages Free.
 * Only browser assets and public data are published. No credentials, Supabase, order state,
 * private journal, source control directories or test fixtures are exposed.
 * Node 22, zero packages, zero paid storage products.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const MAX_ASSET=25*1024*1024;
function build(root=path.resolve(__dirname,'..')){
 const output=path.join(root,'cloudflare-dist');
 const pages=['html','css','js'];
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 const excluded=new Set(['desk-cloud-ui.js','desk-cloud.js']);
 const generated=[];
 function add(src,dest){
  const stat=fs.statSync(src);if(stat.size>MAX_ASSET)throw Error('Cloudflare file >25MiB: '+dest);
  const full=path.join(output,dest);fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.copyFileSync(src,full);generated.push(dest);
 }
 for(const name of fs.readdirSync(root)){
  const full=path.join(root,name);
  if(!fs.statSync(full).isFile()||!pages.includes(path.extname(name).slice(1))||excluded.has(name))continue;
  add(full,name);
 }
 const data=path.join(root,'data');
 function visit(folder){
  if(!fs.existsSync(folder))return;
  for(const item of fs.readdirSync(folder)){
   const full=path.join(folder,item),st=fs.statSync(full);
   if(st.isDirectory())visit(full);
   else if(st.isFile()){
    const rel=path.relative(root,full).replaceAll(path.sep,'/');
    if(rel==='data/paper/state.json')continue; // not a public UI artifact
    if(!['.json','.csv','.md'].includes(path.extname(full).toLowerCase()))continue;
    add(full,rel);
   }
  }
 }
 visit(data);
 // The opt-in Supabase panel is intentionally NOT available in this zero-cost release.
 // Its source is kept in Git history, not in Cloudflare's public static build.
 const desk=path.join(output,'desk.html');
 if(fs.existsSync(desk)){
  let html=fs.readFileSync(desk,'utf8');
  const start=html.indexOf('  <section class="panel">\n   <div class="section-head"><div><p class="eyebrow">COPIA PRIVADA');
  if(start>=0){
   const end=html.indexOf('  </section>\n </aside>',start);
   if(end<0)throw Error('Cannot safely remove Supabase panel from Cloudflare build');
   html=html.slice(0,start)+html.slice(end+'  </section>\n'.length);
  }
  html=html.replaceAll('<script src="/desk-cloud.js"></script>','')
    .replaceAll('<script src="/desk-cloud-ui.js"></script>','');
  fs.writeFileSync(desk,html);
 }
 const redirects='/ /desk.html 302\n';
 const routes=JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2)+'\n';
 const headers='/data/*\n  Cache-Control: public, max-age=0, must-revalidate\n/*.js\n  Cache-Control: public, max-age=0, must-revalidate\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n';
 fs.writeFileSync(path.join(output,'_redirects'),redirects);
 fs.writeFileSync(path.join(output,'_routes.json'),routes);
 fs.writeFileSync(path.join(output,'_headers'),headers);
 for(const dest of generated.filter(x=>x.endsWith('.html'))){
  const html=fs.readFileSync(path.join(output,dest),'utf8');
  for(const m of html.matchAll(/<script[^>]*src=["']\/([^"']+)["']/g))
   if(!fs.existsSync(path.join(output,m[1])))
    throw Error('Unresolved browser script in '+dest+': '+m[1]);
 }
 if(generated.length<22)throw Error('Unexpectedly small output: '+generated.length);
 if(fs.existsSync(path.join(output,'desk-cloud-ui.js'))||
    fs.existsSync(path.join(output,'data/paper/state.json')))throw Error('Private component leaked into public build');
 const stats={files:generated.length,output:'cloudflare-dist',bytes:generated.reduce((n,x)=>n+fs.statSync(path.join(output,x)).size,0),
  api:['market','top50','desk-quote','health'],paidResources:0};
 console.log('CLOUDFLARE_FREE_BUILD',JSON.stringify(stats));return stats;
}
if(require.main===module)build();
module.exports={build};
