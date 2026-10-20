const test=require("node:test"),a=require("node:assert/strict"),I=require("../scripts/vercel-ignore.cjs");
test("CI-only and readmes do not generate Vercel previews",()=>{
 a.equal(I.decision(["README.md",".github/workflows/desk-validate.yml","research/notes.md","tests/a.test.cjs"]).skip,true);
});
test("data snapshots and active UI/API always generate deployments",()=>{
 for(const p of ["data/tl-radar.json","data/paper/summary.json","data/desk-opportunities.json",
 "desk.html","desk-app.js","api/desk-quote.js","vercel.json","scripts/desk-scan.cjs"]){
  a.equal(I.decision([p]).skip,false,p);
 }
});
test("missing or partial diff builds to avoid stale production",()=>{
 a.equal(I.decision([]).skip,false);
 a.equal(I.decision(["README.md","desk.css"]).skip,false);
});
