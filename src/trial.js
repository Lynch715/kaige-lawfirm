'use strict';
// ══ 庭审小对抗 ══════════════════════════════════════════════
// 只有大案和长期项目、走诉讼路径的才打，一个案子一局。
// 3~5 回合出牌，法官心证 0~100 起手 50，打完给结案评级一个修正。
// 和《心证》那种逐句盘问明确分开：这里是资源出牌，五分钟内结束，随时能跳过。

// 牌库。power 取自案件的哪一维：fact 事实 / law 法理 / deal 博弈
const CARDS=[
  {id:'doc',     kind:'ev',  from:'fact', name:'书证',     line:'白纸黑字，落款和公章都在。'},
  {id:'witness', kind:'ev',  from:'fact', name:'证人证言', line:'人就在庭下坐着，问什么答什么。'},
  {id:'expert',  kind:'ev',  from:'fact', name:'鉴定意见', line:'机构出的报告，厚厚一本。'},
  {id:'digital', kind:'ev',  from:'fact', name:'电子数据', line:'服务器日志，时间戳精确到秒。'},
  {id:'statute', kind:'law', from:'law',  name:'法条适用', line:'条文摆在这儿，怎么绕都绕不开。'},
  {id:'cases',   kind:'law', from:'law',  name:'类案检索', line:'同类判决二十七件，口径是一致的。'},
  {id:'procedure',kind:'law',from:'law',  name:'程序异议', line:'先不谈实体，这个程序本身就有问题。'},
  {id:'mediate', kind:'plan',from:'deal', name:'庭前调解', line:'各让一步，今天就能结。'},
  {id:'concede', kind:'plan',from:'deal', name:'让步换条件',line:'这一条我们认，但那一条得依我们。'}
];
// 克制关系，成环。出牌前得想想对方手里可能是什么。
const BEATS={
  procedure:'witness',   // 程序上站不住，人证说得再好也白搭
  witness:'statute',     // 活人的话比条文更打动合议庭
  statute:'digital',     // 电子数据的证据效力有法条门槛
  digital:'doc',         // 日志比纸面更难抵赖
  doc:'expert',          // 原始书证比二手鉴定硬
  expert:'cases',        // 专业结论压过类案类比
  cases:'procedure'      // 类案说明这个程序没问题
};
const cardById=id=>CARDS.find(c=>c.id===id);

function trialEligible(c){
  return c&&DEPTS[c.dept].court&&c.scale!=='small'&&!c.trialDone;
}
// 这张牌在这个案子里有多硬
function cardPower(c,card){
  const base=(c.quality[card.from]||0)/5;          // 四维满 100 → 20
  return Math.max(2,base*rnd(.82,1.18));
}
// 对方的水平：案子越大、排期越挤、对家越强，越难打
function oppPower(c){
  const scale=c.scale==='mega'?1.25:1;
  const crowd=1+(c.hearing?c.hearing.crowd*.15:0);
  const clash=c.clash?1.1:1;
  return (10.5+S.week/120)*scale*crowd*clash*rnd(.75,1.25);
}

function drawHand(c,n){
  const pool=CARDS.slice();
  const hand=[];
  while(hand.length<n&&pool.length){
    const i=Math.floor(Math.random()*pool.length);
    hand.push(pool.splice(i,1)[0].id);
  }
  return hand;
}

function startTrial(caseId){
  const c=S.active.find(x=>x.id===caseId);
  if(!c||!trialEligible(c))return;
  const team=teamOf(c);
  const size=4+(S.facilities.court?1:0);           // 模拟法庭室：起手多一张
  const star=team.some(e=>e.star);                  // 组里有名律师：可以重抽一次
  S.trial={caseId,round:1,rounds:c.scale==='mega'?5:4,conviction:50,
    hand:drawHand(c,size),size,redraw:star?1:0,log:[],last:null,done:false};
  pauseForModal();
  renderTrial();
  openDialog('trialDialog');
}

function convictionLabel(v){
  return v>=70?'明显占优':v>=58?'略占上风':v>=43?'势均力敌':v>=30?'处于下风':'很不利';
}

function renderTrial(){
  const t=S.trial;if(!t)return;
  const c=S.active.find(x=>x.id===t.caseId);if(!c)return;
  const pct=clamp(t.conviction,0,100);
  const tone=pct>=70?'risk-ok':pct>=43?'risk-mid':'risk-hot';
  byId('trialHead').textContent=`开庭 · ${c.name}`;
  byId('trialBody').innerHTML=
    `<div class="scene-band">${sceneImg('court')}<div class="scene-text">
       <b>法官心证 ${Math.round(pct)}</b><small>${convictionLabel(pct)}　第 ${Math.min(t.round,t.rounds)} / ${t.rounds} 回合</small></div></div>
     <div class="riskbar ${tone}" style="height:12px"><i style="width:${pct}%"></i></div>
     <p class="subtle" style="margin:6px 0 2px">心证 50 起步。打完看落在哪一档，结案评级跟着加减。</p>
     ${t.log.length?`<div class="trial-log">${t.log.slice(-3).map(l=>`<div>${l}</div>`).join('')}</div>`:''}
     ${t.done?'':`<h3 style="margin:14px 0 8px">该你出牌</h3>
     <div class="trial-hand">${t.hand.map(id=>{
        const card=cardById(id),p=cardPower(c,card);
        return `<button class="trial-card" onclick="playCard('${id}')">
          <b>${card.name}</b><span class="tag">${card.kind==='ev'?'证据':card.kind==='law'?'论证':'策略'} · 强度 ${Math.round(p)}</span>
          <small>${card.line}</small>
          <small class="subtle">${BEATS[id]?'克制：'+cardById(BEATS[id]).name:'不比强度，另有打法'}</small></button>`}).join('')}</div>
     ${t.redraw?`<div class="card-actions"><button onclick="redrawHand()">换一手牌（还剩 ${t.redraw} 次）</button></div>`:''}`}`;
  byId('trialSkip').classList.toggle('hidden',t.done);
  byId('trialClose').classList.toggle('hidden',!t.done);
}

function redrawHand(){
  const t=S.trial;if(!t||!t.redraw)return;
  const c=S.active.find(x=>x.id===t.caseId);if(!c)return;
  t.redraw--;t.hand=drawHand(c,t.size);
  t.log.push('庭上短暂休庭，重新理了一遍思路。');
  renderTrial();
}

function playCard(id){
  const t=S.trial;if(!t||t.done)return;
  const c=S.active.find(x=>x.id===t.caseId);if(!c)return;
  const mine=cardById(id);
  const theirs=cardById(pick(CARDS).id);
  let mp=cardPower(c,mine),op=oppPower(c);

  // 策略牌不比强度，另走一套
  if(mine.id==='mediate'){
    t.conviction=Math.max(t.conviction,58);
    t.log.push(`你提出庭前调解。法官点了头，双方各退一步——这案子今天就能结，但也赢不出花来。`);
    t.done=true;finishTrial(c,'调解');return;
  }
  if(mine.id==='concede'){
    t.conviction=clamp(t.conviction+6,0,100);
    t.oppBoost=1.3;
    t.log.push(`你主动认下一条，换对方在另一条上让步。气氛缓了，但对方下一轮会更凶。`);
  }else{
    if(t.oppBoost){op*=t.oppBoost;t.oppBoost=0}
    const iBeat=BEATS[mine.id]===theirs.id;
    const theyBeat=BEATS[theirs.id]===mine.id;
    if(iBeat)mp*=1.45;
    if(theyBeat)mp*=.66;
    const move=clamp((mp-op)*.95,-18,18);
    t.conviction=clamp(t.conviction+move,0,100);
    t.log.push(`你出【${mine.name}】，对方应以【${theirs.name}】。`+
      (iBeat?`正好打在对方的软处，`:theyBeat?`被对方按住了，`:``)+
      `心证${move>=0?'涨':'掉'}了 ${Math.abs(Math.round(move))}。`);
  }
  t.last=mine.id;
  t.hand=t.hand.filter(x=>x!==mine.id);
  if(t.hand.length<2)t.hand=drawHand(c,t.size);
  t.round++;
  if(t.round>t.rounds){t.done=true;finishTrial(c,'宣判')}
  renderTrial();
}

// 一键交给出庭律师：按四维取中位结果，不用打
function skipTrial(){
  const t=S.trial;if(!t||t.done)return;
  const c=S.active.find(x=>x.id===t.caseId);if(!c)return;
  const q=c.quality;
  t.conviction=clamp(38+(q.fact+q.law+q.deal)/3*.42,28,74);
  t.log.push('这一庭交给出庭律师按常规打。没有惊喜，也没有意外。');
  t.done=true;finishTrial(c,'常规');
  renderTrial();
}

// 心证落在哪一档，就给结案评级多少修正
const TRIAL_TIERS=[[70,1.2,'庭上占尽上风'],[50,.5,'庭上略占上风'],[30,0,'庭上打了个平手'],[0,-1,'庭上很被动']];
function finishTrial(c,how){
  const row=TRIAL_TIERS.find(r=>S.trial.conviction>=r[0]);
  c.trialDone=true;c.trialBonus=row[1];c.trialNote=row[2];
  S.trial.result=row[2];
  const sign=row[1]>0?'+':'';
  S.trial.log.push(`${how}。${row[2]}，结案评级 ${sign}${row[1].toFixed(1)}。`);
  addNews('开庭',`《${c.name}》开庭，${row[2]}。`);
  chron(`《${c.name}》开庭，${row[2]}。`);
}

function closeTrial(){
  S.trial=null;closeDialog('trialDialog');resumeAfterModal();render();save();
}
