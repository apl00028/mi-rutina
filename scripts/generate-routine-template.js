"use strict";

const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const XLSX=require(path.join(root,"vendor","xlsx.full.min.js"));
require(path.join(root,"built-in-exercise-catalog.js"));
require(path.join(root,"exercise-domain.js"));
require(path.join(root,"routine-excel.js"));

function buildWorkbook(){
  const model=globalThis.GymOSRoutineExcel.templateModel();
  const workbook=XLSX.utils.book_new();
  model.sheets.forEach(source=>{
    const sheet=XLSX.utils.aoa_to_sheet(source.rows);
    const width=Math.max(1,...source.rows.map(row=>row.length));
    sheet["!cols"]=Array.from({length:width},(_,index)=>({
      wch:source.columnWidths?.[index]||(index===2?30:18),
      hidden:(source.hiddenColumns||[]).includes(index)
    }));
    if(sheet["!ref"]) sheet["!autofilter"]={ref:sheet["!ref"]};
    XLSX.utils.book_append_sheet(workbook,sheet,source.name);
  });
  workbook.Workbook={
    Sheets:model.sheets.map(source=>({
      name:source.name,Hidden:source.veryHidden?2:source.hidden?1:0
    }))
  };
  return workbook;
}

function templateBuffer(){
  return Buffer.from(XLSX.write(buildWorkbook(),{
    type:"buffer",bookType:"xlsx",compression:true
  }));
}

if(require.main===module){
  fs.writeFileSync(path.join(root,"plantilla-rutina-gymos.xlsx"),templateBuffer());
}

module.exports={buildWorkbook,templateBuffer};
