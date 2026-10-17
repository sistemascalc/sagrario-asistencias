const path = require('node:path');
const fs = require('node:fs');
const {Worker} = require('node:worker_threads');
const {randomUUID} = require('node:crypto');
const XLSX = require('xlsx');

const fields = ['id','givenNames','paternalSurname','maternalSurname','sponsor','notes'];
const aliases = {
  id:['numero','numeroderegistro','num','no','n','id','folio'],
  givenNames:['nombre','nombres','nombrecompleto','confirmando','confirmado','nombreconfirmando','nombredelconfirmando','nombredelconfirmado','alumno'],
  paternalSurname:['apellidopaterno','paterno','primerapellido','apellidos'],
  maternalSurname:['apellidomaterno','materno','segundoapellido'],
  sponsor:['padrino','madrina','padrinomadrina','padrinoomadrina','nombrepadrino','nombredelpadrino','nombrecompletodelpadrinoomadrina'],
  notes:['notas','observaciones','observacionesdelregistro','comentarios']
};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const text = value => typeof value === 'string' ? value : '';

// Parsing runs outside Electron's main thread. Formulas and macros are never executed.
function readWorkbook(file) {
  if(!['.xlsx','.xls','.csv'].includes(path.extname(file).toLowerCase())) throw Error('Selecciona un archivo .xlsx, .xls o .csv.');
  if(fs.statSync(file).size > 10*1024*1024) throw Error('El archivo supera el límite de 10 MB.');
  const buffer=fs.readFileSync(file);
  let book;
  try {
    const info=XLSX.read(buffer,{type:'buffer',bookSheets:true});
    if(info.SheetNames.length>20) throw Error('TOO_MANY_SHEETS');
    book=XLSX.read(buffer,{type:'buffer',sheetRows:10202,cellFormula:true,cellHTML:false,cellStyles:false,raw:true});
  } catch(error) {
    if(error.message==='TOO_MANY_SHEETS') throw Error('El archivo puede tener hasta 20 hojas.');
    throw Error('No se pudo leer el archivo. Comprueba que sea Excel o CSV y que no tenga contraseña.');
  }
  let cells=0;
  const sheets=book.SheetNames.map(name=>{
    const sheet=book.Sheets[name];
    if(!sheet['!ref']) return {name,rows:[]};
    const range=XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if(range.e.r>=10200 || range.e.c>=100) throw Error('Cada hoja puede tener hasta 10,200 filas y 100 columnas. Elimina las filas o columnas sobrantes.');
    cells+=(range.e.r+1)*(range.e.c+1);
    if(cells>500000) throw Error('El archivo contiene demasiadas celdas. Guarda la lista en un archivo más pequeño.');
    const rows=Array.from({length:range.e.r+1},(_,r)=>Array.from({length:range.e.c+1},(_,c)=>{
      const cell=sheet[XLSX.utils.encode_cell({r,c})];
      if(!cell) return '';
      if(cell.f || cell.F) return {error:'contiene una fórmula; pega su resultado como valor en Excel'};
      if(cell.t==='e') return {error:'contiene un error de Excel'};
      return String(cell.v ?? '').trim();
    }));
    return {name,rows};
  });
  if(!sheets.some(s=>s.rows.some(r=>r.some(c=>c!=='')))) throw Error('El archivo está vacío.');
  return {sheets};
}

function loadWorkbook(file) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'excel-worker.cjs'),{workerData:file,resourceLimits:{maxOldGenerationSizeMb:256}});
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('El archivo tardó demasiado en abrirse. Guarda una copia más pequeña e intenta de nuevo.')),20000);
    worker.once('message',result=>finish(result.error?Error(result.error):null,result.book));
    worker.once('error',()=>finish(Error('No se pudo abrir el archivo. Reduce su tamaño e intenta nuevamente.')));
    worker.once('exit',()=>finish(Error('No se pudo terminar de leer el archivo.')));
  });
}

function guessMapping(row) {
  const mapping=Object.fromEntries(fields.map(key=>[key,-1]));
  row.forEach((value,index)=>{
    const normalized=normalize(text(value));
    for(const key of fields) if(mapping[key]===-1 && aliases[key].includes(normalized)) {mapping[key]=index;break;}
  });
  return mapping;
}
function guessHeader(rows) {
  let best=0,score=-1;
  rows.slice(0,50).forEach((row,index)=>{
    const m=guessMapping(row),s=Object.values(m).filter(v=>v>=0).length+(m.givenNames>=0?5:0)+(m.id>=0?3:0);
    if(s>score){best=index;score=s;}
  });
  return best+1;
}
function sheetInfo(book,{sheetIndex=0,headerRow}={}) {
  if(!Number.isInteger(sheetIndex) || !book.sheets[sheetIndex]) throw Error('Selecciona una hoja válida.');
  const sheet=book.sheets[sheetIndex];
  headerRow=headerRow ?? guessHeader(sheet.rows);
  if(!Number.isInteger(headerRow)||headerRow<1||headerRow>Math.max(1,Math.min(200,sheet.rows.length))) throw Error('Selecciona una fila de encabezados entre 1 y 200 dentro de la hoja.');
  const row=sheet.rows[headerRow-1] || [];
  return {sheetIndex,headerRow,maxHeaderRow:Math.max(1,Math.min(200,sheet.rows.length)),mapping:guessMapping(row),columns:row.map((v,index)=>({index,label:`${XLSX.utils.encode_col(index)} · ${text(v).slice(0,90) || '(sin encabezado)'}`}))};
}
function convertRows(book,{sheetIndex,headerRow,mapping,autoNumber=false}) {
  const info=sheetInfo(book,{sheetIndex,headerRow}),rows=book.sheets[sheetIndex].rows;
  if(typeof autoNumber!=='boolean' || !mapping || typeof mapping!=='object') throw Error('Revisa la selección de columnas.');
  const selected=[];
  for(const key of fields) {
    const column=mapping[key];
    if(!Number.isInteger(column) || column< -1 || column>=info.columns.length) throw Error('Revisa la selección de columnas.');
    if(key==='id' && autoNumber) continue;
    if(column>=0) selected.push(column);
  }
  if(new Set(selected).size!==selected.length) throw Error('Cada columna debe corresponder a un solo dato.');
  if(mapping.givenNames<0) throw Error('Selecciona la columna del nombre o nombre completo.');
  if(!autoNumber && mapping.id<0) throw Error('Selecciona la columna del número o activa la numeración automática.');
  const people=[],errors=[],seen=new Map();let total=0,blankRows=0,errorCount=0,withoutSponsor=0;
  const report=message=>{errorCount++;if(errors.length<30)errors.push(message);};
  for(let r=headerRow;r<rows.length;r++) {
    const row=rows[r];
    if(!row.some(v=>v!=='')){blankRows++;continue;}
    total++;
    const p={id:total,givenNames:'',paternalSurname:'',maternalSurname:'',sponsor:'',notes:''};
    let invalid=false;
    for(const key of fields) {
      if(key==='id' && autoNumber)continue;
      const value=mapping[key]===-1?'':row[mapping[key]] ?? '';
      if(typeof value!=='string'){report(`Fila ${r+1}: la columna ${XLSX.utils.encode_col(mapping[key])} ${value.error}.`);invalid=true;continue;}
      if(key==='id') {
        p.id=Number(value);
        if(!/^\d+$/.test(value)||!Number.isSafeInteger(p.id)||p.id<1||p.id>999999){report(`Fila ${r+1}: el número debe ser un entero entre 1 y 999999.`);invalid=true;}
      } else {
        p[key]=value;
        if(value.length>(key==='notes'?4000:300)){report(`Fila ${r+1}: el texto de la columna ${XLSX.utils.encode_col(mapping[key])} es demasiado largo.`);invalid=true;}
      }
    }
    if(!p.givenNames){report(`Fila ${r+1}: falta el nombre del confirmando.`);invalid=true;}
    if(seen.has(p.id)){report(`Fila ${r+1}: el número ${p.id} se repite (ya aparece en la fila ${seen.get(p.id)}).`);invalid=true;}
    else if(Number.isSafeInteger(p.id)&&p.id>0)seen.set(p.id,r+1);
    if(!p.sponsor)withoutSponsor++;
    if(!invalid)people.push(p);
  }
  if(!total)report('No hay personas debajo de la fila de encabezados.');
  if(total>10000)report('La lista supera el límite de 10,000 personas.');
  return {people,total,blankRows,withoutSponsor,errors,errorCount,valid:errorCount===0};
}
class ExcelImport {
  constructor(){this.pending=null;this.loading=false;}
  async open(file){
    if(this.loading)throw Error('Espera a que termine de abrirse el archivo.');
    this.loading=true;this.pending=null;
    try{
      const book=await loadWorkbook(file),token=randomUUID(),fileName=path.basename(file);
      this.pending={book,token,fileName};
      const sheetIndex=Math.max(0,book.sheets.findIndex(s=>s.rows.some(r=>r.some(c=>c!==''))));
      return {token,fileName,sheets:book.sheets.map(s=>s.name),...sheetInfo(book,{sheetIndex})};
    }finally{this.loading=false;}
  }
  require(token){if(!this.pending || this.pending.token!==token)throw Error('Selecciona nuevamente el archivo de Excel.');return this.pending;}
  info(args){return sheetInfo(this.require(args.token).book,args);}
  preview(args){const result=convertRows(this.require(args.token).book,args);return {...result,people:result.people.slice(0,8)};}
  commit(args,store){
    const {book,fileName}=this.require(args.token),result=convertRows(book,args);
    if(!result.valid)throw Error(result.errors[0]);
    const list=store.importList({date:args.date,title:args.title,source:`Excel: ${fileName} · ${book.sheets[args.sheetIndex].name}`,people:result.people});
    this.pending=null;return {date:list.date,total:list.people.length};
  }
  discard(token){if(this.pending?.token===token)this.pending=null;}
}
module.exports={ExcelImport,readWorkbook,loadWorkbook,sheetInfo,guessHeader,guessMapping,convertRows};
