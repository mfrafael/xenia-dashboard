'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');const {groupGames,discInfo}=require('../src/multidisc');
const game=(name,id)=>({id,title:'Blue Dragon',rom_path:path.join('games',name),cover_art_path:null,uses_fallback_art:true});
test('disc grouping collapses explicit discs in numeric order and keeps IDs/caches and editions distinct',()=>{
 const one=game('Blue Dragon (USA, Europe) (Disc 1).iso','one'),two={...game('Blue Dragon (USA, Europe) (Disc 2).iso','two'),cover_art_path:'cached-two.jpg',uses_fallback_art:false};
 const grouped=groupGames([two,one]);assert.equal(grouped.length,1);assert.equal(grouped[0].title,'Blue Dragon');assert.equal(grouped[0].id,'one');assert.deepEqual(grouped[0].discs.map(d=>d.id),['one','two']);assert.equal(grouped[0].discs[1].cover_art_path,'cached-two.jpg');
 assert.equal(groupGames([one,game('Blue Dragon (Japan) (Disc 2).iso','jp')]).length,2);
 assert.equal(groupGames([one,{...one,id:'duplicate'},two]).length,3);
 assert.equal(groupGames([game('Blue Dragon 2.iso','sequel'),game('Blue Dragon.iso','base')]).length,2);
 assert.equal(discInfo(path.join('games','Blue_Dragon_Disk_03.iso')).number,3);
 assert.equal(discInfo(path.join('games','Blue Dragon','Disc 2','default.xex')).title,'Blue Dragon');
});

test('a group takes the name a cover source gave its first disc, not the one cut from the file names',()=>{
 const game=(file,id,extra={})=>({id,title:'x',rom_path:path.join('/g',file),...extra});
 const grouped=groupGames([game('Naruto The Broken Bond (Disc 2).iso','b',{title:'Naruto: The Broken Bond',named:true}),game('Naruto The Broken Bond (Disc 1).iso','a',{title:'Naruto: The Broken Bond',named:true})]);
 assert.equal(grouped.length,1);assert.equal(grouped[0].title,'Naruto: The Broken Bond');
});
