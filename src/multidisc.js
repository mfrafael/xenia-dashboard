'use strict';
const path=require('node:path');
function discInfo(romPath){
  const file=path.basename(romPath,path.extname(romPath)),folder=path.dirname(romPath);
  const marker=/\b(?:disc|disk|cd)[\s-]*0*(\d{1,2})(?:\s+of\s+\d{1,2})?\b/i;
  let stem=file.replace(/[_.]/g,' '),directory=folder,match=marker.exec(stem);
  if(!match && path.extname(romPath).toLowerCase()==='.xex'){
    stem=path.basename(folder).replace(/[_.]/g,' ');match=marker.exec(stem);directory=path.dirname(folder);
    if(match && !stem.replace(marker,'').replace(/[()[\]\s-]/g,'')){stem=path.basename(directory)+' '+stem;directory=path.dirname(directory);match=marker.exec(stem);}
  }
  if(!match||Number(match[1])<1)return null;
  const base=stem.replace(marker,'').replace(/\(\s*\)|\[\s*\]/g,'').replace(/\s+/g,' ').trim().replace(/[-\s]+$/,'');
  if(!base)return null;
  const title=base.replace(/\[[^\]]*\]|\([^)]*\)/g,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\s+/g,' ').trim();
  return {number:Number(match[1]),title,key:`${directory}\0${base.toLowerCase()}\0${path.extname(romPath).toLowerCase()}`};
}
function groupGames(games){
  const buckets=new Map(),result=[];
  for(const game of games){const disc=discInfo(game.rom_path);if(!disc){result.push(game);continue;}const list=buckets.get(disc.key)||[];list.push({game,disc});buckets.set(disc.key,list);}
  for(const list of buckets.values()){
    if(list.length<2||new Set(list.map(item=>item.disc.number)).size!==list.length){result.push(...list.map(item=>item.game));continue;}
    list.sort((a,b)=>a.disc.number-b.disc.number);
    result.push({...list[0].game,title:list[0].game.named?list[0].game.title:list[0].disc.title,discs:list.map(({game,disc})=>({...game,disc_number:disc.number}))});
  }
  return result.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
module.exports={discInfo,groupGames};
