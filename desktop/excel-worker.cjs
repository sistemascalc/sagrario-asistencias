const {parentPort,workerData}=require('node:worker_threads');
const {readWorkbook}=require('./excel.cjs');
try {parentPort.postMessage({book:readWorkbook(workerData)});} catch(error) {parentPort.postMessage({error:error.message});}
