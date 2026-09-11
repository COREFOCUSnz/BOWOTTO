const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--js-flags=--max-old-space-size=8192','--disable-dev-shm-usage']});
 const p=await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300))); p.on('console',m=>{ if(m.type()!=='log') console.log('C',m.text().slice(0,200)); }); p.on('crash',()=>console.log('PAGE CRASHED')); p.on('close',()=>console.log('PAGE CLOSED'));
 await p.goto('file://'+__dirname+'/merge_car_draws.html',{timeout:120000});
 const prom = p.evaluate(f=>window.__go(f), process.argv[2]);
 let arr, stats;
 try { [arr, stats] = await prom; } catch(e) { console.log('promise rejected/failed:', e.message.slice(0,200)); const log = await p.evaluate(()=>window.__log).catch(()=>['(page gone)']); console.log('LOG:', JSON.stringify(log)); process.exit(1); }
 fs.writeFileSync(process.argv[3], Buffer.from(arr)); console.log('merged', JSON.stringify(stats), 'bytes', fs.statSync(process.argv[3]).size);
 await b.close(); })();
