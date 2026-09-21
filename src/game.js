'use strict';
// ══ 《开个律所》逻辑与渲染 ══════════════════════════════════
// 三条线：创收(money) / 声誉(fame·prestige·buzz) / 执业红线(risk)

let S=null,timer=null,curEvent=null,curCase=null,resumeSpeed=0;

// ── 小工具 ──────────────────────────────────────────────────
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rnd=(a,b)=>a+Math.random()*(b-a);
const ri=(a,b)=>Math.floor(rnd(a,b+1));
const money=n=>{const v=Math.round(n);return (v<0?'-¥':'¥')+Math.abs(v).toLocaleString('en-US')};
const wan=n=>n>=10000?(n/10000).toFixed(n>=1000000?0:1).replace(/\.0$/,'')+' 万':Math.round(n)+'';
const esc=s=>String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const byId=id=>document.getElementById(id);
const teamOf=c=>c.team.map(id=>S.staff.find(e=>e.id===id)).filter(Boolean);
const free=e=>!S.active.some(c=>c.team.includes(e.id))&&!S.retainers.some(r=>r.keeper===e.id);
function toast(msg,host){const t=byId('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2600)}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

// 时间
const yearOf=w=>2026+Math.floor(w/52);
const monthOf=w=>clamp(Math.floor((w%52)/4.334)+1,1,12);
const dateText=w=>`${yearOf(w)} 年 ${monthOf(w)} 月`;

// ── 造人 ────────────────────────────────────────────────────
function freshName(){const used=new Set([...(S?S.staff:[]).map(e=>e.name),...(S?S.candidates||[]:[]).map(e=>e.name)]);
  const pool=names.filter(n=>!used.has(n));return pool.length?pick(pool):pick(names)+pick(['律师','']);}
function person(role,lv){
  const base=6+lv*3.2,e={id:(S?S.nextId++:Math.random()),name:freshName(),role,level:clamp(Math.round(lv),1,5),
    trait:pick(traits),energy:ri(72,96),star:false,face:null,salary:0,weeks:0};
  e.stats={};STATS.forEach(([k])=>{e.stats[k]=clamp(Math.round(base*rnd(.55,.95)),3,26)});
  e.stats[roles[role][1]]=clamp(Math.round(base*rnd(1.0,1.35)),5,30);
  e.salary=Math.round((2200+e.level*2600+e.stats[roles[role][1]]*340)/100)*100;
  e.face=pickFace(role,false);
  return e;
}
function makeStar(role){
  const e=person(role,ri(4,5));e.star=true;e.trait=pick(Object.keys(starTraits));
  STATS.forEach(([k])=>{e.stats[k]=clamp(Math.round(e.stats[k]*1.35),8,34)});
  e.salary=Math.round(e.salary*2.6/100)*100;e.face=pickFace(role,true);e.name=pick(names);
  return e;
}
function chemKey(a,b){return [a,b].sort().join('-')}
function teamChemistry(team){let n=0;for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++)n+=S.chemistry[chemKey(team[i].id,team[j].id)]||0;
  return clamp(n*.035,0,.3)}

// ── 造案源 ──────────────────────────────────────────────────
function partyName(){return pick(PARTY_A)+pick(PARTY_SUF)}
function personName(){return pick(SURNAMES)+'某'}
function makeLead(forceScale,forceType){
  const tier=S.prestige+S.fame*1.5;
  let pool=CASE_TYPES.filter(x=>{
    if(S.flags.smallOnly&&!x.scales.includes('small'))return false;
    if(x.scales.includes('mega')&&tier<14&&!x.scales.includes('major'))return false;
    return true;
  });
  // 顾问类业务在真实律所里占比不低，给它们额外权重，别一局碰不到几次
  pool=pool.concat(pool.filter(x=>x.id==='counsel'||x.id==='compli'));
  if(!pool.length)pool=CASE_TYPES.filter(x=>x.scales.includes('small'));
  if(!pool.length)pool=CASE_TYPES;
  const t=(forceType&&typeById(forceType))||pick(pool);
  let scales=t.scales.slice();
  if(S.flags.smallOnly)scales=scales.filter(s=>s==='small');
  if(tier<8)scales=scales.filter(s=>s!=='mega');
  if(!scales.length)scales=[t.scales[0]];
  const scale=forceScale&&scales.includes(forceScale)?forceScale:pick(scales);
  const crim=t.dept==='crim'&&t.id!=='family';
  const A=crim||t.id==='family'?personName():partyName();
  const B=t.dept==='corp'?partyName():(crim?'公诉机关':partyName());
  const ctype=pick(Object.keys(clientDefs).filter(k=>clientDefs[k].likes.includes(t.name)))||'sme';
  const sd=scaleDefs[scale];
  const hot=Math.random()<.13&&tier>6;
  const fee=Math.round(sd.base*t.mult*rnd(.85,1.2)*Math.min(1.8,1+S.prestige*.02)*(hot?1.5:1)/1000)*1000;
  return {id:S.nextId++,type:t.id,dept:t.dept,scale,title:t.dept==='corp'?`${A} · ${t.name}`:`${A} 诉 ${B}`,
    name:`${A.slice(0,2)}·${t.name}`,brief:pick(BRIEFS[t.id]||['当事人把材料摊了一桌子，说这事得从三年前讲起。']),
    clientName:A,clientType:ctype,fee,hot,born:S.week,expire:S.week+(hot?3:7)};
}
function refreshLeads(){
  S.leads=S.leads.filter(l=>l.expire>S.week);
  const want=clamp(3+Math.floor((S.fame+S.prestige)/6),3,6);
  // 老客户优先：关系处到位了，人家会带着新委托回来
  if(S.leads.length<want){const r=repeatLead();if(r)S.leads.push(r)}
  while(S.leads.length<want)S.leads.push(makeLead());
}
// 关系 ≥3 的老客户会主动回来。收费上浮，案型挑他这类客户常打的官司，而且愿意多等几周。
function repeatLead(){
  const pool=S.clients.filter(cl=>cl.rel>=3&&S.week-cl.last>=8&&!S.leads.some(l=>l.repeat===cl.id));
  if(!pool.length||Math.random()>.55)return null;
  const cl=pick(pool);
  const liked=CASE_TYPES.filter(t=>clientDefs[cl.type].likes.includes(t.name));
  const l=makeLead(null,liked.length?pick(liked).id:null);
  l.clientName=cl.name;l.clientType=cl.type;l.repeat=cl.id;
  l.fee=Math.round(l.fee*(1+cl.rel*.07)/1000)*1000;
  l.expire=S.week+12;
  l.title=`${cl.name} · ${typeById(l.type).name}（再次委托）`;
  l.name=cl.name.slice(0,2)+'·'+typeById(l.type).name;
  return l;
}
// 系列案：同一批当事人的批量诉讼，案情几乎一样，周期短、单价低，一次办完比一个一个办省事
function seriesLead(from){
  const t=typeById(from.type);
  const l=makeLead('small',t.id);
  l.series=true;l.clientName=from.clientName;l.clientType=from.clientType;
  l.name=from.name.split('·')[0]+'·'+t.name+'系列';
  l.title=`${from.clientName}等 ${ri(6,20)} 人 · ${t.name}`;
  l.brief=`和《${from.name}》同一批当事人，案情几乎一模一样，只是人换了。一次办完比一个一个办省事。`;
  l.fee=Math.round(from.fee*.55/1000)*1000;
  l.weeksMul=.62;l.expire=S.week+6;
  return l;
}

// ── 对手与风向 ──────────────────────────────────────────────
function makeRivals(){return RIVAL_DEFS.map(([name,desc,p,bent])=>({name,desc,power:p,bent,wins:0}))}
function processTrend(){if(S.week%26===0){S.trend=pick(trends);addNews('市场风向',`${S.trend[0]}：${S.trend[1]}`)}}
// 这家所看上哪个案子。分数越高越想要，0 分表示不碰。
function rivalWants(r,l){
  const t=typeById(l.type),big=l.scale==='mega'?3:l.scale==='major'?2:1;
  switch(r.bent){
    case 'lit':   return t.dept==='lit'||t.dept==='crim'?big+2:0;
    case 'cheap': return l.scale==='small'?3:l.scale==='major'?1:0;
    case 'corp':  return t.dept==='corp'?big+2:0;
    case 'gov':   return l.clientType==='gov'?4:l.clientType==='listed'?2:0;
    case 'picky': return big>=2&&l.fee>=scaleDefs[l.scale].base*1.2?big+1:0;
    default:      return big;
  }
}
function processRivals(){
  // 每 4 周抢一次案源：各家按自己的路子挑，不是随机拿走一个
  if(S.week%4===0&&S.leads.length>2){
    const r=pick(S.rivals);
    const want=S.leads.map(l=>({l,v:rivalWants(r,l)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
    // 名气比对手大的时候，案源不容易被抢走
    const hold=clamp((S.prestige+S.fame)/(r.power*3),0,.75);
    if(want.length&&Math.random()>hold){
      const l=want[0].l;S.leads=S.leads.filter(x=>x.id!==l.id);
      r.wins++;addNews('同行动态',`${r.name}签下了「${l.name}」。`);
    }
  }
  // 每 8 周物色一个薪水明显低于行情的人，先接触，八周后才动手——留出加薪的窗口
  if(S.week%8===0)maybePoach();
  if(S.week%12)return;
  S.rivals.forEach(r=>{r.power=clamp(r.power+rnd(-.2,.9)+(S.prestige>30?.3:0),3,42)});
}
// 行情价：person() 里怎么定薪的，这里就怎么算
function marketSalary(e){return Math.round((2200+e.level*2600+e.stats[roles[e.role][1]]*340)/100)*100}
function underpaid(e){return e.salary<marketSalary(e)*.85}
function maybePoach(){
  // 上一轮接触过的人，现在见分晓
  if(S.poach){
    const e=S.staff.find(x=>x.id===S.poach.id);
    if(e&&underpaid(e)&&free(e)&&Math.random()<.6){
      S.staff=S.staff.filter(x=>x.id!==e.id);
      addNews('团队',`${e.name}去了${S.poach.by}。薪水的事，之前提过。`);
      chron(`${e.name}被${S.poach.by}挖走。`);
      addBuzz(-3);
      const cl=S.clients.filter(c=>c.rel>=3);
      if(cl.length&&Math.random()<.5){const c=pick(cl);c.rel=clamp(c.rel-2,0,5);
        addNews('客户',`${c.name}那边跟${e.name}比较熟，这两天联系少了。`)}
    }else if(e)addNews('团队',`${e.name}把${S.poach.by}的邀约推了。`);
    S.poach=null;return;
  }
  const targets=S.staff.filter(e=>underpaid(e));
  if(!targets.length||Math.random()<.45)return;
  const e=pick(targets),r=pick(S.rivals);
  S.poach={id:e.id,by:r.name,at:S.week};
  addNews('团队',`听说${r.name}在接触${e.name}。他现在的薪水确实低于行情。`);
}
// 对手的大案排期是能提前打听到的——同一个窗口撞上，媒体关注会被分走
function rivalSlate(){
  const era=Math.floor(S.week/4);
  if(!S.slate||S.slate.at!==era){
    S.slate={at:era,items:[]};
    S.rivals.forEach(r=>{
      if(r.power>6&&Math.random()<.3)S.slate.items.push({w:S.week+ri(1,6)*4,name:r.name});
    });
  }
  return S.slate.items;
}
function industryRank(){
  const me={name:S.firm,power:S.prestige*.5+S.fame*.4+S.cases.filter(c=>c.score>=6).length*.3,me:true};
  return [...S.rivals.map(r=>({name:r.name,power:r.power})),me].sort((a,b)=>b.power-a.power);
}
function clientTotal(){return Object.values(S.clientAssets).reduce((a,b)=>a+b,0)}

// ── 口碑 / 红线 ─────────────────────────────────────────────
function buzzLabel(v){return v>=80?'口碑极好':v>=62?'风评不错':v>=42?'中规中矩':v>=25?'有点争议':'风评很差'}
function addBuzz(n){S.buzz=clamp(S.buzz+n,0,100);S.buzzLog.push(Math.round(S.buzz));if(S.buzzLog.length>60)S.buzzLog.shift()}
function riskTier(){return RISK_TIERS.find(t=>S.risk>=t[0])}
function addRisk(n,why){
  if(n>0&&S.facilities.risk)n*=.65;
  const before=S.risk;S.risk=clamp(S.risk+n,0,100);
  S.flags.riskPeak=Math.max(S.flags.riskPeak||0,S.risk);
  if(n>0&&why)addNews('执业风险',`${why}（执业红线 ${Math.round(before)} → ${Math.round(S.risk)}）`);
  RISK_TIERS.forEach(t=>{if(t[0]>0&&before<t[0]&&S.risk>=t[0])addNews('司法局',`律所执业风险进入「${t[1]}」区间。${t[2]}。`)});
  if(S.risk>=100&&!S.over)showEnding('revoked');
}
function processRisk(){
  if(S.week%RISK_DECAY_WEEKS===0&&S.week>0&&S.risk>0){
    S.risk=clamp(S.risk-RISK_DECAY,0,100);
  }
  // 口碑每季度向中位回归一点，热度是会退的
  if(S.week%13===0&&S.week>0)addBuzz((50-S.buzz)*.08);
  if(S.risk>=85&&!S.suspendUntil&&Math.random()<.18){
    S.suspendUntil=S.week+ri(4,8);
    addNews('司法局',`因执业风险持续过高，律所被责令停业整顿至 ${dateText(S.suspendUntil)}。`);
    chron(`被责令停业整顿 ${S.suspendUntil-S.week} 周`);
    addBuzz(-14);setSpeed(0);
  }
}

// ── 消息与编年史 ────────────────────────────────────────────
function addNews(tag,text){S.news.unshift({tag,text,w:S.week});if(S.news.length>70)S.news.pop()}
function chron(text){S.chron.push(`${dateText(S.week)}　${text}`)}

// ── 存档 ────────────────────────────────────────────────────
function save(){try{localStorage.setItem(KEY,JSON.stringify({v:VERSION,S}))}catch(e){}}
function hasSave(){try{return !!localStorage.getItem(KEY)}catch(e){return false}}
function manualSave(){save();toast('进度已保存')}
function deleteSave(){if(!confirm('删除存档？这一局就没了。'))return;try{localStorage.removeItem(KEY)}catch(e){}location.reload()}
function normalize(s){
  const d={firm:'明诚律师事务所',origin:'spinoff',week:0,money:3000000,fame:1,prestige:2,buzz:50,risk:0,
    office:0,facilities:{},staff:[],active:[],cases:[],clients:[],retainers:[],leads:[],candidates:[],
    clientAssets:{sme:0,listed:0,hnwi:0,gov:0,indiv:0},chemistry:{},rivals:[],trend:null,news:[],chron:[],evtSeen:{},
    goals:{},ach:{},flags:{},buzzLog:[],pending:[],evtCd:{},nextId:1,speed:0,page:'home',loan:null,
    suspendUntil:0,over:false,poach:null,slate:null,afterCase:null};
  for(const k in d)if(s[k]===undefined)s[k]=Array.isArray(d[k])?d[k].slice():(d[k]&&typeof d[k]==='object'?Object.assign({},d[k]):d[k]);
  if(!s.rivals.length)s.rivals=makeRivals();
  if(!s.trend)s.trend=trends[0];
  s.active.forEach(c=>{if(!c.quality)c.quality={fact:0,law:0,deal:0,work:0};if(c.polish===undefined)c.polish=0});
  s.retainers.forEach(r=>{if(r.until===undefined)r.until=(r.since||0)+104});
  return s;
}
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY));if(!raw||!raw.S)return null;return normalize(raw.S)}catch(e){return null}}

// ── 开局 ────────────────────────────────────────────────────
function openOrigins(){
  closeDialog('endingDialog');
  byId('originBody').innerHTML=Object.entries(ORIGINS).map(([k,o])=>
    `<button class="choice" onclick="newGame('${k}')"><b>${o.name}</b> <span class="tag">${o.tag}</span><small>${o.line}</small>
     <small class="subtle">启动资金 ${money(o.money)} · 行业声望 ${o.prestige} · 社会知名度 ${o.fame}</small></button>`).join('');
  openDialog('originDialog');
}
function newGame(key){
  const o=ORIGINS[key];
  S=normalize({firm:pick(['明诚','衡正、','守心','弘一','北斗','清律','允中','嘉法']).replace('、','')+'律师事务所',
    origin:key,money:o.money,fame:o.fame,prestige:o.prestige});
  S.trend=pick(trends);
  S.flags.smallOnly=o.smallOnly||0;
  S.flags.noListed=o.noListed||0;
  if(o.levy){S.flags.levy=o.levy;S.flags.deadline=o.deadline}
  // 初始班底
  const seed=o.small?['partner','litigator','paralegal']:['partner','litigator','corporate','associate','paralegal'];
  seed.forEach((r,i)=>S.staff.push(person(r,o.small?ri(1,2):(i===0?3:ri(2,3)))));
  if(key==='spinoff'){
    const senior=person('litigator',4);senior.name=freshName();S.staff.push(senior);
    const c={id:S.nextId++,name:partyName(),type:'sme',rel:3,entries:1,last:0};
    S.clients.push(c);addNews('开所',`${c.name}跟着你从原所出来，成了第一个客户。`);
  }
  refreshLeads();
  chron(`${S.firm}成立。${o.name}。`);
  addNews('开所',`${S.firm}正式挂牌。${o.line}`);
  closeDialog('originDialog');showGame();save();
}
function continueGame(){const s=load();if(!s){toast('没有找到存档');return}S=s;showGame()}
function showGame(){
  byId('start').classList.add('hidden');byId('app').classList.remove('hidden');
  showPage(S.page||'home');setSpeed(0);render();
}

// ── 时间推进 ────────────────────────────────────────────────
function setSpeed(n){
  S.speed=n;clearInterval(timer);timer=null;
  if(n>0)timer=setInterval(tickWeek,10000/n);
  document.querySelectorAll('.speed [data-speed]').forEach(b=>b.classList.toggle('active',+b.dataset.speed===n));
}
function stepWeek(){setSpeed(0);tickWeek()}
function pauseForModal(){resumeSpeed=S.speed;setSpeed(0)}
function resumeAfterModal(){if(resumeSpeed)setSpeed(resumeSpeed);resumeSpeed=0}
function openDialog(id){const d=byId(id);if(d&&!d.open)d.showModal()}
function closeDialog(id){const d=byId(id);if(d&&d.open)d.close()}

function tickWeek(){
  if(S.over)return;
  S.week++;
  if(S.suspendUntil&&S.week>=S.suspendUntil){S.suspendUntil=0;addNews('司法局','停业整顿期满，律所恢复执业。')}
  monthlyCosts();dailyWork();
  if(!S.suspendUntil){processCases();processEvents()}
  processStaff();processPending();processRisk();processTrend();processRivals();
  if(S.week%4===0)refreshLeads();
  if(S.week%4===0)payRetainers();
  processRetainers();
  checkAwards();checkGoals();checkAchievements();financialRisk();
  if(S.week>=520&&!S.flags.decade){S.flags.decade=1;showEnding(null)}
  render();if(S.week%4===0)save();
}
// 房租会被事件涨上去，统一从一处算
function rentNow(){return Math.round(OFFICES[S.office].rent*(1+(S.flags.rentUp||0)*.3))}
function monthlyCosts(){
  if(S.week%4)return;
  const of=OFFICES[S.office];
  let out=rentNow()+S.staff.reduce((a,e)=>a+e.salary,0);
  S.money-=out;
  if(S.loan){S.money-=S.loan.per;S.loan.left--;if(S.loan.left<=0){S.loan=null;addNews('财务','银行贷款已结清。')}}
  if(S.flags.levy&&S.week%52===0){S.money-=S.flags.levy;addNews('财务',`投资人按约抽走 ${money(S.flags.levy)}。`)}
  if(S.flags.deadline&&S.week>=S.flags.deadline&&!S.flags.deadlineDone){
    S.flags.deadlineDone=1;
    if(!S.cases.some(c=>c.score>=7)){addNews('财务','两年之约到期，投资人撤资离场。');S.money-=2000000;addBuzz(-10)}
    else addNews('财务','两年之约达标，投资人继续留在局内。');
  }
}
function processStaff(){
  S.staff.forEach(e=>{
    const busy=!free(e);
    e.energy=clamp(e.energy+(busy?-1.1:3.4),0,100);
    e.weeks++;
    if(e.weeks%52===0&&e.level<5&&Math.random()<(S.flags.mentor?.45:.32)){e.level++;STATS.forEach(([k])=>e.stats[k]+=ri(1,3));
      addNews('团队',`${e.name}的执业年限又长了一年，能力有提升。`)}
  });
}
// 日常业务：没进专案组的人不是白养着——接零散咨询、小额纠纷、文书代写。
// 真实律所大部分流水来自这块，管线上那 1~3 个专案是挣利润和名声的。
// 没有这条，把委托费压到真实水平之后账根本平不了，玩家的最优解会变成「把人裁到刚好够用」。
// 纯计算，没有副作用——界面直接调它，所以把人派进案组的当下数字就变了，不用等下一周
function dailyEstimate(){
  if(!S||S.suspendUntil)return {sum:0,capped:false};
  const idle=S.staff.filter(free);
  if(!idle.length)return {sum:0,capped:false};
  // 人手能干多少
  let manpower=0;
  idle.forEach(e=>{manpower+=(1200+e.level*1700)*(0.6+0.4*e.energy/100)});
  // 但零散活是案源封顶的，不是人多就能接更多——这条上限随知名度、声望和场地成长
  const cap=(24000+S.fame*3000+S.prestige*1200)*(1+S.office*.45)*(1+(S.flags.branch?.35:0));
  return {sum:Math.round(Math.min(manpower,cap)),capped:manpower>cap};
}
function dailyWork(){
  const {sum,capped}=dailyEstimate();
  S.money+=sum;S.flags.daily=sum;S.flags.dailyCapped=capped;
  return sum;
}
function payRetainers(){
  if(!S.retainers.length)return;
  let sum=0;S.retainers.forEach(r=>{sum+=r.monthly});
  S.money+=sum;
  if(sum)addNews('常年顾问',`本月收到 ${S.retainers.length} 份常年法律顾问费共 ${money(sum)}。`);
}
// 常年顾问合同两年一签。到期续不续，看关系、看口碑，还看当初那个负责人还在不在所里。
function processRetainers(){
  if(!S.retainers.length)return;
  S.retainers=S.retainers.filter(r=>{
    if(S.week<r.until)return true;
    const cl=S.clients.find(x=>x.id===r.clientId),keeper=S.staff.find(e=>e.id===r.keeper);
    let ok,why='';
    if(!keeper){ok=Math.random()<.35;why='原来的负责人已经不在所里'}
    else if(cl&&cl.rel<=1){ok=Math.random()<.3;why='这两年关系处得不好'}
    else ok=Math.random()<clamp(.55+S.buzz/320+(cl?cl.rel*.05:0),.2,.95);
    if(ok){
      r.until=S.week+104;
      const raise=Math.random()<.5;
      if(raise)r.monthly=Math.round(r.monthly*rnd(1.05,1.25)/100)*100;
      addNews('常年顾问',`${r.client}续签了常年法律顾问${raise?`，月费涨到 ${money(r.monthly)}`:''}。`);
      if(cl)cl.rel=clamp(cl.rel+1,0,5);
      return true;
    }
    addNews('常年顾问',`${r.client}没有续签常年法律顾问${why?`（${why}）`:''}。`);
    addBuzz(-2);
    return false;
  });
}

// ── 案件推进 ────────────────────────────────────────────────
const PHASE_W=[.2,.3,.3,.2];
// 四维：走完一个阶段（进度 0→100），对应维度常规涨 QBASE 点。
// 超过 QSOFT 之后增益打折——证据已经够扎实了，再堆一份没那么值钱。
const QBASE=44,QSOFT=62,QSOFT_K=.33;
function addQ(c,k,n){
  const cur=c.quality[k]||0;let v=cur,left=n;
  if(left>0&&cur<QSOFT){const room=Math.min(left,QSOFT-cur);v+=room;left-=room}
  v+=left>0?left*QSOFT_K:left;
  c.quality[k]=clamp(v,0,100);
}
function teamPower(c,stat){
  const t=teamOf(c);if(!t.length)return 1;
  let p=t.reduce((a,e)=>a+e.stats[stat]*(0.55+0.45*e.energy/100),0)/t.length;
  p*=1+teamChemistry(t);
  if(stat==='trial'&&S.facilities.court)p*=1.12;
  if(stat==='res'&&S.facilities.db)p*=1.10;
  if(stat==='biz'&&S.facilities.room)p*=1.10;
  t.forEach(e=>{if(e.star&&e.trait==='all')p*=1.06});
  return p;
}
function setOrder(id,k){
  const c=S.active.find(x=>x.id===id);if(!c)return;
  c.order=c.order===k?null:k;if(c.order!=='rush')c.rush=0;render();
}
function processCases(){
  [...S.active].forEach(c=>{
    if(c.ready)return;
    const ph=PHASES[c.phase],sd=scaleDefs[c.scale],ef=EFFORTS[c.effort];
    const team=teamOf(c);if(!team.length)return;
    const target=Math.max(2,sd.weeks*(c.weeksMul||1)*PHASE_W[c.phase]);
    const p0=13;
    const power=teamPower(c,ph.stat);
    let speed=(100/target)*(0.62+0.38*power/p0);
    let qMod=(0.80+0.28*power/p0)*(1+ef.q);
    // 每周指令
    const o=c.order;
    if(o==='rush'){speed*=1.35;qMod*=.7;team.forEach(e=>e.energy=clamp(e.energy-3,0,100));c.rush=(c.rush||0)+1}
    else if(o==='quality'){speed*=.8;qMod*=1.3;c.rush=0}
    else if(o==='care'){speed*=.9;S.money-=team.length*9000;team.forEach(e=>e.energy=clamp(e.energy+6,0,100));c.rush=0;
      for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++){const k=chemKey(team[i].id,team[j].id);S.chemistry[k]=(S.chemistry[k]||0)+.12}}
    else if(o==='save'){qMod*=.85;team.forEach(e=>e.energy=clamp(e.energy-2,0,100));c.rush=0}
    else if(o==='free'){c.rush=0;if(Math.random()<.14){const q=pick(QUALITIES)[0];addQ(c,q,ri(4,9));
      addNews('办案',`《${c.name}》上意外有了突破：${QUALITIES.find(x=>x[0]===q)[1]}明显加强。`)}}
    else c.rush=0;
    if(c.rush>=3){c.rush=0;const v=pick(team);v.energy=clamp(v.energy-22,0,100);
      c.quality.work=Math.max(0,c.quality.work-7);addBuzz(-3);
      addNews('办案',`《${c.name}》连着赶了三周，${v.name}直接病倒，一份材料报送错了期限。`)}
    // 每周开支
    const weekCost=sd.base*0.008*ef.cost*(o==='save'?.65:1);
    S.money-=weekCost;c.cost+=weekCost;
    // 计费小时按周回款
    if(c.feePlan==='hourly'){const inc=team.length*HOUR_RATE*(1+S.office*.18);S.money+=inc;c.paidIn+=inc;c.sat=clamp((c.sat||70)-0.4,0,100)}
    // 推进
    c.prog+=speed;addQ(c,ph.quality,QBASE/100*speed*qMod);c.weeks++;
    if(c.prog>=100){
      c.prog=0;c.phase++;
      if(c.phase===2&&!c.scheduled){openHearing(c.id);return}
      if(c.phase>3){c.phase=3;c.ready=true;closeCase(c)}
      else addNews('办案',`《${c.name}》进入${PHASES[c.phase].name}阶段。`);
    }
  });
}

// ── 排期 ────────────────────────────────────────────────────
function windowList(){
  const out=[];
  for(let i=1;i<=6;i++){
    const w=S.week+i*4,m=monthOf(w),y=yearOf(w),d=WINDOWS[m];
    const cl=rivalSlate().find(x=>Math.abs(x.w-w)<4);
    out.push({w,m,y,media:d[0],crowd:d[1],label:d[2],clash:cl?cl.name:null});
  }
  return out;
}
function openHearing(id){
  const c=S.active.find(x=>x.id===id);if(!c)return;
  curCase=c;pauseForModal();
  const court=DEPTS[c.dept].court;
  byId('hearingHead').textContent=court?'定开庭期':'定交割期';
  renderHearing();openDialog('hearingDialog');
  byId('hearingDialog').addEventListener('close',()=>{curCase=null;resumeAfterModal();render()},{once:true});
}
function renderHearing(){
  const c=curCase;if(!c)return;
  const t=typeById(c.type),court=DEPTS[c.dept].court,pv=previewScore(c);
  const wins=windowList();
  byId('hearingBody').innerHTML=
    sceneBanner(court?'court':'signing',c.name,`${DEPTS[c.dept].name} · ${t.name} · ${scaleDefs[c.scale].name}`)+
    `<p class="subtle">${esc(c.brief)}</p>
     <div class="qualities">${QUALITIES.map(([k,n])=>`<div>${n}<b>${Math.round(c.quality[k])}</b></div>`).join('')}</div>
     <div class="hint" style="margin-top:12px"><b>结案预估 ${pv.lo.toFixed(1)} – ${pv.hi.toFixed(1)}</b> · ${pv.label}<br>
     <small>真结果要等${court?'宣判':'交割'}那天。补强证据、老搭档、模拟法庭室都能把区间收窄。</small></div>
     <h3 style="margin-top:14px">${court?'开庭窗口':'交割窗口'}</h3>
     <div class="deal-grid">${wins.map((w,i)=>`
       <label class="deal"><input type="radio" name="hw" value="${i}" ${i===2?'checked':''}>
       <div><b>${w.y} 年 ${w.m} 月${w.label?' · '+w.label:''}</b>
       <small>拥挤度 ${w.crowd>=.8?'很高':w.crowd>=.4?'中等':'低'}　媒体关注 ×${w.media.toFixed(2)}
       ${w.crowd>=.8?'<br><span style="color:var(--warn)">排期紧，判决更保守</span>':''}
       ${w.clash?`<br><span style="color:var(--warn)">${esc(w.clash)}的大案也排在这一周，版面要分一半</span>`:''}</small></div></label>`).join('')}</div>
     <div class="fee-note">收费方案：<b>${FEES[c.feePlan].name}</b>　已收 ${money(c.paidIn)}　已投入 ${money(c.cost)}</div>`;
  byId('polishBtn').textContent=`追加两周补强 · ${money(scaleDefs[c.scale].base*0.09)}（已用 ${c.polish}/${MAX_POLISH}）`;
  byId('polishBtn').disabled=c.polish>=MAX_POLISH;
}
function polishCase(){
  const c=curCase;if(!c||c.polish>=MAX_POLISH)return;
  const cost=scaleDefs[c.scale].base*0.09;
  if(S.money<cost){toast('账上不够');return}
  S.money-=cost;c.cost+=cost;c.polish++;
  QUALITIES.forEach(([k])=>c.quality[k]=clamp(c.quality[k]+ri(2,5),0,100));
  addNews('办案',`《${c.name}》追加两周补强，材料扎实了一圈。`);
  renderHearing();render();
}
function reschedule(id){
  const c=S.active.find(x=>x.id===id);if(!c||!c.scheduled)return;
  if(c.rescheduled){toast('一个案子只能改一次期');return}
  const fee=Math.round(c.cost*.08);
  if(S.money<fee){toast('赔付款不够');return}
  if(!confirm(`改期要赔付已投入成本的 8%，也就是 ${money(fee)}。改吗？`))return;
  S.money-=fee;c.rescheduled=true;c.scheduled=false;
  addNews('排期',`《${c.name}》申请改期，赔付 ${money(fee)}。`);
  openHearing(id);
}
function confirmHearing(){
  const c=curCase;if(!c)return;
  const sel=document.querySelector('input[name="hw"]:checked');
  const w=windowList()[sel?+sel.value:2];
  c.hearing=w;c.scheduled=true;if(w.clash)c.clash=w.clash;
  const court=DEPTS[c.dept].court;
  addNews('排期',`《${c.name}》${court?'开庭':'交割'}定在 ${w.y} 年 ${w.m} 月${w.label?'（'+w.label+'）':''}。`);
  closeDialog('hearingDialog');save();
}

// ── 结案评级 ────────────────────────────────────────────────
function scoreRisk(c){
  // sigma 越小越有把握
  const team=teamOf(c),sd=scaleDefs[c.scale];
  let s=1.5;
  s-=clamp(team.reduce((a,e)=>a+e.level,0)/team.length*.16,0,.75);
  s-=teamChemistry(team)*1.6;
  s-=c.polish*.22;
  if(S.facilities.court)s-=.18;
  if(S.facilities.db)s-=.12;
  s+=clamp((sd.need-team.length)*.35,0,1);
  s+=clamp((70-team.reduce((a,e)=>a+e.energy,0)/team.length)/100,0,.5);
  if(c.scale==='mega'&&S.office<2)s+=.45;
  if(c.scale==='major'&&S.office<1)s+=.3;
  return clamp(s,.28,2.1);
}
function riskLabel(s){return s<.5?'有把握':s<.85?'说不太准':s<1.35?'心里没底':'纯属赌博'}
function baseScore(c){
  const t=typeById(c.type),q=c.quality;
  const w={fact:.25,law:.25,deal:.25,work:.25};w[t.bias]+=.14;
  const tot=w.fact+w.law+w.deal+w.work;
  let v=(q.fact*w.fact+q.law*w.law+q.deal*w.deal+q.work*w.work)/tot/100*9.4;
  const team=teamOf(c);
  v+=teamChemistry(team)*1.4;
  if(S.facilities.db)v+=.12;
  if(S.facilities.room)v+=.10;
  if(S.facilities.court&&DEPTS[c.dept].court)v+=.30;
  team.forEach(e=>{if(e.star&&e.trait==='all')v+=.35});
  if(S.trend&&S.trend[0]===t.name)v+=.25;
  if(c.hearing)v*=1-c.hearing.crowd*.06;
  v+=EFFORTS[c.effort].q*1.6;
  return clamp(v,0.5,scaleDefs[c.scale].cap);
}
function previewScore(c){
  const b=baseScore(c),s=scoreRisk(c);
  return {lo:clamp(b-s*1.15,1,10),hi:clamp(b+s*1.15,1,10),label:riskLabel(s),sigma:s};
}
function rollScore(c){
  const b=baseScore(c),s=scoreRisk(c);
  return clamp(b+gauss()*s,1,scaleDefs[c.scale].cap);
}
function verdictText(score,court){
  const row=VERDICTS.find(v=>score>=v[0]);return court?row[1]:row[2];
}

// ── 结案 ────────────────────────────────────────────────────
function closeCase(c){
  const idx=S.active.indexOf(c);if(idx<0)return;
  S.active.splice(idx,1);
  const t=typeById(c.type),court=DEPTS[c.dept].court,plan=FEES[c.feePlan];
  const score=rollScore(c);
  c.score=score;c.endWeek=S.week;c.endYear=yearOf(S.week);
  c.verdict=verdictText(score,court);
  // 回款
  let end=0;
  if(c.feePlan==='fixed')end=c.fee*plan.end*(0.75+0.5*score/10);
  else if(c.feePlan==='risk')end=c.fee*1.75*clamp((score-4)/5.2,0,1.25);
  else end=c.fee*plan.end*(0.8+0.4*score/10);
  S.money+=end;c.paidIn+=end;c.paid=c.paidIn;
  c.profit=c.paidIn-c.cost;
  if(c.feePlan==='risk'){
    if(score>=7)S.flags.riskWin=(S.flags.riskWin||0)+1;else S.flags.riskWin=0;
  }
  // 声誉
  const media=(c.hearing?c.hearing.media:1)*(c.clash?.5:1);
  const d=(score-6.2);
  const pg=d*.22*(c.scale==='mega'?1.6:c.scale==='major'?1.2:.7);
  const fg=d*.18*media*(c.scale==='small'?.6:1.1);
  S.prestige=Math.max(0,S.prestige+(pg>0?pg/(1+S.prestige/22):pg));
  S.fame=Math.max(0,S.fame+(fg>0?fg/(1+S.fame/16):fg));
  addBuzz(d*1.6*media);
  if(score<4.5){addBuzz(-6);addNews('口碑',`《${c.name}》${court?'一审败诉':'项目流产'}，当事人在网上发了长文。`)}
  // 客户与资产
  const cl=findOrMakeClient(c);
  c.clientId=cl.id;
  cl.rel=clamp(cl.rel+(score>=7?1:score>=5.5?0:-1),0,5);
  cl.entries++;cl.last=S.week;
  // 办得漂亮的批量型案子，后面会跟着一串同样的
  if(score>=6.5&&c.scale!=='small'&&['contract','labor','tm','copy','enforce'].includes(c.type)&&Math.random()<.35){
    S.leads.push(seriesLead(c));
    addNews('案源',`《${c.name}》办完之后，${cl.name}那边又来了一批一模一样的案子。`);
  }
  const sat=clamp((c.sat||70)+(score-6)*6+(c.effort==='heavy'?6:0)+(S.facilities.room?8:0),0,100);
  c.sat=sat;
  const gain=Math.round((score-4)*(c.scale==='mega'?26:c.scale==='major'?14:6)*media);
  if(gain>0)S.clientAssets[cl.type]=Math.max(0,S.clientAssets[cl.type]+gain);
  // 默契
  const team=teamOf(c);
  for(let i=0;i<team.length;i++)for(let j=i+1;j<team.length;j++){const k=chemKey(team[i].id,team[j].id);S.chemistry[k]=(S.chemistry[k]||0)+1}
  // 常年顾问转化
  if(c.type==='counsel'&&score>=6&&S.retainers.length<8){
    const keeper=team.find(e=>e.role==='corporate')||team[0];
    S.retainers.push({id:S.nextId++,client:cl.name,clientId:cl.id,monthly:Math.round(c.fee*.12),keeper:keeper?keeper.id:null,since:S.week,until:S.week+104});
    addNews('常年顾问',`${cl.name}签了常年法律顾问，每月 ${money(c.fee*.12)}。`);
  }
  S.cases.unshift(c);
  if(Math.random()<(c.scale==='small'?.18:c.scale==='major'?.35:.5))S.afterCase={id:c.id,at:S.week+ri(1,3)};
  if(S.flags.smallOnly>0)S.flags.smallOnly--;
  if(S.flags.noListed>0)S.flags.noListed--;
  if(c.clash)addNews('媒体',`《${c.name}》和${c.clash}的案子撞在同一周，版面被分走了大半。`);
  chron(`《${c.name}》结案，评级 ${score.toFixed(1)}，${c.verdict}。`);
  addNews('结案',`《${c.name}》${c.verdict}，结案评级 ${score.toFixed(1)}。`);
  showReport(c);
}
function findOrMakeClient(c){
  let cl=S.clients.find(x=>x.name===c.clientName);
  if(!cl){cl={id:S.nextId++,name:c.clientName,type:c.clientType,rel:1,entries:0,last:S.week};S.clients.push(cl)}
  return cl;
}
function showReport(c){
  pauseForModal();
  const court=DEPTS[c.dept].court,t=typeById(c.type);
  const good=c.score>=6;
  byId('reportHead').textContent='结案报告';
  byId('reportBody').innerHTML=
    sceneBanner(good?'award':'hallway',c.name,`${DEPTS[c.dept].name} · ${t.name}`)+
    `<div class="big-score">${c.score.toFixed(1)}</div>
     <div class="verdict${c.score<4.5?' bad':''}">${c.verdict}</div>
     <p class="subtle">${esc(c.brief)}</p>
     <div class="qualities">${QUALITIES.map(([k,n])=>`<div>${n}<b>${Math.round(c.quality[k])}</b></div>`).join('')}</div>
     <div class="fee-note" style="margin-top:12px">
       收费方案 <b>${FEES[c.feePlan].name}</b>　合计收款 <b>${money(c.paidIn)}</b><br>
       投入成本 ${money(c.cost)}　净收益 <b style="color:${c.profit>=0?'var(--main)':'var(--warn)'}">${money(c.profit)}</b><br>
       客户满意度 ${Math.round(c.sat)} / 100　用时 ${c.weeks} 周
     </div>`;
  openDialog('reportDialog');
  byId('reportDialog').addEventListener('close',resumeAfterModal,{once:true});
}

// ── 接案 ────────────────────────────────────────────────────
let pendingLead=null;
// 接不了的原因，没有就返回空串。案源列表和接案入口共用这一处判断。
function leadBlocked(l){
  if(S.suspendUntil)return '停业整顿期间不能接新案';
  if(S.active.length>=OFFICES[S.office].slots)return '案线满了，先结掉一个或升级场地';
  if(S.flags.smallOnly&&l.scale!=='small')return `开局约定，还有 ${S.flags.smallOnly} 个案子只能接小案`;
  if(S.flags.noListed&&l.clientType==='listed')return `竞业条款还没过，还有 ${S.flags.noListed} 个案子不能接上市公司`;
  return '';
}
function openCase(leadId){
  const l=S.leads.find(x=>x.id===leadId);if(!l)return;
  const why=leadBlocked(l);
  if(why){toast(why);return}
  pendingLead=l;pauseForModal();
  const t=typeById(l.type);
  byId('caseTitle').textContent='接案：'+l.name;
  byId('caseOriginHint').innerHTML=`<b>${esc(l.title)}</b><br>${esc(l.brief)}`;
  byId('caseBrief').innerHTML=`<p class="subtle"><span class="dept" style="--d:${DEPTS[l.dept].color}"></span>${DEPTS[l.dept].name} · ${t.name} · ${scaleDefs[l.scale].name} · 预计 ${scaleDefs[l.scale].weeks} 周<br>
    委托方 ${esc(l.clientName)}（${clientDefs[l.clientType].name}）　基准收费 ${money(l.fee)}</p>`;
  byId('caseFee').value='fixed';byId('caseEffort').value='normal';
  renderTeamPicks();previewCase();openDialog('caseDialog');
  byId('caseDialog').addEventListener('close',()=>{pendingLead=null;resumeAfterModal();render()},{once:true});
}
function renderTeamPicks(){
  const l=pendingLead;if(!l)return;
  const need=scaleDefs[l.scale].need;
  byId('teamPicks').innerHTML=S.staff.map(e=>{
    const busy=!free(e);
    return `<label class="pick"><input type="checkbox" value="${e.id}" ${busy?'disabled':''} onchange="previewCase()">
      <div class="pick-info"><b>${esc(e.name)}</b> <span class="tag">${roles[e.role][0]} Lv${e.level}</span>${e.star?' <span class="tag">★'+starTraits[e.trait].name+'</span>':''}
      <small>${STATS.map(([k,n])=>`${n} ${e.stats[k]}`).join('　')}</small>
      <small class="${busy?'warn':''}">${busy?'在别的案组里':'体力 '+Math.round(e.energy)+' · '+(e.star?starTraits[e.trait].desc:e.trait)}</small></div></label>`;
  }).join('')+`<p class="subtle" style="grid-column:1/-1">这个规模建议 ${need} 人。人不够也能接，但结果的区间会拉得很宽。</p>`;
}
function picked(){return [...document.querySelectorAll('#teamPicks input:checked')].map(i=>+i.value)}
function previewCase(){
  const l=pendingLead;if(!l)return;
  const plan=byId('caseFee').value,ef=byId('caseEffort').value;
  const ids=picked(),sd=scaleDefs[l.scale];
  const upfront=l.fee*FEES[plan].up;
  const weekCost=sd.base*0.008*EFFORTS[ef].cost;
  let hourNote='';
  if(plan==='hourly')hourNote=`　每周计费约 ${money((ids.length||sd.need)*HOUR_RATE*(1+S.office*.18))}`;
  byId('casePreview').innerHTML=
    `<b>${FEES[plan].name}</b>：${FEES[plan].desc}<br>
     签约即收 <b>${money(upfront)}</b>${hourNote}<br>
     <b>${EFFORTS[ef].name}</b>：${EFFORTS[ef].note}，每周办案开支约 ${money(weekCost)}<br>
     已选 ${ids.length} 人 / 建议 ${sd.need} 人${ids.length<sd.need?'　<span style="color:var(--warn)">人手不足，结果会很飘</span>':''}`;
}
function startCase(){
  const l=pendingLead;if(!l)return;
  const ids=picked();
  if(!ids.length){toast('至少得有一个人办这个案子');return}
  const plan=byId('caseFee').value,ef=byId('caseEffort').value;
  const c={id:S.nextId++,name:l.name,title:l.title,brief:l.brief,type:l.type,dept:l.dept,scale:l.scale,
    clientName:l.clientName,clientType:l.clientType,fee:l.fee,feePlan:plan,effort:ef,team:ids,
    phase:0,prog:0,quality:{fact:0,law:0,deal:0,work:0},order:null,rush:0,weeks:0,cost:0,paidIn:0,
    polish:0,scheduled:false,hearing:null,sat:70,start:S.week};
  // 客户关系折上浮
  if(l.weeksMul)c.weeksMul=l.weeksMul;
  if(l.series)c.series=true;
  const cl=S.clients.find(x=>x.id===l.repeat)||S.clients.find(x=>x.name===c.clientName);
  if(cl){c.clientId=cl.id;
    if(cl.rel>=3&&!l.repeat){c.fee=Math.round(c.fee*(1+cl.rel*.06));addNews('接案',`${cl.name}是回头客，收费上浮到 ${money(c.fee)}。`)}}
  const up=c.fee*FEES[plan].up;S.money+=up;c.paidIn=up;
  S.active.push(c);
  S.leads=S.leads.filter(x=>x.id!==l.id);
  addNews('接案',`签下《${c.name}》，${FEES[plan].name}，签约收款 ${money(up)}。`);
  chron(`接下《${c.name}》（${scaleDefs[c.scale].name}，${FEES[plan].name}）。`);
  closeDialog('caseDialog');save();
}

// ── 事件 ────────────────────────────────────────────────────
function evtReady(ev,ctx){
  if(S.evtCd[ev.id]&&S.week-S.evtCd[ev.id]<(ev.cooldown||30))return false;
  if(ev.phase!==undefined&&ev.phase!==null&&ctx.c&&ctx.c.phase!==ev.phase)return false;
  if(ev.cond&&!ev.cond(ctx))return false;
  return true;
}
function pickEvent(tier,ctx){
  const pool=EVENTS.filter(e=>e.tier===tier&&evtReady(e,ctx));
  if(!pool.length)return null;
  // 见过的往后排。同一条事件在一局里反复冒出来最伤沉浸感，
  // 所以每见过一次，权重打到原来的 0.28——池子没被榨干之前基本不会重复。
  const wt=e=>(e.weight||5)*Math.pow(.2,(S.evtSeen&&S.evtSeen[e.id])||0);
  const total=pool.reduce((a,e)=>a+wt(e),0);
  if(total<=0)return pick(pool);
  let r=Math.random()*total;
  for(const e of pool){r-=wt(e);if(r<=0)return e}
  return pool[pool.length-1];
}
function processEvents(){
  if(curEvent)return;
  // 结案后的回头账：客户要退费、对家来挖人、判决上了新闻……结完一两周才发作
  if(S.afterCase&&S.week>=S.afterCase.at){
    const w=S.cases.find(x=>x.id===S.afterCase.id);
    S.afterCase=null;
    if(w){const ev=pickEvent('close',{c:w,w});if(ev)return fireEvent(ev,{c:w,w})}
  }
  // 触发率是按「一局下来期望触发次数 ≈ 事件池大小」配的：
  // 十年 520 周，case 池 43 条 → .12，firm 16 条 → .04，person 10 条 → .025。
  // 再密就会重复刷同几条，再稀就撑不满一局。改事件数量的话这三个数也要跟着动。
  if(S.active.length&&Math.random()<.12){
    const c=pick(S.active.filter(x=>!x.ready));
    if(c){const ev=pickEvent('case',{c,p:c});if(ev)return fireEvent(ev,{c,p:c})}
  }
  if(Math.random()<.04){const ev=pickEvent('firm',{});if(ev)return fireEvent(ev,{})}
  if(S.staff.length&&Math.random()<.025){
    const e=pick(S.staff),ev=pickEvent('person',{e});
    if(ev)return fireEvent(ev,{e});
  }
  if(Math.random()<.22)addNews(...pick(NEWSFEED));
}
function fireEvent(ev,ctx){
  curEvent={ev,ctx};S.evtCd[ev.id]=S.week;
  if(!S.evtSeen)S.evtSeen={};S.evtSeen[ev.id]=(S.evtSeen[ev.id]||0)+1;
  pauseForModal();
  const txt=typeof ev.text==='function'?ev.text(ctx):ev.text;
  byId('eventTitle').textContent=typeof ev.title==='function'?ev.title(ctx):ev.title;
  byId('eventBody').innerHTML=
    (ev.mood?moodImg(ev.mood):'')+
    (ctx.e?portraitBox(ctx.e):'')+
    `<p>${esc(txt)}</p>`+
    ev.choices.map((ch,i)=>{
      const label=typeof ch.label==='function'?ch.label(ctx):ch.label;
      const note=typeof ch.note==='function'?ch.note(ctx):(ch.note||'');
      const cost=typeof ch.cost==='function'?ch.cost(ctx):(ch.cost||0);
      const can=cost<=0||S.money>=cost;
      return `<button class="choice" ${can?'':'disabled'} onclick="resolveEvent(${i})">
        <b>${esc(label)}</b>${cost?` <span class="tag${cost>0?'':' green'}">${cost>0?'花费 '+money(cost):'进账 '+money(-cost)}</span>`:''}
        ${ch.risk?` <span class="tag red">执业风险 +${ch.risk}</span>`:''}
        ${note?`<small>${esc(note)}</small>`:''}</button>`;
    }).join('');
  byId('eventSkipBtn').classList.toggle('hidden',!ev.onSkip);
  openDialog('eventDialog');
}
function resolveEvent(i){
  if(!curEvent)return;
  const {ev,ctx}=curEvent,ch=ev.choices[i];
  const cost=typeof ch.cost==='function'?ch.cost(ctx):(ch.cost||0);
  if(cost>0&&S.money<cost){toast('账上不够');return}
  S.money-=cost;
  if(ch.risk)addRisk(ch.risk,`《${ctx.c?ctx.c.name:S.firm}》：${typeof ch.label==='function'?ch.label(ctx):ch.label}`);
  if(ch.apply)ch.apply(ctx);
  curEvent=null;closeDialog('eventDialog');resumeAfterModal();render();
}
function skipEvent(){
  if(!curEvent)return;
  const {ev,ctx}=curEvent;
  if(ev.onSkip)ev.onSkip(ctx);
  curEvent=null;closeDialog('eventDialog');resumeAfterModal();render();
}
function queueChain(id,c){S.pending.push({id,caseId:c?c.id:null,at:S.week+ri(3,8)})}
function processPending(){
  const due=S.pending.filter(p=>p.at<=S.week);
  S.pending=S.pending.filter(p=>p.at>S.week);
  due.forEach(p=>{
    const ev=CHAINS[p.id];if(!ev)return;
    const c=p.caseId?S.active.find(x=>x.id===p.caseId):null;
    if(ev.needCase&&!c)return;
    if(!curEvent)fireEvent(ev,{c,p:c});
  });
}

// ── 招聘 ────────────────────────────────────────────────────
function openRecruit(){
  if(S.staff.length>=OFFICES[S.office].cap){toast('办公室坐不下了，先升级场地');return}
  if(!S.candidates.length)S.candidates=makeCandidates();
  renderRecruit();openDialog('recruitDialog');
}
function makeCandidates(){
  const list=[],ks=Object.keys(roles);
  for(let i=0;i<4;i++){
    const r=pick(ks);
    if(Math.random()<Math.min(.45,.10+S.prestige*.008))list.push(makeStar(r));
    else list.push(person(r,clamp(Math.round(rnd(1,2.2)+S.prestige*.12),1,5)));
  }
  return list;
}
function refreshCandidates(){
  if(S.money<25000){toast('账上不够');return}
  S.money-=25000;S.candidates=makeCandidates();renderRecruit();render();
}
function renderRecruit(){
  byId('recruitBody').innerHTML=S.candidates.map(e=>{
    const sign=Math.round(e.salary*(e.star?3.2:1.6)*(1+(60-S.buzz)/200));
    return `<div class="staff"><div>${avatarHtml(e)}</div>
      <div><h3>${esc(e.name)} ${e.star?'<span class="tag">★ '+starTraits[e.trait].name+'</span>':''}</h3>
      <p>${roles[e.role][0]} · Lv${e.level} · ${e.star?starTraits[e.trait].desc:e.trait}</p>
      <p>${STATS.map(([k,n])=>`${n} ${e.stats[k]}`).join('　')}</p></div>
      <aside>月薪 ${money(e.salary)}<br>签约金 ${money(sign)}<br>
      <button onclick="hire(${e.id},${sign})">聘用</button></aside></div>`;
  }).join('');
}
function hire(id,sign){
  const e=S.candidates.find(x=>x.id===id);if(!e)return;
  if(S.money<sign){toast('签约金不够');return}
  if(S.staff.length>=OFFICES[S.office].cap){toast('办公室坐不下了');return}
  S.money-=sign;S.staff.push(e);S.candidates=S.candidates.filter(x=>x.id!==id);
  addNews('团队',`${e.name}加入${S.firm}，任${roles[e.role][0]}。`);
  chron(`${e.name}（${roles[e.role][0]}）入所。`);
  renderRecruit();render();save();
}
function raiseSalary(id){
  const e=S.staff.find(x=>x.id===id);if(!e)return;
  const to=Math.max(Math.round(e.salary*1.15/100)*100,marketSalary(e));
  if(to<=e.salary){toast('已经在行情价之上了');return}
  if(!confirm(`把 ${e.name} 的月薪从 ${money(e.salary)} 提到 ${money(to)}？`))return;
  e.salary=to;addNews('团队',`给${e.name}加了薪，月薪 ${money(to)}。`);
  if(S.poach&&S.poach.id===e.id)addNews('团队',`${e.name}那边的邀约，暂时不提了。`);
  showPerson(id);render();
}
function fireStaff(id){
  const e=S.staff.find(x=>x.id===id);if(!e)return;
  if(!free(e)){toast('他手上还有案子');return}
  if(!confirm(`辞退 ${e.name}？要付三个月补偿 ${money(e.salary*3)}。`))return;
  S.money-=e.salary*3;S.staff=S.staff.filter(x=>x.id!==id);
  addNews('团队',`${e.name}离所。`);render();
}
function showPerson(id){
  const e=S.staff.find(x=>x.id===id);if(!e)return;
  byId('personHead').textContent=e.name+' · 执业档案';
  const done=S.cases.filter(c=>c.team.includes(e.id));
  byId('personBody').innerHTML=portraitBox(e)+
    `<p><b>${roles[e.role][0]}</b> · Lv${e.level} · ${e.star?'★ '+starTraits[e.trait].name:e.trait}</p>
     ${e.star?`<p class="subtle">${starTraits[e.trait].desc}</p>`:''}
     <div class="qualities">${STATS.map(([k,n])=>`<div>${n}<b>${e.stats[k]}</b></div>`).join('')}</div>
     <p style="margin-top:12px">体力 ${Math.round(e.energy)} / 100　月薪 ${money(e.salary)}　入所 ${Math.floor(e.weeks/52)} 年 ${e.weeks%52} 周</p>
     <p>经手案件 ${done.length} 件${done.length?'　平均评级 '+(done.reduce((a,c)=>a+c.score,0)/done.length).toFixed(1):''}</p>
     ${done.length?'<p class="subtle">'+done.slice(0,6).map(c=>`《${esc(c.name)}》${c.score.toFixed(1)}`).join('　')+'</p>':''}
     ${underpaid(e)?`<p class="hint danger">月薪 ${money(e.salary)}，低于行情价 ${money(marketSalary(e))}。这种人对家最爱挖。</p>`:''}
     ${S.poach&&S.poach.id===e.id?`<p class="hint danger">${esc(S.poach.by)}正在接触他。加薪到行情价以上还来得及。</p>`:''}
     <div class="card-actions"><button onclick="raiseSalary(${e.id})">加薪</button><button onclick="fireStaff(${e.id});closeDialog('personDialog')">辞退</button></div>`;
  openDialog('personDialog');
}

// ── 设施与升级 ──────────────────────────────────────────────
function buildFacility(k){
  const f=facilities.find(x=>x[0]===k);if(!f||S.facilities[k])return;
  if(S.money<f[3]){toast('账上不够');return}
  S.money-=f[3];S.facilities[k]=1;
  addNews('律所',`建成${f[1]}。${f[2]}`);chron(`建成${f[1]}。`);render();save();
}
function upgradeOffice(){
  const of=OFFICES[S.office];if(!of.upgrade)return;
  if(S.money<of.upgrade){toast('账上不够');return}
  S.money-=of.upgrade;S.office++;
  addNews('律所',`搬进${OFFICES[S.office].name}，可同时办 ${OFFICES[S.office].slots} 个案子。`);
  chron(`搬进${OFFICES[S.office].name}。`);render();save();
}

// ── 自救 ────────────────────────────────────────────────────
function takeLoan(){
  if(S.loan){toast('还有贷款没还完');return}
  S.loan={per:63000,left:36};S.money+=2000000;
  addNews('财务','向银行借了 200 万，三年内每月还 6.3 万。');render();save();
}
function openGig(){
  const idle=S.staff.filter(free);
  if(idle.length<2){toast('至少要两个闲着的人');return}
  const pay=Math.round(120000*(1+S.prestige*.03));
  if(!confirm(`接一单六周的法律文书外包，占用两名闲置律师，结款 ${money(pay)}。接吗？`))return;
  S.money+=pay;idle.slice(0,2).forEach(e=>e.energy=clamp(e.energy-18,0,100));
  addNews('财务',`接了一单文书外包，结款 ${money(pay)}。`);render();save();
}
function referLead(id){
  const l=S.leads.find(x=>x.id===id);if(!l)return;
  const fee=Math.round(l.fee*.12);
  S.money+=fee;S.leads=S.leads.filter(x=>x.id!==id);
  addNews('案源',`把《${l.name}》转介给同行，拿到介绍费 ${money(fee)}。`);render();
}
const GRACE=16;
function financialRisk(){
  if(S.over)return;
  const monthly=rentNow()+S.staff.reduce((a,e)=>a+e.salary,0);
  if(S.money>=-monthly){                      // 缓过来了就把警告清掉
    if(S.flags.warned){S.flags.warned=0;addNews('财务','账面缓过来了，暂时不用散伙。')}
    return;
  }
  if(!S.flags.warned){
    S.flags.warned=S.week;
    addNews('财务',`账上透支已经超过一个月的开支，${GRACE} 周内不补上就撑不住了。`);
    setSpeed(0);toast('账上透支了');return;
  }
  if(S.week-S.flags.warned>GRACE)showEnding('broke');
}

// ── 榜单与目标 ──────────────────────────────────────────────
function checkAwards(){
  if(monthOf(S.week)!==2||S.flags.awardYear===yearOf(S.week))return;
  S.flags.awardYear=yearOf(S.week);
  const last=S.cases.filter(c=>c.endYear===yearOf(S.week)-1);
  if(!last.length)return;
  const best=last.reduce((a,b)=>b.score>a.score?b:a);
  let need=8.0;
  if(S.staff.some(e=>e.star&&e.trait==='auth'))need-=.6;
  if(best.score>=need){
    S.flags.listed=1;S.prestige+=4;addBuzz(8);
    addNews('明镜榜',`《${best.name}》入选明镜榜年度案例，${S.firm}榜上有名。`);
    chron(`《${best.name}》入选明镜榜年度案例。`);
  }else addNews('明镜榜',`明镜榜年度评选揭晓，${S.firm}没能上榜。`);
}
function goalDone(g){return !!S.goals[g.id]}
function checkGoals(){
  GOALS.forEach(g=>{
    if(S.goals[g.id])return;
    let ok=false;try{ok=g.check()}catch(e){}
    if(ok){S.goals[g.id]=S.week;g.reward();addNews('经营目标',`达成「${g.name}」，${g.rw}。`);chron(`达成经营目标「${g.name}」。`)}
  });
}
function checkAchievements(){
  ACHIEVEMENTS.forEach(([id,name,desc,fn])=>{
    if(S.ach[id])return;
    let ok=false;try{ok=fn()}catch(e){}
    if(ok){S.ach[id]=S.week;addNews('成就',`解锁成就「${name}」——${desc}。`)}
  });
}

// ── 结局 ────────────────────────────────────────────────────
function showEnding(force){
  let key=force;
  if(!key){
    const avg=S.cases.length?S.cases.reduce((a,c)=>a+c.score,0)/S.cases.length:0;
    const rank=industryRank().findIndex(r=>r.name===S.firm);
    if(rank===0&&S.prestige>=35&&S.cases.length>=34&&avg>=6.8)key='giant';
    else if(avg>=7.4&&S.prestige>=15)key='boutique';
    else if(S.retainers.length>=4&&avg<7)key='vendor';
    else if(S.money<0)key='merged';
    else key='still';
  }
  const E={
    giant:['红圈所','十年下来，明镜榜上有你，大案的对家名单上也总有你。招牌立住了，接下来要守的是这块招牌本身。','ending-rise'],
    boutique:['精品所','人不多，案子挑，但同行提起某一类案子就会想到你们。钱不是最多的，名声是最干净的那一档。','ending-rise'],
    vendor:['外所下包工厂','活一直有，常年顾问的流水稳稳当当。只是这些年下来，没有一个案子是别人会记住的。','ending-fall'],
    merged:['被合并退场','账撑不住了。谈了三个月，最后整所并进一家大所，招牌摘下来那天没开会。','ending-fall'],
    still:['还开着','没做成什么大事，也没出什么大事。门还开着，案子还在接，这在这行已经不容易。','ending-rise'],
    revoked:['吊销执照','司法局的处罚决定书送到所里那天，前台还在接咨询电话。执业证收走了，十年的案卷封存入库。','ending-fall'],
    broke:['资不抵债','工资发不出来第三个月，最后几个人自己找了下家。房东来收钥匙的时候，会议室的白板还没擦。','ending-fall']
  }[key];
  S.over=key==='revoked'||key==='broke';
  setSpeed(0);
  byId('endingTitle').textContent=E[0];
  const avg=S.cases.length?(S.cases.reduce((a,c)=>a+c.score,0)/S.cases.length).toFixed(1):'—';
  byId('endingBody').innerHTML=sceneBanner(E[2],E[0],`${S.firm} · ${dateText(S.week)}`)+
    `<p>${E[1]}</p>
     <div class="qualities"><div>办结案件<b>${S.cases.length}</b></div><div>平均评级<b>${avg}</b></div>
     <div>行业声望<b>${Math.round(S.prestige)}</b></div><div>执业红线<b>${Math.round(S.risk)}</b></div></div>
     <p style="margin-top:12px">账面 ${money(S.money)}　团队 ${S.staff.length} 人　常年顾问 ${S.retainers.length} 份</p>`;
  chron(`结局：${E[0]}。`);
  openDialog('endingDialog');save();
}

// ══ 渲染 ════════════════════════════════════════════════════
function showPage(p){
  S.page=p;
  ['home','leads','team','files','strategy'].forEach(k=>byId('page-'+k).classList.toggle('hidden',k!==p));
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  render();
}
function render(){
  if(!S)return;
  byId('firmName').textContent=S.firm;
  byId('officeName').textContent=OFFICES[S.office].name;
  renderClock();renderNews();renderTrend();
  const p=S.page||'home';
  if(p==='home')byId('page-home').innerHTML=renderHome();
  if(p==='leads')byId('page-leads').innerHTML=renderLeads();
  if(p==='team')byId('page-team').innerHTML=renderTeam();
  if(p==='files')byId('page-files').innerHTML=renderFiles();
  if(p==='strategy')byId('page-strategy').innerHTML=renderStrategy();
}
function renderClock(){
  byId('clock').innerHTML=`<b>${dateText(S.week)}</b><small class="clock-wide">第 ${S.week} 周 · ${OFFICES[S.office].room}</small><small class="clock-compact">第 ${S.week} 周</small>`;
}
function renderNews(){
  byId('newsFeed').innerHTML=S.news.slice(0,26).map(n=>
    `<div class="news"><time>${dateText(n.w)} · ${esc(n.tag)}</time>${esc(n.text)}</div>`).join('')||'<p class="subtle">还没有消息。</p>';
}
function renderTrend(){
  const t=S.trend||trends[0];
  byId('trendPanel').innerHTML=`<small>当前市场风向</small><b>${t[0]}</b><small>${t[1]}</small>`;
}
function statCards(){
  const tier=riskTier(),dy=dailyEstimate();
  return `<div class="stats">
    <div class="stat card${S.money<0?' danger':''}"><label>账面现金</label><b>${money(S.money)}</b><small>月开支 ${wan(rentNow()+S.staff.reduce((a,e)=>a+e.salary,0))}${S.flags.rentUp?'（房租已涨）':''} · 日常业务 +${wan(dy.sum)}/周${dy.capped?' · 案源已满':''}</small></div>
    <div class="stat card"><label>行业声望</label><b>${S.prestige.toFixed(1)}</b><small>同行与法院</small></div>
    <div class="stat card"><label>社会知名度</label><b>${S.fame.toFixed(1)}</b><small>上门委托</small></div>
    <div class="stat card"><label>律所口碑</label><b>${Math.round(S.buzz)}</b><small>${buzzLabel(S.buzz)}</small></div>
    <div class="stat card${S.risk>=65?' danger':''}"><label>执业红线</label><b>${Math.round(S.risk)}</b><small>${tier[1]}</small></div>
  </div>`;
}
function orderBar(c){
  return `<div class="orders">${Object.keys(ORDERS).map(k=>
    `<button class="${c.order===k?'on':''}" onclick="setOrder(${c.id},'${k}')">${ORDERS[k].name}</button>`).join('')}</div>
   <p class="subtle order-hint">${c.order?`当前指令 · ${ORDERS[c.order].hint}${c.order==='rush'&&c.rush?`（已连赶 ${c.rush} 周）`:''}`:'没下指令 · 按常规推进。指令会一直执行，直到你改或再点一次取消。'}</p>`;
}
function caseCard(c){
  const t=typeById(c.type),sd=scaleDefs[c.scale],ph=PHASES[c.phase],pv=previewScore(c);
  const team=teamOf(c);
  return `<div class="project">
    <div class="project-head">
      <div class="poster" style="background:linear-gradient(160deg,${DEPTS[c.dept].color},#16251f)">${t.name[0]}</div>
      <div class="grow"><h3>${esc(c.name)}</h3>
        <p><span class="dept" style="--d:${DEPTS[c.dept].color}"></span>${DEPTS[c.dept].name} · ${t.name} · ${sd.name} · ${FEES[c.feePlan].name}</p>
        <p class="subtle">${esc(c.brief)}</p>
        <p>当前阶段 <b>${ph.name}</b>　第 ${c.weeks} / 约 ${sd.weeks} 周${c.hearing?`　${DEPTS[c.dept].court?'开庭':'交割'} ${c.hearing.y} 年 ${c.hearing.m} 月`:''}</p>
      </div>
    </div>
    <div class="bar"><i style="width:${clamp(c.prog,0,100)}%"></i></div>
    <div class="qualities">${QUALITIES.map(([k,n])=>`<div>${n}<b>${Math.round(c.quality[k])}</b></div>`).join('')}</div>
    <p class="subtle" style="margin-top:8px">办案组 ${team.map(e=>esc(e.name)+(e.star?'★':'')).join('、')||'<span style="color:var(--warn)">没人</span>'}
      预估 ${pv.lo.toFixed(1)}-${pv.hi.toFixed(1)}（${pv.label}）　已收 ${money(c.paidIn)}　已投 ${money(c.cost)}</p>
    ${orderBar(c)}
    <div class="card-actions">${c.scheduled?`<button ${c.rescheduled?'disabled':''} onclick="reschedule(${c.id})">${c.rescheduled?'已改过期':'改期 · 赔付 '+money(c.cost*.08)}</button>`:`<button onclick="openHearing(${c.id})">现在就定排期</button>`}</div>
  </div>`;
}
function renderHome(){
  const of=OFFICES[S.office];
  const set=`<section class="card set-card">
      ${sceneImg(workScene(),'',true)}
      <div class="set-head"><div><b>${esc(of.name)}</b><br><small>${of.room}</small></div>
        <div style="text-align:right"><small>在办 ${S.active.length} / ${of.slots}</small><br><small>团队 ${S.staff.length} / ${of.cap}</small></div></div>
      <div class="blinds"></div>
      <div class="camera" aria-hidden="true">⚖</div>
      <div class="crew-dots">${S.staff.slice(0,7).map(e=>
        `<div class="crew-dot"><i style="--c:${roleColors[e.role]}">${faceImg(e,true)}</i><b>${esc(e.name)}</b></div>`).join('')}</div>
    </section>`;
  const quick=`<section class="card section quick"><h2>常用操作</h2>
      <div class="operation-grid">
        <button ${S.suspendUntil?'disabled':''} onclick="showPage('leads')">看案源（${S.leads.length}）</button>
        <button ${S.suspendUntil?'disabled':''} onclick="openRecruit()">招人</button>
        ${of.upgrade?`<button onclick="upgradeOffice()">升级场地 ${money(of.upgrade)}</button>`:'<button disabled>已是最高场地</button>'}
        <button onclick="showPage('strategy')">律所战略</button>
      </div>
      ${S.suspendUntil?`<p class="hint danger" style="margin-top:10px">停业整顿中，${dateText(S.suspendUntil)}恢复。期间不能接案、不能推进，房租照付。</p>`:''}
      ${S.money<0?`<p class="hint danger" style="margin-top:10px">账面已经透支 ${money(-S.money)}。撑不过 ${Math.max(0,GRACE-(S.week-(S.flags.warned||S.week)))} 周就得散伙——战略页有三条自救路。</p>`:''}
    </section>`;
  const board=`<section class="card section board"><h2>在办案件</h2>
      ${S.active.length?S.active.map(caseCard).join(''):'<div class="empty">手上没有案子。去案源市场接一个。</div>'}
    </section>`;
  return statCards()+`<div class="studio">${set}<div class="dashboard">${quick}</div></div>`+board;
}
function renderLeads(){
  const of=OFFICES[S.office],full=S.active.length>=of.slots;
  return statCards()+sceneBanner('leads-market','案源市场',`在办 ${S.active.length} / ${of.slots}　每 4 周刷新一批`)+
   `<section class="card section">
     ${S.suspendUntil?'<p class="hint danger">停业整顿中，这期间不能接新案。</p>':full?'<p class="hint">案线满了。要么结掉一个，要么升级场地。</p>':''}
     <div class="script-grid">${S.leads.map(l=>{
       const t=typeById(l.type);
       const liked=S.trend&&S.trend[0]===t.name;
       const why=leadBlocked(l);
       return `<div class="script">
         <h3>${l.hot?'🔥 ':''}${esc(l.name)}</h3>
         <p class="subtle"><span class="dept" style="--d:${DEPTS[l.dept].color}"></span>${DEPTS[l.dept].name} · ${t.name} · ${scaleDefs[l.scale].name}${liked?' <span class="tag green">正当风口</span>':''}${l.repeat?' <span class="tag green">老客户回头</span>':''}${l.series?' <span class="tag">系列案 · 周期短</span>':''}</p>
         <p>${esc(l.brief)}</p>
         <p class="subtle">委托方 ${esc(l.clientName)}（${clientDefs[l.clientType].name}）<br>基准收费 <b>${money(l.fee)}</b>　约 ${scaleDefs[l.scale].weeks} 周　${l.expire-S.week} 周内有效</p>
         ${why?`<p class="subtle" style="color:var(--warn)">接不了：${why}</p>`:''}
         <div class="card-actions"><button class="primary" ${why?'disabled':''} onclick="openCase(${l.id})">接案</button>
         <button onclick="referLead(${l.id})">转介 ${money(l.fee*.12)}</button></div>
       </div>`}).join('')||'<div class="empty">这几周没什么新案源，等等看。</div>'}</div>
   </section>`;
}
function renderTeam(){
  const of=OFFICES[S.office];
  return statCards()+`<section class="card section">
    <div class="split"><h2 class="grow">律师团队 ${S.staff.length} / ${of.cap}</h2><button class="primary" onclick="openRecruit()">招人</button></div>
    ${S.staff.map(e=>{
      const busy=!free(e),on=S.active.find(c=>c.team.includes(e.id));
      return `<div class="staff">
        <div onclick="showPerson(${e.id})" style="cursor:pointer">${avatarHtml(e)}</div>
        <div><h3>${esc(e.name)} ${e.star?'<span class="tag">★ '+starTraits[e.trait].name+'</span>':''}</h3>
          <p>${roles[e.role][0]} · Lv${e.level} · ${e.star?starTraits[e.trait].desc:e.trait}</p>
          <p>${STATS.map(([k,n])=>`${n} ${e.stats[k]}`).join('　')}</p>
          <div class="energy"><i style="width:${e.energy}%"></i></div>
        </div>
        <aside>${busy?(on?`在办《${esc(on.name)}》`:'常年顾问'):'空闲'}<br>月薪 ${money(e.salary)}${underpaid(e)?'<br><span class="tag red">低于行情</span>':''}${S.poach&&S.poach.id===e.id?'<br><span class="tag red">被人接触</span>':''}<br>
          <button onclick="showPerson(${e.id})">档案</button></aside>
      </div>`}).join('')}
   </section>`;
}
function renderFiles(){
  return statCards()+`<section class="card section"><h2>案卷库 ${S.cases.length} 件${S.cases.length>40?' <small class="subtle">· 显示最近 40 件</small>':''}</h2>
    <div class="work-grid">${S.cases.slice(0,40).map(c=>{
      const t=typeById(c.type);
      return `<div class="work">
        <div class="work-top"><div class="poster" style="background:linear-gradient(160deg,${DEPTS[c.dept].color},#16251f)">${t.name[0]}</div>
        <div><h3>${esc(c.name)}</h3><p class="subtle">${DEPTS[c.dept].name} · ${t.name} · ${dateText(c.endWeek)}</p></div></div>
        <p class="score">${c.score.toFixed(1)}</p>
        <p class="verdict${c.score<4.5?' bad':''}">${c.verdict}</p>
        <p class="subtle">收款 ${money(c.paid)}　净收益 ${money(c.profit)}　客户满意 ${Math.round(c.sat)}</p>
      </div>`}).join('')||'<div class="empty">还没有办结的案子。</div>'}</div>
   </section>`;
}
function renderStrategy(){
  const tier=riskTier(),rank=industryRank();
  const spark=S.buzzLog.length>1?S.buzzLog.map((v,i)=>`${i/(S.buzzLog.length-1)*100},${100-v}`).join(' '):'';
  return statCards()+
   `<section class="card section"><h2>执业红线</h2>
     <div class="riskbar ${S.risk>=65?'risk-hot':S.risk>=40?'risk-mid':'risk-ok'}"><i style="width:${S.risk}%"></i></div>
     <p class="risk-note ${S.risk>=65?'hot':''}">${Math.round(S.risk)} / 100 · ${tier[1]} —— ${tier[2]}</p>
     <p class="subtle">每 ${RISK_DECAY_WEEKS} 周自然回落 ${RISK_DECAY} 点。${S.facilities.risk?'内部合规风控岗已建成，所有涨幅 ×0.65。':'建「内部合规风控岗」可把涨幅压到 0.65 倍。'}</p>
   </section>
   <section class="card section"><h2>律所口碑走势</h2>
     <p>${Math.round(S.buzz)} / 100 · ${buzzLabel(S.buzz)}</p>
     ${spark?`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:70px"><polyline points="${spark}" fill="none" stroke="var(--main)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`:'<p class="subtle">还没有足够的数据。</p>'}
   </section>
   <section class="card section"><h2>客户资产</h2>
     <div class="audience-grid">${Object.entries(clientDefs).map(([k,d])=>
       `<div class="audience-card"><h3>${d.name}</h3><p>${d.desc}</p>
        <p><b style="font-size:20px">${S.clientAssets[k]}</b></p></div>`).join('')}</div>
   </section>
   <section class="card section"><h2>常年法律顾问 ${S.retainers.length} 份</h2>
     ${S.retainers.length?S.retainers.map(r=>{
       const k=S.staff.find(e=>e.id===r.keeper);
       const left=r.until-S.week;
       return `<div class="slate-item${left<=13?' danger':''}"><span>${money(r.monthly)}/月</span><span>${esc(r.client)}</span>
         <span>${k?esc(k.name)+' 负责':'<span style="color:var(--warn)">负责人已离所</span>'} · ${left<=0?'待续签':left<=13?`${left} 周后到期`:`${Math.round(left/52*10)/10} 年后到期`}</span></div>`}).join(''):
       '<p class="subtle">还没有常年顾问合同。办结「常年法律顾问」类案件且评级 6 分以上会自动转化。</p>'}
   </section>
   <section class="card section"><h2>所内设施</h2>
     <div class="facility-grid">${facilities.map(([k,n,d,p])=>
       `<div class="facility"><h3>${n}</h3><p>${d}</p>
        ${S.facilities[k]?'<span class="tag green">已建成</span>':`<button onclick="buildFacility('${k}')">建设 ${money(p)}</button>`}</div>`).join('')}</div>
   </section>
   <section class="card section"><h2>行业榜单</h2>
     ${rank.slice(0,7).map((r,i)=>{const rv=S.rivals.find(x=>x.name===r.name);
       return `<div class="rank"><span class="no">${i+1}</span>
       <span>${esc(r.name)}${r.name===S.firm?' <span class="tag">本所</span>':''}
         ${rv?`<br><small class="subtle">${esc(rv.desc)}${rv.wins?`　已抢走 ${rv.wins} 个案源`:''}</small>`:''}</span>
       <span class="subtle">${r.power.toFixed(1)}</span></div>`}).join('')}
   </section>
   <section class="card section"><h2>经营目标</h2>
     <div class="goal-list">${GOALS.map(g=>`<div class="goal-row ${goalDone(g)?'ok':''}"><i>${goalDone(g)?'✓':'○'}</i><b>${g.name}</b><span>${g.desc} · ${g.rw}</span></div>`).join('')}</div>
   </section>
   <section class="card section"><h2>成就墙 ${Object.keys(S.ach).length} / ${ACHIEVEMENTS.length}</h2>
     <div class="goal-list">${ACHIEVEMENTS.map(([id,n,d])=>`<div class="goal-row ${S.ach[id]?'ok':''}"><i>${S.ach[id]?'✓':'○'}</i><b>${n}</b><span>${d}</span></div>`).join('')}</div>
   </section>
   <section class="card section"><h2>周转不开的时候</h2>
     <div class="operation-grid">
       <button onclick="takeLoan()" ${S.loan?'disabled':''}>${S.loan?`贷款还剩 ${S.loan.left} 个月`:'银行借 200 万'}</button>
       <button onclick="openGig()">接一单文书外包</button>
       <button onclick="showPage('leads')">去案源市场转介</button>
     </div>
   </section>
   <details class="fold"><summary>律所编年史</summary><div class="fold-body">
     <div class="chron">${S.chron.map(l=>`<div>${esc(l)}</div>`).join('')||'<p class="subtle">还没写下什么。</p>'}</div>
     <div class="card-actions"><button onclick="copyChron()">复制全文</button></div>
   </div></details>`;
}
function copyChron(){
  const txt=`${S.firm} · 编年史\n\n`+S.chron.join('\n');
  try{navigator.clipboard.writeText(txt);toast('已复制到剪贴板')}catch(e){toast('复制失败')}
}

// ── 启动 ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  byId('continueBtn').disabled=!hasSave();
  document.addEventListener('keydown',ev=>{
    if(!S||document.querySelector('dialog[open]'))return;
    if(ev.code==='Space'||ev.code==='ArrowRight'){ev.preventDefault();stepWeek()}
  });
  window.addEventListener('beforeunload',()=>{if(S)save()});
});
