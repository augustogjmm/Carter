"""Fetch real closed bars; delegate diagnostics to the exact browser JS sources."""
import json,subprocess,tempfile
from pathlib import Path
import review_suite as base

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'data/carter-actual';OUT.mkdir(parents=True,exist_ok=True)
datasets=[];fingerprints=[]
for symbol in ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','LTCUSDT']:
 d,fp=base.data(symbol);fingerprints.append(fp)
 datasets.append({'symbol':symbol,'candles':json.loads(d[['t','o','h','l','c','v']].to_json(orient='records'))})
with tempfile.TemporaryDirectory() as directory:
 source=Path(directory)/'candles.json';source.write_text(json.dumps(datasets))
 subprocess.run(['node',str(ROOT/'research/carter_actual.cjs'),str(source),str(OUT/'summary.json')],check=True)
result=json.loads((OUT/'summary.json').read_text());result['fingerprints']=fingerprints
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
print(json.dumps([{k:r[k] for k in ['symbol','window','model','n','pf','totalR','maxDDR']} for r in result['rows'] if r['window']=='OOS_REVIEW']),flush=True)
