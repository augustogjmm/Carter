/* Skip Vercel builds only when ALL changed files are GitHub/research-only.
 * Publish production assets and all data snapshots as before, to avoid stale 4H scans.
 * Exit 0 = skip build; exit 1 = build. Fail OPEN if Git metadata unavailable.
 */
"use strict";
const cp=require("node:child_process");
const safeOnly=path=>path==="README.md"||path.startsWith(".github/")||
  path.startsWith("research/")||path.startsWith("tests/")||
  path.startsWith(".vscode/")||path===".gitignore";
function decision(files){
 if(!Array.isArray(files)||files.length===0)return{skip:false,reason:"No reliable diff"};
 const unsafe=files.filter(p=>!safeOnly(p));
 return{skip:unsafe.length===0,reason:unsafe.length?"Production files changed: "+unsafe.join(", "):"Documentation, CI or tests only"};
}
function main(){
 const result=cp.spawnSync("git",["diff","--name-only","HEAD^","HEAD"],{encoding:"utf8",timeout:15000});
 if(result.error||result.status!==0){console.log("[vercel] Git parent not available. Building safely.");return 1;}
 const files=result.stdout.split(/\r?\n/).filter(Boolean),d=decision(files);
 console.log("[vercel]",d.skip?"Skipping":"Building",d.reason);
 return d.skip?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={decision,main};
