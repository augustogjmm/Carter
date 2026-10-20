const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');
const dir=require('node:path').join(__dirname,'..','.github','workflows');
test('Only ONE 4H scheduled workflow publishes market snapshots',()=>{
 const workflows=['scan.yml','tl-scan.yml','paper.yml','cloudflare-market-sync.yml'];
 const text=Object.fromEntries(workflows.map(x=>[x,fs.readFileSync(require('node:path').join(dir,x),'utf8')]));
 for(const name of workflows.slice(0,3)){
  a(!/schedule\s*:/.test(text[name]),'Old scanner still scheduled: '+name);
  a(/workflow_dispatch/.test(text[name]),'Manual fallback missing: '+name);
 }
 const p=text['cloudflare-market-sync.yml'];
 a.equal([...p.matchAll(/cron:/g)].length,1);
 a.match(p,/cron: '19 \*\/4 \* \* \*'/);
 for(const x of ['data/radar.json','data/tl-radar.json','data/desk-opportunities.json',
  'data/paper/summary.json','data/paper/state.json'])a(p.includes(x),x);
 a.match(p,/git add data\/radar\.json data\/tl-radar\.json data\/desk-opportunities\.json data\/paper\/summary\.json data\/paper\/state\.json/);
});
