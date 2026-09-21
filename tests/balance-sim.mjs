// 数值审计：三种打法各跑 N 局完整十年，统计经济曲线与分布
// node tests/balance-sim.mjs [局数]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const RUNS=+(process.argv[2]||40);

function makeEl(){return {innerHTML:'',textContent:'',value:'',disabled:false,open:false,dataset:{},
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  addEventListener(){},showModal(){this.open=true},close(){this.open=false},
  querySelectorAll:()=>[],querySelector:()=>null}}
function makeCtx(){
  const els={},store={};
  const document={
    __picks:[],__hw:3,
    getElementById(id){return els[id]||(els[id]=makeEl())},
    querySelectorAll(sel){
      if(sel==='#teamPicks input:checked')return (document.__picks||[]).map(v=>({value:String(v)}));
      return [];
    },
    querySelector(sel){
      if(sel==='input[name="hw"]:checked')return {value:String(document.__hw)};
      return null;
    },
    addEventListener(){},createElement:()=>makeEl(),body:makeEl()
  };
  const localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const ctx={console,Math,Date,JSON,Array,Object,String,Number,Boolean,Error,parseInt,parseFloat,isNaN,
    document,localStorage,navigator:{clipboard:{writeText(){}}},
    setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},
    confirm:()=>true,alert(){},location:{reload(){}}};
  ctx.window={addEventListener(){}};ctx.globalThis=ctx;
  vm.createContext(ctx);
  const code=['src/data.js','src/events.js','src/art.js','src/game.js']
    .map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  const bridge=`globalThis.__api={get S(){return S},set S(v){S=v},
    get curEvent(){return curEvent}, get curCase(){return curCase},
    OFFICES,scaleDefs,FEES,EVENTS,GOALS,ACHIEVEMENTS,DEPTS,facilities,typeById,
    newGame,tickWeek,openCase,startCase,confirmHearing,resolveEvent,skipEvent,setOrder,
    free,pick,upgradeOffice,buildFacility,openRecruit,hire,clientTotal,industryRank,takeLoan};`;
  vm.runInContext(code+'\n;\n'+bridge,ctx,{filename:'bundle.js'});
  ctx.__api.__doc=document;
  return ctx.__api;
}

// ── 三种打法 ────────────────────────────────────────────────
const STRATS={
  稳健:{origin:'spinoff',plan:()=>'fixed',effort:()=>'normal',order:()=>'quality',
    choose:(ev)=>{const i=ev.choices.findIndex(c=>!c.risk);return i<0?null:i}},
  激进:{origin:'funded',plan:c=>c.scale==='small'?'fixed':'risk',effort:()=>'heavy',order:()=>'rush',
    choose:(ev)=>{let best=0,r=-1;ev.choices.forEach((c,i)=>{if((c.risk||0)>r){r=c.risk||0;best=i}});return best}},
  躺平:{origin:'three',plan:()=>'hourly',effort:()=>'lean',order:()=>null,
    choose:(ev)=>null},
  // 正常人大概会这么玩：大案押风险代理，小案稳收，偶尔越一次线
  混合:{origin:'spinoff',plan:c=>c.scale==='small'?'hourly':(Math.random()<.4?'risk':'fixed'),
    effort:c=>c.scale==='small'?'normal':'heavy',
    order:()=>Math.random()<.35?'care':'quality',
    choose:(ev)=>{
      const risky=ev.choices.findIndex(c=>c.risk);
      if(risky>=0&&Math.random()<.25)return risky;
      const safe=ev.choices.findIndex(c=>!c.risk);
      return safe<0?0:safe}},
  // 和「混合」完全一样，只多一个行为：红线过 55 就收手，等它降下来再说。
  // 这条是用来验证反馈回路能不能用的——真人是看得见那根条的。
  看红线:{origin:'spinoff',plan:c=>c.scale==='small'?'hourly':(Math.random()<.4?'risk':'fixed'),
    effort:c=>c.scale==='small'?'normal':'heavy',
    order:()=>Math.random()<.35?'care':'quality',
    choose:(ev,S)=>{
      const risky=ev.choices.findIndex(c=>c.risk);
      if(risky>=0&&S.risk<55&&Math.random()<.25)return risky;
      const safe=ev.choices.findIndex(c=>!c.risk);
      return safe<0?0:safe}}
};

function runOne(name,S_){
  const g=makeCtx(),st=STRATS[name];
  g.newGame(st.origin);
  const doc=g.__doc;
  let weeks=0;
  while(weeks<520&&!g.S.over){
    // 处理挂起的事件
    let guard=0;
    while(g.curEvent&&guard++<5){
      const ev=g.curEvent.ev,i=st.choose(ev,g.S);
      if(i===null||i===undefined){ if(ev.onSkip)g.skipEvent(); else g.resolveEvent(0) }
      else{
        const ch=ev.choices[i];
        const cost=typeof ch.cost==='function'?ch.cost(g.curEvent.ctx):(ch.cost||0);
        if(cost>0&&g.S.money<cost){ if(ev.onSkip)g.skipEvent(); else g.resolveEvent(0) }
        else g.resolveEvent(i);
      }
    }
    // 该排期就排期
    if(g.curCase)g.confirmHearing();
    // 有空位就接案
    const slots=g.OFFICES[g.S.office].slots;
    if(g.S.active.length<slots&&!g.S.suspendUntil&&g.S.leads.length){
      const cands=g.S.leads.filter(l=>!(g.S.flags.smallOnly&&l.scale!=='small')&&!(g.S.flags.noListed&&l.clientType==='listed'));
      const order={mega:3,major:2,small:1};
      cands.sort((a,b)=>order[b.scale]-order[a.scale]);
      const l=cands[0];
      if(l){
        const idle=g.S.staff.filter(e=>g.free(e));
        const need=g.scaleDefs[l.scale].need;
        if(idle.length>=need){
          doc.__picks=idle.slice(0,need).map(e=>e.id);
          g.openCase(l.id);
          doc.getElementById('caseFee').value=st.plan(l);
          doc.getElementById('caseEffort').value=st.effort(l);
          g.startCase();
          const c=g.S.active[g.S.active.length-1];
          const o=st.order(); if(c&&o)g.setOrder(c.id,o);
        }
      }
    }
    // 有钱就扩张
    const of=g.OFFICES[g.S.office];
    if(of.upgrade&&g.S.money>of.upgrade*2.2)g.upgradeOffice();
    if(g.S.staff.length<g.OFFICES[g.S.office].cap&&g.S.money>3000000&&weeks%13===0){
      g.openRecruit();const c=g.S.candidates&&g.S.candidates[0];
      if(c)g.hire(c.id,Math.round(c.salary*(c.star?3.2:1.6)));
    }
    for(const f of g.facilities)if(!g.S.facilities[f[0]]&&g.S.money>f[3]*3)g.buildFacility(f[0]);
    if(g.S.money<0&&!g.S.loan)g.takeLoan();
    g.tickWeek();weeks++;
  }
  const S=g.S;
  const scores=S.cases.map(c=>c.score);
  const byPlan={};
  S.cases.forEach(c=>{(byPlan[c.feePlan]=byPlan[c.feePlan]||{n:0,paid:0,cost:0,score:0}) ;
    byPlan[c.feePlan].n++;byPlan[c.feePlan].paid+=c.paid;byPlan[c.feePlan].cost+=c.cost;byPlan[c.feePlan].score+=c.score});
  const ending=(S.chron.filter(l=>l.includes('结局：')).pop()||'').split('结局：')[1]||(S.over?'中途出局':'未结束');
  return {weeks,money:S.money,cases:S.cases.length,scores,risk:S.flags.riskPeak||0,endRisk:S.risk,
    prestige:S.prestige,fame:S.fame,buzz:S.buzz,office:S.office,staff:S.staff.length,
    retainers:S.retainers.length,goals:Object.keys(S.goals).length,ach:Object.keys(S.ach).length,
    clients:S.clients.length,clientAssets:S.clients.length?0:0,assets:g.clientTotal(),
    ending:ending.replace('。',''),byPlan,revoked:ending.includes('吊销'),broke:ending.includes('资不抵债'),
    rank:g.industryRank().findIndex(r=>r.name===S.firm)+1};
}

const FEE_NAME={fixed:'固定收费',risk:'风险代理',hourly:'计费小时'};
const fmt=n=>(n>=10000||n<=-10000)?(n/10000).toFixed(0)+'万':Math.round(n);
const pct=(a,b)=>b?((a/b*100).toFixed(0)+'%'):'—';
const med=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;

for(const name of Object.keys(STRATS)){
  const rs=[];
  for(let i=0;i<RUNS;i++)rs.push(runOne(name));
  const allScores=rs.flatMap(r=>r.scores);
  const dist=[0,0,0,0,0]; // <4.5 败 / 4.5-5.5 / 5.5-7 / 7-8.5 / >8.5
  allScores.forEach(s=>{dist[s<4.5?0:s<5.5?1:s<7?2:s<8.5?3:4]++});
  const endings={};rs.forEach(r=>endings[r.ending]=(endings[r.ending]||0)+1);
  const plans={};rs.forEach(r=>Object.entries(r.byPlan).forEach(([k,v])=>{
    const t=plans[k]=plans[k]||{n:0,paid:0,cost:0,score:0};t.n+=v.n;t.paid+=v.paid;t.cost+=v.cost;t.score+=v.score}));
  console.log(`\n══ ${name}（${RUNS} 局）══`);
  console.log(`  活到终局 ${pct(rs.filter(r=>r.weeks>=520).length,RUNS)}　吊销 ${pct(rs.filter(r=>r.revoked).length,RUNS)}　破产 ${pct(rs.filter(r=>r.broke).length,RUNS)}`);
  console.log(`  终局现金 中位 ${fmt(med(rs.map(r=>r.money)))}　最低 ${fmt(Math.min(...rs.map(r=>r.money)))}　最高 ${fmt(Math.max(...rs.map(r=>r.money)))}`);
  console.log(`  办结案件 中位 ${med(rs.map(r=>r.cases))}　声望 ${avg(rs.map(r=>r.prestige)).toFixed(1)}　知名度 ${avg(rs.map(r=>r.fame)).toFixed(1)}　口碑 ${avg(rs.map(r=>r.buzz)).toFixed(0)}`);
  console.log(`  红线峰值 中位 ${med(rs.map(r=>r.risk)).toFixed(0)}　最高 ${Math.max(...rs.map(r=>r.risk)).toFixed(0)}`);
  console.log(`  场地 lv${(avg(rs.map(r=>r.office))+1).toFixed(1)}　团队 ${avg(rs.map(r=>r.staff)).toFixed(0)} 人　常年顾问 ${avg(rs.map(r=>r.retainers)).toFixed(1)} 份　客户资产 ${avg(rs.map(r=>r.assets)).toFixed(0)}`);
  console.log(`  目标 ${avg(rs.map(r=>r.goals)).toFixed(1)}/${7}　成就 ${avg(rs.map(r=>r.ach)).toFixed(1)}/${10}　行业排名 ${avg(rs.map(r=>r.rank)).toFixed(1)}`);
  console.log(`  评级分布  败诉<4.5 ${pct(dist[0],allScores.length)}　4.5-5.5 ${pct(dist[1],allScores.length)}　5.5-7 ${pct(dist[2],allScores.length)}　7-8.5 ${pct(dist[3],allScores.length)}　>8.5 ${pct(dist[4],allScores.length)}`);
  console.log(`  收费方案  `+Object.entries(plans).map(([k,v])=>
    `${FEE_NAME[k]||k}: ${v.n}件 均收 ${fmt(v.paid/v.n)} 均利 ${fmt((v.paid-v.cost)/v.n)} 均分 ${(v.score/v.n).toFixed(1)}`).join('\n            '));
  console.log(`  结局  `+Object.entries(endings).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join('　'));
}
