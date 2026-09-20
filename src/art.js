'use strict';
// ── 美术资源清单 ──────────────────────────────────────────────
// 规则：这里预先登记所有计划中的图片文件名。文件还没出的时候，
// <img> 会 onerror 静默移除并给容器打上 .no-art，退回纯 CSS 表现。
// 所以「丢一张图进 assets 就多一处变好看」，不需要改任何代码。
// 加立绘：把 portraitCount 里对应岗位的数字 +1，文件按 <role>-03.webp 命名。
const ART={
  scenePath:'assets/scene/',
  portraitPath:'assets/portrait/',
  // 场景图 1280×720 webp
  scenes:['office-lv1','office-lv2','office-lv3','phase-intake','phase-evidence','phase-argue','phase-close',
          'leads-market','signing','court','hallway','award','meeting','rivals','ending-rise','ending-fall'],
  // 事件氛围图 960×540 webp，事件用 mood 字段取图
  moods:['rain','hospital','press','night','sign','celebrate','empty','mediation'],
  // 立绘 512×640 webp，每个岗位当前可用张数
  // 现有 14 张为《开个影视公司》复用图，出了新图同名覆盖即可
  portraitCount:{partner:2,litigator:2,corporate:2,associate:2,paralegal:2,bd:1,star:3}
};
const PHASE_SCENES=['phase-intake','phase-evidence','phase-argue','phase-close'];
function artMiss(img){const box=img.parentNode;if(box)box.classList.add('no-art');img.remove()}
function sceneImg(id,cls=''){return id?`<img class="scene-img ${cls}" src="${ART.scenePath}${id}.webp" alt="" loading="lazy" decoding="async" onerror="artMiss(this)">`:''}
function moodImg(mood){return mood&&ART.moods.includes(mood)?`<div class="scene-band plain">${sceneImg('mood-'+mood)}</div>`:''}
function sceneBanner(id,title,sub){return `<div class="scene-band">${sceneImg(id)}<div class="scene-text"><b>${title}</b>${sub?`<small>${sub}</small>`:''}</div></div>`}
// 领脸：一局之内同一个人永远同一张。存档里存 face 字段。
function pickFace(role,star){
  const key=star?'star':role,n=ART.portraitCount[key]||0;if(!n)return null;
  const all=[];for(let i=1;i<=n;i++)all.push(`${key}-${String(i).padStart(2,'0')}`);
  let used=[];try{used=((typeof S!=='undefined'&&S&&S.staff)||[]).map(e=>e.face)}catch(e){}
  const free=all.filter(f=>!used.includes(f));const pool=free.length?free:all;
  return pool[Math.floor(Math.random()*pool.length)];
}
function portraitBox(e){return e&&e.face?`<div class="portrait">${faceImg(e)}</div>`:''}
function faceImg(e){return e&&e.face?`<img src="${ART.portraitPath}${e.face}.webp" alt="" loading="lazy" decoding="async" onerror="artMiss(this)">`:''}
// 头像：底下永远垫着色块 + 姓氏首字，图加载失败就露出来
function avatarHtml(e,cls=''){return `<div class="avatar ${cls}" style="--avatar:${roleColors[e.role]};${e.star?'box-shadow:0 0 0 2px var(--brass)':''}" aria-hidden="true">${e.star?'★':roles[e.role][0][0]}${faceImg(e)}</div>`}
function officeScene(){return 'office-lv'+(clamp(S.office,0,2)+1)}
function workScene(){const c=S.active.find(x=>!x.ready)||S.active[0];return c&&!c.ready?PHASE_SCENES[clamp(c.phase,0,3)]:officeScene()}
