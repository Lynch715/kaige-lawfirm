// 核心逻辑测试：node tests/game-core.test.mjs
// 在最小 DOM 桩上跑真实的 src/*.js，不改动生产代码。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  ✓ '+name)}else{fail++;console.log('  ✗ '+name+(extra?'  → '+extra:''))}};
const group=n=>console.log('\n'+n);

// ── 最小 DOM / 存储桩 ──────────────────────────────────────
function makeEl(){
  const el={innerHTML:'',textContent:'',value:'',disabled:false,open:false,dataset:{},
    classList:{add(){},remove(){},toggle(){},contains:()=>false},
    addEventListener(){},removeEventListener(){},showModal(){this.open=true},close(){this.open=false},
    querySelectorAll:()=>[],querySelector:()=>null,appendChild(){},remove(){}};
  return el;
}
function makeCtx(){
  const els={},store={};
  const document={
    getElementById(id){return els[id]||(els[id]=makeEl())},
    querySelectorAll:()=>[],querySelector:()=>null,
    addEventListener(){},createElement:()=>makeEl(),body:makeEl()
  };
  const localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
  const ctx={console,Math,Date,JSON,Array,Object,String,Number,Boolean,Error,parseInt,parseFloat,isNaN,
    document,localStorage,navigator:{clipboard:{writeText(){}}},
    setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){},
    confirm:()=>true,alert(){},location:{reload(){}},__store:store};
  ctx.window={addEventListener(){}};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  const code=['src/data.js','src/events.js','src/art.js','src/game.js']
    .map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n;\n');
  // 生产代码用 let/const 声明，在 vm 里不会挂到 globalThis 上。
  // 这里追加一段只在测试里存在的桥接，把需要的符号导出来，不改动 src/。
  const bridge=`
  globalThis.__api={
    get S(){return S}, set S(v){S=v},
    KEY,VERSION,OFFICES,scaleDefs,PHASES,QUALITIES,FEES,EFFORTS,DEPTS,CASE_TYPES,ORIGINS,dailyWork,dailyEstimate,person,resolveEvent,skipEvent,confirmHearing,
    get curEvent(){return curEvent}, get curCase(){return curCase},
    RISK_DECAY,RISK_DECAY_WEEKS,RISK_TIERS,EVENTS,CHAINS,NEWSFEED,ART,roles,GOALS,ACHIEVEMENTS,
    free,pick,clamp,teamOf,
    newGame,tickWeek,closeCase,addRisk,riskTier,addBuzz,
    previewScore,baseScore,scoreRisk,rollScore,verdictText,
    normalize,save,load,hasSave,sceneImg,makeLead,refreshLeads,
    clientTotal,industryRank,checkGoals,checkAchievements,showEnding
  };`;
  vm.runInContext(code+'\n;\n'+bridge,ctx,{filename:'bundle.js'});
  const api=ctx.__api;
  api.__store=store;
  return api;
}

// ── 1. 开局 ────────────────────────────────────────────────
group('开局');
{
  const g=makeCtx();
  g.newGame('spinoff');
  const S=g.S;
  ok('S 建立',!!S);
  ok('起始资金等于开局设定',S.money===g.ORIGINS.spinoff.money,`${S&&S.money} vs ${g.ORIGINS.spinoff.money}`);
  ok('大所出走带 6 人班底',S.staff.length===6,S&&S.staff.length);
  ok('带走一个老客户',S.clients.length===1);
  ok('案源市场有货',S.leads.length>=3,S&&S.leads.length);
  ok('每个人都领到脸',S.staff.every(e=>!!e.face));
  ok('竞业条款生效',S.flags.noListed===2);

  const g2=makeCtx();g2.newGame('three');
  ok('草台班子只有 3 人',g2.S.staff.length===3,g2.S.staff.length);
  ok('前两案限定小案',g2.S.leads.every(l=>l.scale==='small'));
}

// ── 1b. 日常业务收入 ──────────────────────────────────────
group('日常业务');
{
  const g=makeCtx();g.newGame('spinoff');
  const before=g.S.money;
  const got=g.dailyWork();
  ok('闲置律师每周带来零散业务收入',got>0,got);
  ok('钱真的进账了',g.S.money===before+got);
  // 全员进专案组之后就没有零散收入了
  g.S.active.push({id:1,team:g.S.staff.map(e=>e.id),name:'x',quality:{fact:0,law:0,deal:0,work:0},
    type:'contract',dept:'lit',scale:'major',feePlan:'fixed',effort:'normal',phase:0,prog:0,
    weeks:0,cost:0,paidIn:0,fee:1,sat:70,clientName:'x',brief:'',title:''});
  ok('人全在专案里就没有零散收入',g.dailyWork()===0);
  // 停业整顿期间也没有
  g.S.active=[];g.S.suspendUntil=g.S.week+4;
  ok('停业整顿期间没有零散收入',g.dailyWork()===0);
  g.S.suspendUntil=0;
  // 零散业务取「人手」和「案源上限」里的小的那个
  // 人少的时候人手是瓶颈：堆知名度没用
  g.S.staff=g.S.staff.slice(0,2);
  const few=g.dailyWork();
  g.S.fame=40;g.S.prestige=60;
  ok('人手不够时，堆知名度也接不到更多零散活',Math.abs(g.dailyWork()-few)<1,`${few} → ${g.dailyWork()}`);
  // 人多的时候案源是瓶颈：再招人也不涨，但知名度能打开上限
  g.S.fame=1;g.S.prestige=2;                 // 先把案源上限压回开局水平
  while(g.S.staff.length<16)g.S.staff.push(g.person('associate',3));
  const many=g.dailyWork();
  ok('人堆上去之后会被案源上限卡住',g.S.flags.dailyCapped===true);
  const n0=g.S.staff.length;
  for(let i=0;i<6;i++)g.S.staff.push(g.person('associate',3));
  ok('卡住之后再招人也不涨',g.dailyWork()===many,`${n0}人 ${many} → ${g.S.staff.length}人 ${g.dailyWork()}`);
  g.S.fame=80;g.S.office=2;
  ok('但知名度和场地能把案源上限撑开',g.dailyWork()>many*1.5,`${many} → ${g.dailyWork()}`);
}

// ── 2. 长时间推进不炸 ──────────────────────────────────────
group('推进整整十年（520 周）');
{
  const g=makeCtx();g.newGame('spinoff');
  let err=null;
  const fired={};            // 事件 id → 触发次数
  try{
    for(let i=0;i<520;i++){
      // 处理弹出来的事件。不处理的话 curEvent 一直挂着，
      // processEvents 直接返回，后面整局再不会有任何事件——这个测试以前就是这么空跑的。
      let guard=0;
      while(g.curEvent&&guard++<6){
        const ev=g.curEvent.ev;
        fired[ev.id]=(fired[ev.id]||0)+1;
        if(ev.onSkip&&Math.random()<.35)g.skipEvent();
        else g.resolveEvent(Math.floor(Math.random()*ev.choices.length));
      }
      if(g.curCase)g.confirmHearing();
      // 有空位就接一个案子，模拟正常游玩
      if(g.S.active.length<g.OFFICES[g.S.office].slots&&g.S.leads.length&&!g.S.suspendUntil){
        const l=g.S.leads.find(x=>!(g.S.flags.smallOnly&&x.scale!=='small')&&!(g.S.flags.noListed&&x.clientType==='listed'));
        if(l){
          const team=g.S.staff.filter(e=>g.free(e)).slice(0,g.scaleDefs[l.scale].need).map(e=>e.id);
          if(team.length){
            const c={id:g.S.nextId++,name:l.name,title:l.title,brief:l.brief,type:l.type,dept:l.dept,scale:l.scale,
              clientName:l.clientName,clientType:l.clientType,fee:l.fee,feePlan:['fixed','risk','hourly'][i%3],
              effort:'normal',team,phase:0,prog:0,quality:{fact:0,law:0,deal:0,work:0},order:null,rush:0,
              weeks:0,cost:0,paidIn:l.fee*0.5,polish:0,scheduled:true,
              hearing:{w:g.S.week+12,m:6,y:2027,media:1.1,crowd:.6},sat:70,start:g.S.week};
            g.S.active.push(c);g.S.leads=g.S.leads.filter(x=>x.id!==l.id);
          }
        }
      }
      g.tickWeek();
    }
  }catch(e){err=e}
  ok('520 周无异常',!err,err&&err.stack&&err.stack.split('\n').slice(0,2).join(' | '));
  const total=Object.values(fired).reduce((a,b)=>a+b,0);
  const worst=Object.entries(fired).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // 局可能中途结束（破产/吊销），密度断言按实际活了多少周折算
  const lived=g.S.week||1, scale=lived/520;
  ok('事件密度合适（约每 5~6 周一条）',total>=Math.round(55*scale),`${total} 次 / ${lived} 周`);
  ok('事件种类铺得开',Object.keys(fired).length>=Math.round(35*scale),`${Object.keys(fired).length} 种`);
  // 验收标准：一局打完不该被同一条事件反复刷。
  // 链式后果（ch_*）不算——那是玩家自己反复选同一类险招招来的，重复本身就是反馈。
  const rolled=Object.entries(fired).filter(x=>!x[0].startsWith('ch_'));
  const top=rolled.sort((a,b)=>b[1]-a[1]).slice(0,5);
  // 上限只能定到 4：事件按阶段和条件分池，调查取证那一档的有效池只有十来条，
  // 而它是四个阶段里最长的。再往下压就得加事件，不是调参数能解决的。
  ok('随机事件不会被刷到第五次',rolled.every(x=>x[1]<=4),top.map(x=>x[0]+'×'+x[1]).join(' '));
  const heavy=rolled.filter(x=>x[1]>=3).length;
  ok('撞见三次的事件不超过两成',heavy<=rolled.length*.2,`${heavy}/${rolled.length}`);
  ok('绝大多数事件一局只见一两次',rolled.filter(x=>x[1]<=2).length>=rolled.length*.8);
  ok('确实结了案',g.S.cases.length>0,g.S.cases.length);
  ok('每个结案都有评级和结果',g.S.cases.every(c=>typeof c.score==='number'&&!!c.verdict));
  ok('评级不越规模上限',g.S.cases.every(c=>c.score<=g.scaleDefs[c.scale].cap+1e-9));
  ok('编年史有内容',g.S.chron.length>0);
}

// ── 3. 三种收费方案的回款方向 ──────────────────────────────
group('收费方案');
{
  const g=makeCtx();g.newGame('spinoff');
  const mk=(plan,q)=>({id:g.S.nextId++,name:'测试案',title:'测试',brief:'',type:'contract',dept:'lit',scale:'major',
    clientName:'测试公司',clientType:'sme',fee:1000000,feePlan:plan,effort:'normal',
    team:g.S.staff.slice(0,3).map(e=>e.id),phase:3,prog:100,quality:{fact:q,law:q,deal:q,work:q},
    order:null,rush:0,weeks:18,cost:200000,paidIn:0,polish:0,scheduled:true,
    hearing:{w:0,m:3,y:2027,media:1,crowd:.15},sat:70,start:0});

  const run=(plan,q)=>{
    const before=g.S.money,c=mk(plan,q);g.S.active.push(c);g.closeCase(c);
    return {paid:c.paidIn,score:c.score,delta:g.S.money-before};
  };
  // 风险代理：高分远高于低分
  const rHigh=run('risk',95),rLow=run('risk',8);
  ok('风险代理 高分回款 > 低分回款',rHigh.paid>rLow.paid,`${Math.round(rHigh.paid)} vs ${Math.round(rLow.paid)}`);
  ok('风险代理 败诉几乎没钱',rLow.paid<200000,Math.round(rLow.paid));
  // 固定收费：高低分差距小
  const fHigh=run('fixed',95),fLow=run('fixed',8);
  const spreadFixed=fHigh.paid-fLow.paid,spreadRisk=rHigh.paid-rLow.paid;
  ok('固定收费对结果不敏感（差距小于风险代理）',spreadFixed<spreadRisk,`${Math.round(spreadFixed)} vs ${Math.round(spreadRisk)}`);
  ok('固定收费 败诉也有尾款',fLow.paid>0);
  // 计费小时尾款存在
  const hRes=run('hourly',60);
  ok('计费小时 结案有尾款',hRes.paid>0);
}

// ── 4. 执业红线 ────────────────────────────────────────────
group('执业红线');
{
  const g=makeCtx();g.newGame('spinoff');
  g.addRisk(45,'测试');
  ok('40 档位判定正确',g.riskTier()[1]==='已被提示',g.riskTier()[1]);
  g.addRisk(25,'测试');
  ok('65 档位判定正确',g.riskTier()[1]==='被投诉',g.riskTier()[1]);
  // 合规风控岗打 0.65 折
  const g2=makeCtx();g2.newGame('spinoff');
  g2.S.facilities.risk=1;g2.addRisk(20,'测试');
  ok('合规风控岗把涨幅压到 0.65',Math.abs(g2.S.risk-13)<0.01,g2.S.risk);
  // 自然回落
  const g3=makeCtx();g3.newGame('spinoff');
  g3.addRisk(30,'测试');const before=g3.S.risk;
  g3.S.week=g3.RISK_DECAY_WEEKS-1;g3.tickWeek();
  ok('每 13 周自然回落',g3.S.risk===before-g3.RISK_DECAY,`${before} → ${g3.S.risk}`);
  // 爆表 = 吊销
  const g4=makeCtx();g4.newGame('spinoff');
  g4.addRisk(100,'测试');
  ok('红线满 100 直接结束',g4.S.over===true);
}

// ── 5. 预估区间与真实评级 ──────────────────────────────────
group('结案评级');
{
  const g=makeCtx();g.newGame('spinoff');
  const c={id:1,name:'测试',type:'contract',dept:'lit',scale:'major',feePlan:'fixed',effort:'normal',
    team:g.S.staff.slice(0,3).map(e=>e.id),phase:2,prog:0,quality:{fact:70,law:70,deal:70,work:70},
    polish:0,weeks:10,cost:0,paidIn:0,hearing:null,sat:70,clientName:'x',clientType:'sme',fee:1,brief:'',title:''};
  const pv=g.previewScore(c),base=g.baseScore(c);
  ok('预估区间包住基准分',pv.lo<=base&&base<=pv.hi,`${pv.lo.toFixed(2)} / ${base.toFixed(2)} / ${pv.hi.toFixed(2)}`);
  ok('把握度有文案',['有把握','说不太准','心里没底','纯属赌博'].includes(pv.label),pv.label);
  // 补强能收窄区间
  const s0=g.scoreRisk(c);c.polish=2;const s1=g.scoreRisk(c);
  ok('补强收窄区间',s1<s0,`${s0.toFixed(2)} → ${s1.toFixed(2)}`);
  // 小所硬接长期项目，区间变宽
  const c2={...c,scale:'mega',polish:0};
  ok('小所接大案区间更宽',g.scoreRisk(c2)>s0,`${g.scoreRisk(c2).toFixed(2)} vs ${s0.toFixed(2)}`);
  // 四维全满 → 高分档；全 0 → 低分档
  const hi={...c,quality:{fact:100,law:100,deal:100,work:100}};
  const lo={...c,quality:{fact:0,law:0,deal:0,work:0}};
  ok('满维评级高于空维',g.baseScore(hi)>g.baseScore(lo)+4);
  ok('判决文案随分数变',g.verdictText(9,true)!==g.verdictText(3,true));
}

// ── 6. 存档迁移 ────────────────────────────────────────────
group('存档');
{
  const g=makeCtx();g.newGame('spinoff');
  g.S.week=40;g.save();
  const raw=JSON.parse(g.__store[g.KEY]);
  ok('存档写进去了',raw&&raw.v===g.VERSION&&raw.S.week===40);
  // 缺字段的旧档
  const old=JSON.parse(JSON.stringify(raw.S));
  delete old.retainers;delete old.risk;delete old.buzzLog;delete old.clientAssets;
  const fixed=g.normalize(old);
  ok('normalize 补齐 retainers',Array.isArray(fixed.retainers));
  ok('normalize 补齐 risk',fixed.risk===0);
  ok('normalize 补齐 clientAssets',fixed.clientAssets&&fixed.clientAssets.sme===0);
  ok('normalize 不动已有字段',fixed.week===40);
  // 在旧档上继续推进
  let err=null;try{g.S=fixed;for(let i=0;i<20;i++)g.tickWeek()}catch(e){err=e}
  ok('旧档能继续玩',!err,err&&err.message);
}

// ── 7. 事件库自检 ──────────────────────────────────────────
group('事件库');
{
  const g=makeCtx();g.newGame('spinoff');
  const ids=g.EVENTS.map(e=>e.id);
  ok('事件 id 不重复',new Set(ids).size===ids.length);
  ok('每条事件至少两个选项',g.EVENTS.every(e=>e.choices&&e.choices.length>=2));
  ok('四个阶段都有事件',[0,1,2,3].every(p=>g.EVENTS.some(e=>e.tier==='case'&&e.phase===p)));
  ok('案件事件每阶段 ≥5 条',[0,1,2,3].every(p=>g.EVENTS.filter(e=>e.tier==='case'&&e.phase===p).length>=5));
  ok('有律所事件和人物事件',g.EVENTS.some(e=>e.tier==='firm')&&g.EVENTS.some(e=>e.tier==='person'));
  ok('链式后果齐全',['evidence','promise','overwork'].every(k=>!!g.CHAINS[k]));
  ok('行业新闻 ≥12 条',g.NEWSFEED.length>=12,g.NEWSFEED.length);
  // 每条事件的 apply 都能在真实案件上跑一遍
  const c=g.S.active[0]||{id:99,name:'测试',type:'contract',dept:'lit',scale:'major',
    team:g.S.staff.slice(0,3).map(e=>e.id),quality:{fact:50,law:50,deal:50,work:50},
    weeks:5,cost:0,paidIn:0,fee:500000,feePlan:'fixed',sat:70,clientName:'测试公司',phase:0};
  let bad=[];
  g.EVENTS.concat(Object.values(g.CHAINS)).forEach(ev=>{
    ev.choices.forEach((ch,i)=>{
      try{
        const ctx={c,p:c,e:g.S.staff[0]};
        if(typeof ch.label==='function')ch.label(ctx);
        if(typeof ch.note==='function')ch.note(ctx);
        if(typeof ch.cost==='function')ch.cost(ctx);
        if(typeof ev.text==='function')ev.text(ctx);
        if(ch.apply)ch.apply(ctx);
      }catch(e){bad.push(ev.id+'#'+i+': '+e.message)}
    });
    try{if(ev.onSkip)ev.onSkip({c,p:c,e:g.S.staff[0]})}catch(e){bad.push(ev.id+'#skip: '+e.message)}
  });
  ok('所有选项 apply / onSkip 都能跑',bad.length===0,bad.slice(0,3).join(' ;; '));
}

// ── 8. 美术降级 ────────────────────────────────────────────
group('美术层');
{
  const g=makeCtx();g.newGame('spinoff');
  ok('立绘清单覆盖所有岗位',Object.keys(g.roles).every(r=>g.ART.portraitCount[r]>0));
  ok('场景清单 16 张',g.ART.scenes.length===16,g.ART.scenes.length);
  ok('氛围图 8 张',g.ART.moods.length===8,g.ART.moods.length);
  ok('事件 mood 都在清单里',g.EVENTS.filter(e=>e.mood).every(e=>g.ART.moods.includes(e.mood)||g.ART.scenes.includes(e.mood)),
     g.EVENTS.filter(e=>e.mood&&!g.ART.moods.includes(e.mood)&&!g.ART.scenes.includes(e.mood)).map(e=>e.id).join(','));
  ok('缺图时 sceneImg 仍返回可降级的标签',g.sceneImg('office-lv1').includes('onerror'));

  // 文件名打错的话，游戏会静默降级成纯 CSS，页面上什么都不说。
  // 所以这里反过来查：assets 里真实存在的文件，名字必须都在清单里。
  const legal=new Set([
    ...g.ART.scenes,
    ...g.ART.moods.map(m=>'mood-'+m)
  ]);
  const sceneDir=path.join(ROOT,'assets/scene');
  const onDisk=fs.existsSync(sceneDir)?fs.readdirSync(sceneDir).filter(f=>f.endsWith('.webp')):[];
  const strays=onDisk.map(f=>f.replace(/\.webp$/,'')).filter(n=>!legal.has(n));
  ok('assets/scene 里没有清单外的文件名（打错名字游戏会静默不用）',strays.length===0,strays.join(','));

  const portDir=path.join(ROOT,'assets/portrait');
  const ports=fs.existsSync(portDir)?fs.readdirSync(portDir).filter(f=>f.endsWith('.webp')):[];
  const badPort=ports.filter(f=>{
    const m=f.match(/^([a-z]+)-(\d{2})\.webp$/);
    if(!m)return true;
    const n=g.ART.portraitCount[m[1]];
    return !n||+m[2]<1||+m[2]>n;          // 编号超出 portraitCount 的也取不到
  });
  ok('assets/portrait 的文件名和编号都在 portraitCount 范围内',badPort.length===0,badPort.join(','));

  // 反方向：portraitCount 说有几张，就得真有几张。
  // 先改数字后放图的话，pickFace 会抽到不存在的文件，静默退成色块，页面上什么都不提示。
  const have=new Set(ports);
  const promised=[];
  for(const role in g.ART.portraitCount)
    for(let i=1;i<=g.ART.portraitCount[role];i++){
      const f=`${role}-${String(i).padStart(2,'0')}.webp`;
      if(!have.has(f))promised.push(f);
    }
  ok('portraitCount 声明的立绘文件都真的存在',promised.length===0,promised.join(','));

  // 立绘尺寸也得对，否则头像和事件弹窗里会被拉变形
  const badSize=[];
  for(const f of ports){
    const buf=fs.readFileSync(path.join(portDir,f));
    const i=buf.indexOf(Buffer.from('VP8 '));
    if(i<0)continue;
    const w=buf.readUInt16LE(i+14)&0x3fff,h=buf.readUInt16LE(i+16)&0x3fff;
    if(w!==512||h!==640)badSize.push(`${f} ${w}x${h}`);
  }
  ok('立绘尺寸都是 512×640',badSize.length===0,badSize.join(' | '));
  const bigPort=ports.filter(f=>fs.statSync(path.join(portDir,f)).size>71680);
  ok('立绘单张不超过 70KB',bigPort.length===0,bigPort.join(','));

  // 头像缩略图：换了立绘忘了重跑 tools/make-thumbs.py 的话，首屏会白下载 5 倍数据
  const thumbDir=path.join(portDir,'s');
  const thumbs=fs.existsSync(thumbDir)?fs.readdirSync(thumbDir).filter(f=>f.endsWith('.webp')):[];
  const tset=new Set(thumbs);
  const missThumb=ports.filter(f=>!tset.has(f));
  const orphanThumb=thumbs.filter(f=>!have.has(f));
  ok('每张立绘都有对应的头像缩略图',missThumb.length===0,missThumb.join(',')+'（跑 python3 tools/make-thumbs.py）');
  ok('缩略图没有对不上原图的孤儿',orphanThumb.length===0,orphanThumb.join(','));

  const staleThumb=ports.filter(f=>tset.has(f)&&
    fs.statSync(path.join(thumbDir,f)).mtimeMs<fs.statSync(path.join(portDir,f)).mtimeMs);
  ok('缩略图不比原图旧（换了图要重新生成）',staleThumb.length===0,staleThumb.join(',')+'（跑 python3 tools/make-thumbs.py）');

  const badThumb=[];
  for(const f of thumbs){
    const buf=fs.readFileSync(path.join(thumbDir,f));
    const i=buf.indexOf(Buffer.from('VP8 '));
    if(i<0)continue;
    const w=buf.readUInt16LE(i+14)&0x3fff,h=buf.readUInt16LE(i+16)&0x3fff;
    if(w!==128||h!==160)badThumb.push(`${f} ${w}x${h}`);
  }
  ok('缩略图尺寸都是 128×160',badThumb.length===0,badThumb.join(' | '));

  const thumbKB=thumbs.reduce((a,f)=>a+fs.statSync(path.join(thumbDir,f)).size,0)/1024;
  ok('全部缩略图加起来不超过 120KB',thumbKB<=120,Math.round(thumbKB)+'KB');

  // 已出的图必须符合尺寸规范，否则会被拉伸
  const sizes=[];
  for(const f of onDisk){
    const buf=fs.readFileSync(path.join(sceneDir,f));
    const i=buf.indexOf(Buffer.from('VP8 '));        // 简单 VP8 头解析
    if(i<0)continue;
    const w=buf.readUInt16LE(i+14)&0x3fff,h=buf.readUInt16LE(i+16)&0x3fff;
    const isMood=f.startsWith('mood-');
    const want=isMood?[960,540]:[1280,720];
    if(w!==want[0]||h!==want[1])sizes.push(`${f} ${w}x${h}`);
  }
  ok('场景图尺寸都是 1280×720（氛围图 960×540）',sizes.length===0,sizes.join(' | '));

  const tooBig=onDisk.filter(f=>fs.statSync(path.join(sceneDir,f)).size>92160);
  ok('场景图单张不超过 90KB',tooBig.length===0,tooBig.join(','));
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
