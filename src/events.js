'use strict';
// ── 事件库 ────────────────────────────────────────────────────
// tier: case(绑在案件，phase 限定阶段，null=任意) / firm(律所) / person(人物)
// cond(x) 决定能否触发，x = {c:案件, e:律师}
// choices[].cost 正数花钱，负数进账；choices[].risk 给执业红线加的点数
// mood 决定用哪张氛围图（assets/scene/mood-*.webp）
const Q=(c,k,n)=>addQ(c,k,n);   // 软上限逻辑见 game.js 的 addQ
const EN=(list,n)=>list.forEach(e=>e.energy=Math.max(0,Math.min(100,e.energy+n)));
const TEAM=c=>teamOf(c);

const EVENTS=[
// ═══ 接案与方案（phase 0）═══
{id:'c0_conflict',tier:'case',phase:0,mood:'night',weight:10,cooldown:40,
 title:'冲突检索跳出来一条',
 text:x=>`《${x.c.name}》做利益冲突检索，跳出来一条：三年前所里给对方的关联公司出过一份法律意见书。严格说，这构成冲突。`,
 choices:[
  {label:'如实披露，请客户书面确认',cost:0,note:'博弈 -4，但记录干净',
   apply:x=>{Q(x.c,'deal',-4);addNews('执业','按规定披露了冲突，客户签了知情同意。')}},
  {label:'让助理把这条从检索报告里删掉',risk:15,note:'博弈 +6 · 这事会留在档案里',
   apply:x=>{Q(x.c,'deal',6);addNews('执业','冲突检索报告"没有发现冲突"。')}}],
 onSkip:x=>{Q(x.c,'deal',-2);addNews('执业','冲突的事先搁着，没人再提。')}},

{id:'c0_promise',tier:'case',phase:0,mood:'sign',weight:10,cooldown:36,
 title:'客户问：能赢吗',
 text:x=>`签协议前，${x.c.clientName}的人把笔停在半空："你就告诉我一句话，这案子能不能赢。"`,
 choices:[
  {label:'实话实说：有把握的部分和没把握的部分都讲',note:'博弈 -3，客户满意度更稳',
   apply:x=>{Q(x.c,'deal',-3);x.c.sat=Math.min(100,(x.c.sat||70)+6)}},
  {label:'拍胸脯：这个案子没问题',risk:12,note:'博弈 +9 · 结果不及预期会翻脸',
   apply:x=>{Q(x.c,'deal',9);queueChain('promise',x.c);addNews('接案','跟客户把话说满了。')}}],
 onSkip:x=>{x.c.sat=Math.min(100,(x.c.sat||70)-3)}},

{id:'c0_missing',tier:'case',phase:0,mood:'night',weight:9,cooldown:34,
 title:'关键合同不见了',
 text:x=>`《${x.c.name}》的材料摊了一桌，独独少了最关键的那份补充协议。客户说："原件找不到了，要不我们再补一份，日期往前写。"`,
 choices:[
  {label:'不补。走证据补强，另找旁证',cost:60000,note:'事实 +7',
   apply:x=>{Q(x.c,'fact',7);addNews('取证','转而收集了一批旁证。')}},
  {label:'让客户"补"一份',risk:20,note:'事实 +12 · 这条链子随时可能断',
   apply:x=>{Q(x.c,'fact',12);queueChain('evidence',x.c)}}],
 onSkip:x=>{Q(x.c,'fact',-3)}},

{id:'c0_route',tier:'case',phase:0,mood:'meeting',weight:9,cooldown:30,
 title:'方案会上分成两派',
 text:x=>`《${x.c.name}》的方案会开成了辩论会。一派主张稳扎稳打按主流观点走，一派要先提管辖异议拖三个月、把对方拖软。`,
 choices:[
  {label:'稳扎稳打',note:'法理 +7 · 交付 +3',
   apply:x=>{Q(x.c,'law',7);Q(x.c,'work',3)}},
  {label:'先提管辖异议',note:'博弈 +10 · 事实 -3 · 多耗时间',
   apply:x=>{Q(x.c,'deal',10);Q(x.c,'fact',-3);x.c.weeks+=1;addNews('办案',`《${x.c.name}》先打了一轮管辖。`)}}],
 onSkip:x=>addNews('办案',`《${x.c.name}》的方案争到最后没人拍板，按原稿走。`)},

{id:'c0_fee',tier:'case',phase:0,mood:'sign',weight:8,cooldown:44,
 cond:x=>x.c.feePlan==='fixed',
 title:'客户想改成风险代理',
 text:x=>`${x.c.clientName}打来电话："固定收费我先付了七成，心里不踏实。能不能改成打赢了再多给？"`,
 choices:[
  {label:'不改，合同就是合同',note:'博弈 -4',
   apply:x=>{Q(x.c,'deal',-4)}},
  {label:'退回一半预收款，换成后端分成',cost:x=>x.c.fee*0.35,note:'博弈 +8 · 押在结果上',
   apply:x=>{x.c.feePlan='risk';x.c.paidIn-=x.c.fee*0.35;Q(x.c,'deal',8);
     addNews('接案',`《${x.c.name}》改成了风险代理。`)}}],
 onSkip:x=>{x.c.sat=Math.min(100,(x.c.sat||70)-4)}},

// ═══ 调查取证（phase 1）═══
{id:'c1_witness',tier:'case',phase:1,mood:'night',weight:10,cooldown:34,
 title:'证人愿意来，但开口要钱',
 text:x=>`《${x.c.name}》唯一能说清那天现场情况的人找到了。他说他愿意作证，"但我得请三天假，你们看着办"。`,
 choices:[
  {label:'只付误工和交通，开票据',cost:8000,note:'事实 +6',
   apply:x=>{Q(x.c,'fact',6)}},
  {label:'给他一笔，让他把话说得更到位',cost:50000,risk:16,note:'事实 +13 · 证言可信度是个雷',
   apply:x=>{Q(x.c,'fact',13);queueChain('evidence',x.c)}}],
 onSkip:x=>{Q(x.c,'fact',-4);addNews('取证','证人最后没来。')}},

{id:'c1_record',tier:'case',phase:1,mood:'night',weight:9,cooldown:32,
 title:'那段录音是偷录的',
 text:x=>`客户交上来一段录音，对方在里面亲口承认了。问题是，这是在人家办公室里偷录的。`,
 choices:[
  {label:'评估合法性，能用就用，不能用就放弃',cost:14000,note:'法理 +6 · 事实 +4',
   apply:x=>{Q(x.c,'law',6);Q(x.c,'fact',4)}},
  {label:'直接当证据提交，赌法官不细究',risk:10,note:'事实 +10 · 可能被当庭排除',
   apply:x=>{Q(x.c,'fact',10);queueChain('evidence',x.c)}}],
 onSkip:x=>{Q(x.c,'law',2)}},

{id:'c1_insider',tier:'case',phase:1,mood:'rain',weight:8,cooldown:40,
 title:'对方公司有人来递材料',
 text:x=>`一个自称对方公司前员工的人约在楼下咖啡馆，带来一摞内部邮件打印件。他不肯说怎么拿到的，也不留联系方式。`,
 choices:[
  {label:'不收。来源不明的东西不进案卷',note:'交付 +5',
   apply:x=>{Q(x.c,'work',5);addNews('取证','谢绝了一份来路不明的材料。')}},
  {label:'收下，想办法做成合法来源',risk:18,note:'事实 +15 · 来源迟早要被问',
   apply:x=>{Q(x.c,'fact',15);queueChain('evidence',x.c)}}],
 onSkip:x=>addNews('取证','那个人没再出现。')},

{id:'c1_expert',tier:'case',phase:1,mood:'night',weight:9,cooldown:30,
 title:'鉴定机构排到三个月后',
 text:x=>`《${x.c.name}》要做一份司法鉴定，机构说最快也得排到三个月后。`,
 choices:[
  {label:'等',note:'多耗两周，法理 +4',
   apply:x=>{x.c.weeks+=2;Q(x.c,'law',4)}},
  {label:'加急费插队',cost:95000,note:'事实 +9 · 不耽误排期',
   apply:x=>{Q(x.c,'fact',9)}},
  {label:'换一家出得快的机构',cost:26000,risk:8,note:'事实 +6 · 这家的报告对方肯定要质疑',
   apply:x=>{Q(x.c,'fact',6)}}],
 onSkip:x=>{x.c.weeks+=2}},

{id:'c1_oversea',tier:'case',phase:1,mood:'empty',weight:7,cooldown:46,
 title:'关键证据在境外',
 text:x=>`最关键的那份文件在境外，要用就得走公证认证，一来一回六周起步。`,
 choices:[
  {label:'走完整流程',cost:58000,note:'事实 +8 · 交付 +5 · 多耗三周',
   apply:x=>{Q(x.c,'fact',8);Q(x.c,'work',5);x.c.weeks+=3}},
  {label:'先用复印件，认证件后补',risk:9,note:'事实 +5 · 对方一定会打形式要件',
   apply:x=>{Q(x.c,'fact',5)}}],
 onSkip:x=>{Q(x.c,'fact',-5)}},

// ═══ 论证与主攻（phase 2）═══
{id:'c2_settle',tier:'case',phase:2,mood:'mediation',weight:11,cooldown:28,
 title:'对方提出庭前和解',
 text:x=>`开庭前十天，对方律师约了一次。开的数字是预期的六成，但下周就能到账。`,
 choices:[
  {label:'接受和解',note:'立刻结案，评级封在 6.5 上下',
   apply:x=>{Q(x.c,'deal',20);Q(x.c,'law',8);Q(x.c,'fact',6);Q(x.c,'work',10);
     x.c.settled=true;addNews('和解',`《${x.c.name}》庭前和解，钱下周到账。`)}},
  {label:'不接。开庭',note:'博弈 +6 · 结果全押在庭上',
   apply:x=>{Q(x.c,'deal',6);addNews('办案',`《${x.c.name}》拒绝和解，坚持开庭。`)}}],
 onSkip:x=>{Q(x.c,'deal',2)}},

{id:'c2_judge',tier:'case',phase:2,mood:'mediation',weight:9,cooldown:36,
 title:'法官在电话里暗示调解',
 text:x=>`承办法官打来电话，话说得很客气，意思很清楚：这案子最好调了。`,
 choices:[
  {label:'配合，把调解方案做扎实',note:'交付 +9 · 博弈 +5',
   apply:x=>{Q(x.c,'work',9);Q(x.c,'deal',5)}},
  {label:'明确表示当事人要判决',note:'法理 +8 · 排期可能往后拖',
   apply:x=>{Q(x.c,'law',8);if(Math.random()<.4){x.c.weeks+=2;addNews('排期',`《${x.c.name}》的开庭往后挪了。`)}}},
  {label:'托人问问法官的倾向',cost:65000,risk:22,note:'博弈 +14 · 这条线碰不得',
   apply:x=>{Q(x.c,'deal',14)}}],
 onSkip:x=>{Q(x.c,'work',3)}},

{id:'c2_memo',tier:'case',phase:2,mood:'night',weight:9,cooldown:30,
 title:'检索报告里有个硬伤',
 text:x=>{const t=TEAM(x.c),who=t[t.length-1];return `开庭前复核，发现${who?who.name:'助理'}引的那个指导案例，去年已经被新的司法解释覆盖了。整份论证得重来。`},
 choices:[
  {label:'连夜重做',note:'法理 +10 · 全组体力 -8',
   apply:x=>{Q(x.c,'law',10);EN(TEAM(x.c),-8)}},
  {label:'外聘一位学者出意见书',cost:115000,note:'法理 +14',
   apply:x=>{Q(x.c,'law',14);addNews('办案',`《${x.c.name}》请了一位学者出专家意见。`)}},
  {label:'把那段删掉，不提了',note:'法理 +2',
   apply:x=>{Q(x.c,'law',2)}}],
 onSkip:x=>{Q(x.c,'law',-6);addNews('办案','那处硬伤没人再去碰。')}},

{id:'c2_rival',tier:'case',phase:2,mood:'press',weight:8,cooldown:38,
 title:'对方换律师了',
 text:x=>{const r=pick(S.rivals);return `开庭前两周，对方换了代理人——${r.name}的人接了。这家在庭上出了名的不好对付。`},
 choices:[
  {label:'加派一名资深律师上庭',cost:80000,note:'法理 +8 · 博弈 +6',
   apply:x=>{Q(x.c,'law',8);Q(x.c,'deal',6)}},
  {label:'做三轮模拟法庭',note:'博弈 +11 · 全组体力 -10',
   apply:x=>{Q(x.c,'deal',11);EN(TEAM(x.c),-10)}},
  {label:'按原计划，不慌',note:'不花钱不掉血',
   apply:x=>{}}],
 onSkip:x=>{Q(x.c,'deal',-4)}},

{id:'c2_media',tier:'case',phase:2,mood:'press',weight:7,cooldown:42,
 title:'记者想跟这个案子',
 text:x=>`一家法治媒体想跟《${x.c.name}》，说这个案子有公共讨论价值，愿意做成系列报道。`,
 choices:[
  {label:'配合采访，但只谈法律问题',note:'社会知名度 +1.2 · 口碑 +5',
   apply:x=>{S.fame+=1.2;addBuzz(5);addNews('媒体',`《${x.c.name}》被媒体跟进报道。`)}},
  {label:'放开谈，把案情细节也给了',risk:14,note:'知名度 +3 · 口碑 +9 · 泄露当事人信息是有责任的',
   apply:x=>{S.fame+=3;addBuzz(9);addNews('媒体',`《${x.c.name}》的报道传得很开，细节也全出去了。`)}},
  {label:'谢绝',note:'当事人更放心',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+5)}}],
 onSkip:x=>{}},

// ═══ 收尾交付（phase 3）═══
{id:'c3_typo',tier:'case',phase:3,mood:'night',weight:9,cooldown:32,
 title:'已经送出去的文书里有个笔误',
 text:x=>`《${x.c.name}》的代理词已经递上去了，晚上有人发现第 7 页把一个关键数字写错了一位。`,
 choices:[
  {label:'第二天一早提交更正说明',note:'交付 +6 · 不丢人',
   apply:x=>{Q(x.c,'work',6)}},
  {label:'不提，赌没人看那页',risk:6,note:'交付 -5 · 被对方抓到就很难看',
   apply:x=>{Q(x.c,'work',-5);if(Math.random()<.35){Q(x.c,'law',-8);addNews('办案','对方当庭指出了那个数字。')}}}],
 onSkip:x=>{Q(x.c,'work',-4)}},

{id:'c3_unpaid',tier:'case',phase:3,mood:'empty',weight:9,cooldown:36,
 title:'客户开始拖尾款',
 text:x=>`案子快收尾了，${x.c.clientName}的财务换了个说法："走流程，这个月肯定不行。"`,
 choices:[
  {label:'按合同发函，该催催',note:'交付 +4 · 客户满意度 -8',
   apply:x=>{Q(x.c,'work',4);x.c.sat=Math.max(0,(x.c.sat||70)-8)}},
  {label:'先垫着，把案子办完再说',cost:x=>x.c.fee*0.08,note:'客户满意度 +10',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+10);x.c.cost+=x.c.fee*0.08}},
  {label:'扣着卷宗不交',risk:13,note:'博弈 +6 · 这是会被投诉的',
   apply:x=>{Q(x.c,'deal',6);x.c.sat=Math.max(0,(x.c.sat||70)-15)}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-5)}},

{id:'c3_lastmin',tier:'case',phase:3,mood:'meeting',weight:9,cooldown:34,
 cond:x=>!DEPTS[x.c.dept].court,
 title:'交割前最后一刻，对方加条件',
 text:x=>`所有文件都摆好了，对方在签字桌上又提了一条：业绩对赌的期限要从三年改成五年。`,
 choices:[
  {label:'顶回去，按原条款签',note:'博弈 +9 · 可能谈崩',
   apply:x=>{Q(x.c,'deal',9);if(Math.random()<.22){Q(x.c,'work',-10);addNews('交易','签字桌上僵了两个小时。')}}},
  {label:'换一个条件换回来',note:'博弈 +6 · 交付 +5',
   apply:x=>{Q(x.c,'deal',6);Q(x.c,'work',5)}},
  {label:'让步，先把字签了',note:'交付 +8 · 客户满意度 -6',
   apply:x=>{Q(x.c,'work',8);x.c.sat=Math.max(0,(x.c.sat||70)-6)}}],
 onSkip:x=>{Q(x.c,'work',-5)}},

{id:'c3_hide',tier:'case',phase:3,mood:'rain',weight:8,cooldown:38,
 cond:x=>DEPTS[x.c.dept].court,
 title:'对方在转移财产',
 text:x=>`判决还没下，风声先到了：对方这两周连着办了三笔股权转让，收款账户也换了。`,
 choices:[
  {label:'立刻申请财产保全',cost:x=>x.c.fee*0.12,note:'交付 +12 · 保全费自己垫',
   apply:x=>{Q(x.c,'work',12);x.c.cost+=x.c.fee*0.12;addNews('办案',`《${x.c.name}》紧急申请了财产保全。`)}},
  {label:'提醒客户，让客户自己决定',note:'交付 +3',
   apply:x=>{Q(x.c,'work',3)}}],
 onSkip:x=>{Q(x.c,'work',-6);addNews('办案','等判决下来，对方名下已经干干净净。')}},

{id:'c3_appeal',tier:'case',phase:3,mood:'hallway',weight:8,cooldown:40,
 cond:x=>DEPTS[x.c.dept].court,
 title:'对方放话要上诉',
 text:x=>`对方代理人在走廊上撂了句话："一审怎么判无所谓，我们肯定上诉。"客户问你要不要继续代理二审。`,
 choices:[
  {label:'现在就把二审的代理协议签了',note:'博弈 +7 · 结案后多一笔收入',
   apply:x=>{Q(x.c,'deal',7);S.money+=x.c.fee*0.3;addNews('接案',`《${x.c.name}》的二审代理协议提前签了。`)}},
  {label:'等一审结果再说',note:'法理 +5',
   apply:x=>{Q(x.c,'law',5)}}],
 onSkip:x=>{}},

// ═══ 律所经营 ═══
{id:'f_poach',tier:'firm',mood:'press',weight:9,cooldown:40,
 cond:x=>S.staff.length>2,
 title:'有人来挖人',
 text:x=>{const e=pick(S.staff),r=pick(S.rivals);return `${r.name}找了${e.name}两次了。开的条件比这边高四成，还许了一个团队。`},
 choices:[
  {label:'加薪留人',cost:0,note:'那个人月薪 +25%',
   apply:x=>{const e=pick(S.staff);e.salary=Math.round(e.salary*1.25);addNews('团队',`给${e.name}加了薪，人留下了。`)}},
  {label:'给分红，绑长期',cost:130000,note:'留人，口碑 +4',
   apply:x=>{addBuzz(4);addNews('团队','把分红方案摆上桌，人心稳了些。')}},
  {label:'留不住就算了',note:'可能走人',
   apply:x=>{if(S.staff.length>2&&Math.random()<.55){const e=pick(S.staff.filter(free));
     if(e){S.staff=S.staff.filter(y=>y.id!==e.id);addBuzz(-4);
       addNews('团队',`${e.name}离所，去了对家。`);chron(`${e.name}被挖走。`)}}}}],
 onSkip:x=>{}},

{id:'f_inspect',tier:'firm',mood:'meeting',weight:8,cooldown:52,
 title:'司法局来所里做执业检查',
 text:x=>`例行检查，看归档、看收费、看冲突检索记录。带队的那位翻得很细。`,
 choices:[
  {label:'配合，该补的补',cost:40000,note:'执业红线 -8',
   apply:x=>{addRisk(-8);addNews('司法局','检查通过，整改意见当场签收。')}},
  {label:'把该藏的先收起来',risk:10,note:'省事，但记录更花',
   apply:x=>{addNews('司法局','检查走了个过场。')}}],
 onSkip:x=>{addRisk(4);addNews('司法局','检查发现几处归档问题，记在了案上。')}},

{id:'f_kickback',tier:'firm',mood:'sign',weight:7,cooldown:60,
 title:'老客户介绍生意，但要回扣',
 text:x=>`一个老关系介绍了个大活，条件是律师费到账后返他一成五，"走咨询费就行"。`,
 choices:[
  {label:'谢了，但这种不接',note:'声望 +1',
   apply:x=>{S.prestige+=1;addNews('案源','回绝了一笔带回扣的介绍。')}},
  {label:'接，按他说的走账',cost:-500000,risk:20,note:'进账 50 万 · 这笔钱有味道',
   apply:x=>{addNews('案源','那笔介绍来的活接了，钱也返了。')}}],
 onSkip:x=>{}},

{id:'f_famous',tier:'firm',mood:'press',weight:7,cooldown:48,
 title:'一个明显赢不了的案子',
 text:x=>`有人找上门，案子本身几乎没有胜算，但社会关注度极高，做了整个行业都会知道你们。`,
 choices:[
  {label:'接，当公益案件做',cost:95000,note:'声望 +3 · 知名度 +2.5 · 口碑 +10',
   apply:x=>{S.prestige+=3;S.fame+=2.5;addBuzz(10);chron('接了一个明知赢不了的案子。')}},
  {label:'不接，律所不是做慈善的',note:'什么也没发生',
   apply:x=>{}}],
 onSkip:x=>{}},

// ═══ 人物 ═══
{id:'p_study',tier:'person',mood:'night',weight:8,cooldown:44,
 title:'想去读在职法硕',
 text:x=>`${x.e.name}来谈，想读个在职法硕，周末要上课，手上的活得减一些。`,
 choices:[
  {label:'支持，学费所里出一半',cost:40000,note:'两项能力 +3，体力 +10',
   apply:x=>{const ks=STATS.map(s=>s[0]).sort(()=>Math.random()-.5).slice(0,2);
     ks.forEach(k=>x.e.stats[k]+=3);x.e.energy=Math.min(100,x.e.energy+10);
     addNews('团队',`${x.e.name}去读在职法硕了。`)}},
  {label:'现在案子多，先放放',note:'体力 -12',
   apply:x=>{x.e.energy=Math.max(0,x.e.energy-12)}}],
 onSkip:x=>{x.e.energy=Math.max(0,x.e.energy-6)}},

{id:'p_complaint',tier:'person',mood:'rain',weight:7,cooldown:46,
 title:'当事人投诉了态度',
 text:x=>`一份投诉递到所里，说${x.e.name}"电话不接，问三句答一句"。`,
 choices:[
  {label:'带着他上门道歉',note:'口碑 +3 · 体力 -8',
   apply:x=>{addBuzz(3);x.e.energy=Math.max(0,x.e.energy-8)}},
  {label:'内部批评，对外压下去',risk:7,note:'口碑 -2',
   apply:x=>{addBuzz(-2)}}],
 onSkip:x=>{addBuzz(-5);addRisk(5,'当事人投诉没人处理')}},

{id:'p_dinner',tier:'person',mood:'press',weight:6,cooldown:50,
 cond:x=>x.e&&x.e.star,
 title:'被对家约饭了',
 text:x=>`${x.e.name}昨晚跟对家的管理合伙人吃了顿饭。今天回来什么都没说。`,
 choices:[
  {label:'摊开谈，问他想要什么',note:'留人，口碑 +3',
   apply:x=>{addBuzz(3);addNews('团队',`跟${x.e.name}谈了一下午。`)}},
  {label:'直接给股权',cost:250000,note:'彻底绑住，声望 +2',
   apply:x=>{S.prestige+=2;addNews('团队',`${x.e.name}成了权益合伙人。`)}},
  {label:'装作不知道',note:'可能走人',
   apply:x=>{if(Math.random()<.45&&free(x.e)){S.staff=S.staff.filter(y=>y.id!==x.e.id);
     addBuzz(-8);S.prestige=Math.max(0,S.prestige-2);
     addNews('团队',`${x.e.name}辞职了，带走了两个客户。`);chron(`★${x.e.name}出走。`)}}}],
 onSkip:x=>{}},

// ═══ 接案与方案（phase 0）· 第二批 ═══
{id:'c0_undercut',tier:'case',phase:0,mood:'sign',weight:9,cooldown:32,
 title:'同行报了一半的价',
 text:x=>`${x.c.clientName}把另一家的报价单推过来：同样的案子，人家开的不到你们一半。"你们凭什么贵这么多。"`,
 choices:[
  {label:'把两家的方案摊开对比给他看',note:'博弈 +8 · 客户满意度 +6',
   apply:x=>{Q(x.c,'deal',8);x.c.sat=Math.min(100,(x.c.sat||70)+6)}},
  {label:'降价跟到底',cost:x=>x.c.fee*0.3,note:'收费打七折 · 客户满意度 +10',
   apply:x=>{x.c.fee=Math.round(x.c.fee*0.7);x.c.sat=Math.min(100,(x.c.sat||70)+10);
     addNews('接案',`《${x.c.name}》为了拼价降了三成。`)}},
  {label:'不降。爱找谁找谁',note:'博弈 -5 · 声望 +0.5',
   apply:x=>{Q(x.c,'deal',-5);S.prestige+=.5}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-6)}},

{id:'c0_pickman',tier:'case',phase:0,mood:'meeting',weight:8,cooldown:36,
 cond:x=>S.staff.some(e=>e.star),
 title:'客户点名要那个人',
 text:x=>{const st=S.staff.find(e=>e.star);return `${x.c.clientName}在网上看过${st?st.name:'所里最有名那位'}的案子，指名要他主办，别的谁来都不行。`},
 choices:[
  {label:'让他上',note:'博弈 +10 · 客户满意度 +8 · 他手上别的活要让',
   apply:x=>{Q(x.c,'deal',10);x.c.sat=Math.min(100,(x.c.sat||70)+8);
     const st=S.staff.find(e=>e.star);if(st)st.energy=clamp(st.energy-12,0,100)}},
  {label:'解释分工，让办案组照常',note:'博弈 -4 · 客户满意度 -5',
   apply:x=>{Q(x.c,'deal',-4);x.c.sat=Math.max(0,(x.c.sat||70)-5)}},
  {label:'挂他的名，活还是组里干',risk:9,note:'博弈 +7 · 这是挂名代理',
   apply:x=>{Q(x.c,'deal',7);x.c.sat=Math.min(100,(x.c.sat||70)+5)}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-4)}},

{id:'c0_callin',tier:'case',phase:0,mood:'night',weight:7,cooldown:48,
 title:'有人打了个招呼',
 text:x=>`一个不太熟的号码打进来，绕了三分钟才说到正题：《${x.c.name}》那个案子，"能不能关照一下"。对方没说自己是谁，但话里有话。`,
 choices:[
  {label:'客气地挂了，当没这回事',note:'声望 +1',
   apply:x=>{S.prestige+=1}},
  {label:'约出来听听他想说什么',risk:14,note:'博弈 +11 · 这条线沾上就不好下来',
   apply:x=>{Q(x.c,'deal',11);addNews('办案',`《${x.c.name}》背后好像有人在使劲。`)}},
  {label:'转告当事人，让他自己判断',note:'客户满意度 +6 · 交付 +4',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+6);Q(x.c,'work',4)}}],
 onSkip:x=>{}},

{id:'c0_prior',tier:'case',phase:0,mood:'empty',weight:8,cooldown:38,
 title:'这案子已经换过两个所',
 text:x=>`翻材料才发现，《${x.c.name}》在你们之前已经换过两家律所了。客户一直没提。`,
 choices:[
  {label:'要来前两家的卷宗，摸清楚为什么换',cost:x=>x.c.fee*0.03,note:'事实 +8 · 法理 +4',
   apply:x=>{Q(x.c,'fact',8);Q(x.c,'law',4)}},
  {label:'当面问清楚，问不明白就退',note:'博弈 +6 · 客户满意度 -8',
   apply:x=>{Q(x.c,'deal',6);x.c.sat=Math.max(0,(x.c.sat||70)-8)}},
  {label:'不问了，从头自己做一遍',note:'交付 +5 · 多耗两周',
   apply:x=>{Q(x.c,'work',5);x.c.weeks+=2}}],
 onSkip:x=>{Q(x.c,'fact',-5);addNews('接案','前两家为什么不干了，一直没人弄清楚。')}},

{id:'c0_amount',tier:'case',phase:0,mood:'sign',weight:8,cooldown:40,
 cond:x=>DEPTS[x.c.dept].court,
 title:'客户想把标的报小一点',
 text:x=>`${x.c.clientName}的财务说，诉讼费是按标的算的，"能不能先报低一点，赢了再追"。`,
 choices:[
  {label:'按实际标的报',note:'交付 +6',
   apply:x=>{Q(x.c,'work',6)}},
  {label:'分开起诉，先打一部分',note:'博弈 +7 · 交付 +3 · 战线拉长',
   apply:x=>{Q(x.c,'deal',7);Q(x.c,'work',3);x.c.weeks+=1}},
  {label:'照他说的报',risk:11,note:'客户满意度 +8 · 虚报标的是要担责的',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+8)}}],
 onSkip:x=>{Q(x.c,'work',-3)}},

// ═══ 调查取证（phase 1）· 第二批 ═══
{id:'c1_gone',tier:'case',phase:1,mood:'empty',weight:9,cooldown:34,
 title:'关键的人出国了',
 text:x=>`唯一能说清那笔款去向的会计，上周办了离职，人已经在境外。电话打不通，微信是空头像。`,
 choices:[
  {label:'从银行流水和邮件里绕过去',cost:x=>x.c.fee*0.06,note:'事实 +7 · 交付 +4',
   apply:x=>{Q(x.c,'fact',7);Q(x.c,'work',4)}},
  {label:'托人找到他，请他远程作证',cost:x=>x.c.fee*0.12,note:'事实 +11 · 程序上要费点劲',
   apply:x=>{Q(x.c,'fact',11);Q(x.c,'work',-3)}},
  {label:'放弃这条线',note:'事实 -6 · 法理 +3（改走推定）',
   apply:x=>{Q(x.c,'fact',-6);Q(x.c,'law',3)}}],
 onSkip:x=>{Q(x.c,'fact',-8)}},

{id:'c1_order',tier:'case',phase:1,mood:'night',weight:9,cooldown:30,
 title:'银行不认律师函',
 text:x=>`要调对方三年的流水，银行说必须法院的调查令，光凭律师函不给。申请调查令要排，快的两周，慢的没准。`,
 choices:[
  {label:'规规矩矩申请调查令',note:'事实 +9 · 交付 +5 · 多耗两周',
   apply:x=>{Q(x.c,'fact',9);Q(x.c,'work',5);x.c.weeks+=2}},
  {label:'找关系直接从内部拉一份',cost:20000,risk:18,note:'事实 +12 · 来源永远说不清',
   apply:x=>{Q(x.c,'fact',12);queueChain('evidence',x.c)}},
  {label:'不查了，用现有的材料推',note:'法理 +5',
   apply:x=>{Q(x.c,'law',5)}}],
 onSkip:x=>{Q(x.c,'fact',-5)}},

{id:'c1_scene',tier:'case',phase:1,mood:'rain',weight:8,cooldown:36,
 cond:x=>['constr','tm','secret','contract'].includes(x.c.type),
 title:'现场已经被清过了',
 text:x=>`赶到的时候，该拆的都拆了，该扔的也扔了。对方说"正常清理"。`,
 choices:[
  {label:'立刻做证据保全公证',cost:18000,note:'事实 +9 · 交付 +6',
   apply:x=>{Q(x.c,'fact',9);Q(x.c,'work',6)}},
  {label:'找当时在场的工人问话，做笔录',cost:9000,note:'事实 +6 · 证言不如实物硬',
   apply:x=>{Q(x.c,'fact',6)}},
  {label:'用清理这件事本身做文章',note:'法理 +8 · 博弈 +4',
   apply:x=>{Q(x.c,'law',8);Q(x.c,'deal',4)}}],
 onSkip:x=>{Q(x.c,'fact',-9)}},

{id:'c1_selfdeal',tier:'case',phase:1,mood:'press',weight:8,cooldown:40,
 title:'客户自己去找了对方',
 text:x=>`${x.c.clientName}的老板昨天绕开你们，单独见了对方一面。谈崩了，还留下一句"这事我们律师说了算"的录音。`,
 choices:[
  {label:'把话说重一点，定好以后谁能对外说话',note:'交付 +7 · 客户满意度 -6',
   apply:x=>{Q(x.c,'work',7);x.c.sat=Math.max(0,(x.c.sat||70)-6)}},
  {label:'赶紧补一份书面说明，把那句话圈回来',cost:6000,note:'法理 +6 · 事实 +3',
   apply:x=>{Q(x.c,'law',6);Q(x.c,'fact',3)}},
  {label:'算了，老板嘛',note:'博弈 -7 · 对方已经拿到把柄',
   apply:x=>{Q(x.c,'deal',-7)}}],
 onSkip:x=>{Q(x.c,'deal',-9);addNews('办案','那段录音后来出现在了对方的证据清单里。')}},

{id:'c1_bad',tier:'case',phase:1,mood:'night',weight:9,cooldown:34,
 title:'翻出一份对自己不利的材料',
 text:x=>`整理客户给的箱子，翻出一份内部邮件——写得很清楚，这件事他们自己也知道有问题。对方还没拿到。`,
 choices:[
  {label:'如实告诉客户，据此调整方案',note:'法理 +9 · 交付 +5 · 预期要下调',
   apply:x=>{Q(x.c,'law',9);Q(x.c,'work',5);Q(x.c,'deal',-3)}},
  {label:'放回箱子里，当没看见',risk:13,note:'对方要是自己查到，会很难看',
   apply:x=>{if(Math.random()<.4){Q(x.c,'fact',-12);Q(x.c,'law',-6);
     addNews('办案','那份邮件最后还是出现在了对方的证据里。')}}},
  {label:'销毁',risk:26,note:'事实 +6 · 这是毁灭证据',
   apply:x=>{Q(x.c,'fact',6);queueChain('evidence',x.c)}}],
 onSkip:x=>{Q(x.c,'law',-4)}},

// ═══ 论证与主攻（phase 2）· 第二批 ═══
{id:'c2_sick',tier:'case',phase:2,mood:'hospital',weight:9,cooldown:36,
 title:'开庭前一天，主办倒了',
 text:x=>{const t=TEAM(x.c),w=t.sort((a,b)=>a.energy-b.energy)[0];
   return `明天开庭，${w?w.name:'主办律师'}半夜进了急诊。医生让至少歇三天。`},
 choices:[
  {label:'申请延期',note:'交付 +4 · 多耗两周 · 法官会记一笔',
   apply:x=>{Q(x.c,'work',4);x.c.weeks+=2;Q(x.c,'deal',-3)}},
  {label:'组里另一个人顶上',note:'庭上临场要打折',
   apply:x=>{Q(x.c,'law',-5);Q(x.c,'deal',-4);EN(TEAM(x.c),-8)}},
  {label:'让他打着点滴去',risk:6,note:'不掉分 · 人会垮',
   apply:x=>{const t=TEAM(x.c),w=t.sort((a,b)=>a.energy-b.energy)[0];
     if(w)w.energy=clamp(w.energy-30,0,100);queueChain('overwork',x.c);addBuzz(-2)}}],
 onSkip:x=>{Q(x.c,'law',-8);Q(x.c,'deal',-5)}},

{id:'c2_ambush',tier:'case',phase:2,mood:'press',weight:10,cooldown:30,
 title:'对方当庭甩出一份新证据',
 text:x=>`质证环节，对方突然递上一份从没出现在证据清单里的东西。法官看了看你们："有没有意见？"`,
 choices:[
  {label:'当场申请证据交换期限，要时间',note:'法理 +9 · 拖两周',
   apply:x=>{Q(x.c,'law',9);x.c.weeks+=2}},
  {label:'硬着头皮当庭质证',note:'赌临场 · 庭辩强就能翻',
   apply:x=>{const t=TEAM(x.c),p=t.reduce((a,e)=>a+e.stats.trial,0)/Math.max(1,t.length);
     if(p>=16){Q(x.c,'law',12);Q(x.c,'deal',6);addNews('办案','当庭把对方那份新证据顶回去了。')}
     else{Q(x.c,'fact',-8);Q(x.c,'law',-5)}}},
  {label:'申请对该证据做鉴定',cost:x=>x.c.fee*0.08,note:'事实 +8 · 交付 +4',
   apply:x=>{Q(x.c,'fact',8);Q(x.c,'work',4)}}],
 onSkip:x=>{Q(x.c,'fact',-10);Q(x.c,'law',-6)}},

{id:'c2_slip',tier:'case',phase:2,mood:'mediation',weight:8,cooldown:34,
 title:'当事人在庭上说漏了嘴',
 text:x=>`法官问了一句很平常的话，${x.c.clientName}的人答着答着，把一件不该提的事说了出来。书记员全记下了。`,
 choices:[
  {label:'当庭补充说明，把话圈回来',note:'法理 +7 · 博弈 +3',
   apply:x=>{Q(x.c,'law',7);Q(x.c,'deal',3)}},
  {label:'休庭后递书面意见',cost:5000,note:'交付 +8 · 法理 +3',
   apply:x=>{Q(x.c,'work',8);Q(x.c,'law',3)}},
  {label:'不提了，越描越黑',note:'看运气',
   apply:x=>{if(Math.random()<.5)Q(x.c,'law',-7);else Q(x.c,'deal',2)}}],
 onSkip:x=>{Q(x.c,'law',-6)}},

{id:'c2_judge2',tier:'case',phase:2,mood:'empty',weight:7,cooldown:44,
 cond:x=>DEPTS[x.c.dept].court,
 title:'合议庭换了审判长',
 text:x=>`开庭前两周接到通知，原来的审判长调走了。新来的那位，据说对程序特别较真。`,
 choices:[
  {label:'把所有程序文书重新过一遍',note:'交付 +10 · 全组体力 -8',
   apply:x=>{Q(x.c,'work',10);EN(TEAM(x.c),-8)}},
  {label:'托人打听打听他的办案风格',cost:12000,risk:8,note:'博弈 +8',
   apply:x=>{Q(x.c,'deal',8)}},
  {label:'按原计划',note:'不动',
   apply:x=>{}}],
 onSkip:x=>{Q(x.c,'work',-5)}},

{id:'c2_third',tier:'case',phase:2,mood:'mediation',weight:8,cooldown:38,
 cond:x=>DEPTS[x.c.dept].court,
 title:'对方要追加第三人',
 text:x=>`对方申请把当初的担保方也拉进来。真拉进来，战线要长一截，但责任也可能被分掉一部分。`,
 choices:[
  {label:'同意追加',note:'法理 +8 · 多耗三周 · 责任可能被分摊',
   apply:x=>{Q(x.c,'law',8);x.c.weeks+=3}},
  {label:'反对，主张与本案无关',note:'博弈 +9 · 法理 +3',
   apply:x=>{Q(x.c,'deal',9);Q(x.c,'law',3)}},
  {label:'反过来把自己的第三人也加进去',cost:x=>x.c.fee*0.05,note:'博弈 +12 · 局面更乱',
   apply:x=>{Q(x.c,'deal',12);Q(x.c,'work',-4);x.c.weeks+=2}}],
 onSkip:x=>{x.c.weeks+=3}},

// ═══ 收尾交付（phase 3）· 第二批 ═══
{id:'c3_calc',tier:'case',phase:3,mood:'night',weight:9,cooldown:32,
 cond:x=>DEPTS[x.c.dept].court,
 title:'判决书上有个数算错了',
 text:x=>`判决对己方是有利的，但利息那一段的起算日写错了一天，一路错下来差了小二十万。`,
 choices:[
  {label:'申请补正裁定',note:'交付 +9 · 钱能要回来',
   apply:x=>{Q(x.c,'work',9);S.money+=Math.round(x.c.fee*.05)}},
  {label:'不提。万一补正的时候连别的一起动了呢',note:'交付 +2 · 客户满意度 -7',
   apply:x=>{Q(x.c,'work',2);x.c.sat=Math.max(0,(x.c.sat||70)-7)}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-5)}},

{id:'c3_blame',tier:'case',phase:3,mood:'empty',weight:8,cooldown:38,
 title:'客户要你把责任写清楚',
 text:x=>`结果不如预期，${x.c.clientName}的经办人来找你，希望结案报告里"把当初是谁拍的板写明白"——他要拿去给董事会看。`,
 choices:[
  {label:'照事实写，谁拍的板就是谁',note:'客户满意度 +8 · 但会得罪另一边',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+8);if(Math.random()<.4)addBuzz(-3)}},
  {label:'只写法律意见，不评价内部决策',note:'交付 +7 · 客户满意度 -5',
   apply:x=>{Q(x.c,'work',7);x.c.sat=Math.max(0,(x.c.sat||70)-5)}},
  {label:'按他要的角度写',risk:10,note:'客户满意度 +14 · 这是拿执业信誉替人背书',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+14)}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-6)}},

{id:'c3_lost',tier:'case',phase:3,mood:'night',weight:8,cooldown:36,
 title:'归档时发现少了一份原件',
 text:x=>`卷宗要封了，清点的时候少一份关键合同的原件。最后见过它的人也说不清放哪了。`,
 choices:[
  {label:'翻遍所里，找不到就去法院调取',cost:4000,note:'交付 +7 · 全组体力 -6',
   apply:x=>{Q(x.c,'work',7);EN(TEAM(x.c),-6)}},
  {label:'跟客户说明，请他补一份',note:'交付 +4 · 客户满意度 -8',
   apply:x=>{Q(x.c,'work',4);x.c.sat=Math.max(0,(x.c.sat||70)-8)}},
  {label:'用复印件归档，档案上不体现',risk:12,note:'交付 +3 · 查起来是事故',
   apply:x=>{Q(x.c,'work',3)}}],
 onSkip:x=>{Q(x.c,'work',-8);addRisk(6,'原件遗失未作处理')}},

{id:'c3_deal',tier:'case',phase:3,mood:'mediation',weight:9,cooldown:34,
 cond:x=>DEPTS[x.c.dept].court,
 title:'对方来谈执行和解',
 text:x=>`判决赢了，钱一分没到。对方托人带话：现金一次付清，但只给七成。`,
 choices:[
  {label:'劝客户拿这七成',note:'交付 +10 · 客户满意度 +6 · 钱是真到账了',
   apply:x=>{Q(x.c,'work',10);x.c.sat=Math.min(100,(x.c.sat||70)+6)}},
  {label:'不接受，强制执行走到底',note:'博弈 +8 · 可能一分拿不到',
   apply:x=>{Q(x.c,'deal',8);if(Math.random()<.45){Q(x.c,'work',-9);
     addNews('执行','强制执行走完，对方名下确实干干净净。')}}},
  {label:'先收七成，剩下的继续追',cost:x=>x.c.fee*0.04,note:'交付 +7 · 博弈 +5',
   apply:x=>{Q(x.c,'work',7);Q(x.c,'deal',5)}}],
 onSkip:x=>{Q(x.c,'work',-6)}},

{id:'c3_opinion',tier:'case',phase:3,mood:'sign',weight:8,cooldown:40,
 title:'客户要一份给第三方看的意见书',
 text:x=>`${x.c.clientName}想让你们出一份法律意见书，拿去给银行看。内容要写得比实际情况乐观一些，而且已经超出了委托范围。`,
 choices:[
  {label:'不出。超范围了',note:'声望 +1 · 客户满意度 -8',
   apply:x=>{S.prestige+=1;x.c.sat=Math.max(0,(x.c.sat||70)-8)}},
  {label:'另签一份委托，按实际情况出',cost:-30000,note:'进账 3 万 · 交付 +6',
   apply:x=>{Q(x.c,'work',6);addNews('接案',`给${x.c.clientName}另出了一份法律意见书。`)}},
  {label:'按他要的写',cost:-80000,risk:22,note:'进账 8 万 · 这份东西会跟着你很多年',
   apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+10)}}],
 onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-5)}},

// ═══ 律所经营 · 第二批 ═══
{id:'f_split',tier:'firm',mood:'meeting',weight:9,cooldown:40,
 cond:x=>S.staff.filter(e=>e.role==='partner').length>=2,
 title:'两个合伙人分案分不拢',
 text:x=>`一个案源，两个合伙人都说是自己的关系带进来的。分配方案卡在那儿，底下人都在看。`,
 choices:[
  {label:'定一套分案规则，以后照章办',note:'声望 +1 · 口碑 +5 · 短期不痛快',
   apply:x=>{S.prestige+=1;addBuzz(5);addNews('律所','所里出了一份分案与利益分配办法。')}},
  {label:'和稀泥，这次一人一半',note:'口碑 -3 · 下次还会吵',
   apply:x=>{addBuzz(-3)}},
  {label:'按谁贡献大判给谁',note:'声望 +2 · 另一个会记着',
   apply:x=>{S.prestige+=2;if(Math.random()<.3){const p=S.staff.filter(e=>e.role==='partner'&&free(e));
     if(p.length){const e=pick(p);e.energy=clamp(e.energy-20,0,100)}}}}],
 onSkip:x=>{addBuzz(-5);addNews('律所','那个案源最后谁也没接，客户走了。')}},

{id:'f_raise',tier:'firm',mood:'meeting',weight:9,cooldown:44,
 cond:x=>S.staff.some(e=>underpaid(e)),
 title:'年轻律师来谈薪水',
 text:x=>{const n=S.staff.filter(e=>underpaid(e)).length;
   return `所里${n}个人的薪水低于行情，他们推了一个人出来谈。"不是要多少，是想知道有没有个说法。"`},
 choices:[
  {label:'全部提到行情价',note:'口碑 +8 · 月开支要涨',
   apply:x=>{let n=0;S.staff.forEach(e=>{if(underpaid(e)){e.salary=marketSalary(e);n++}});
     addBuzz(8);addNews('团队',`${n}个人的薪水提到了行情价。`)}},
  {label:'给一个说法：定调薪周期，今年先涨一半',note:'口碑 +4 · 开支涨得少',
   apply:x=>{S.staff.forEach(e=>{if(underpaid(e))e.salary=Math.round((e.salary+marketSalary(e))/2/100)*100});
     addBuzz(4)}},
  {label:'现在不是时候',note:'口碑 -6 · 人会开始动',
   apply:x=>{addBuzz(-6);if(!S.poach){const t=S.staff.filter(e=>underpaid(e));
     if(t.length){const e=pick(t),r=pick(S.rivals);S.poach={id:e.id,by:r.name,at:S.week};
       addNews('团队',`${r.name}开始接触${e.name}。`)}}}}],
 onSkip:x=>{addBuzz(-4)}},

{id:'f_probono',tier:'firm',mood:'meeting',weight:8,cooldown:48,
 title:'律协派了公益值班',
 text:x=>`律协分下来的法律援助值班，一个月两个半天，得出人。`,
 choices:[
  {label:'派人去，认真做',note:'声望 +2 · 口碑 +6 · 占用人手',
   apply:x=>{S.prestige+=2;addBuzz(6);const idle=S.staff.filter(free);
     if(idle.length)pick(idle).energy=clamp(pick(idle).energy-8,0,100)}},
  {label:'派实习的去点个卯',note:'口碑 +1',
   apply:x=>{addBuzz(1)}},
  {label:'找理由推了',note:'声望 -1 · 律协会记着',
   apply:x=>{S.prestige=Math.max(0,S.prestige-1);addRisk(4,'推掉律协安排的法律援助值班')}}],
 onSkip:x=>{S.prestige=Math.max(0,S.prestige-1)}},

{id:'f_collapse',tier:'firm',mood:'empty',weight:8,cooldown:52,
 title:'一家同行所散了',
 text:x=>{const r=pick(S.rivals);return `${r.name}底下一个团队整体散伙，手上还有十几个在办案件没人接。他们来问你要不要。`},
 choices:[
  {label:'全接，人和案子一起',cost:x=>200000,note:'进 2 个人 · 声望 +2 · 烫手的也一起来了',
   apply:x=>{for(let i=0;i<2;i++)if(S.staff.length<OFFICES[S.office].cap)S.staff.push(person(pick(Object.keys(roles)),ri(2,4)));
     S.prestige+=2;addRisk(8,'接手来路不清的在办案件');addNews('律所','接下了一个散伙团队的人和案子。')}},
  {label:'只挑干净的几件接',cost:x=>60000,note:'声望 +1 · 稳',
   apply:x=>{S.prestige+=1;S.leads.push(makeLead('major'));addNews('案源','从散伙的同行那里接了几件干净的案子。')}},
  {label:'不接',note:'什么也没发生',
   apply:x=>{}}],
 onSkip:x=>{}},

{id:'f_rent',tier:'firm',mood:'empty',weight:8,cooldown:56,
 title:'房东要涨租',
 text:x=>`租约到期，房东开口涨三成，说是"周边都这个价"。`,
 choices:[
  {label:'谈，签长约换个价',cost:x=>OFFICES[S.office].rent*2,note:'先付两个月，租金不涨',
   apply:x=>{addNews('律所','跟房东签了长约，租金按原价。')}},
  {label:'接受涨价',note:'月房租涨三成',
   apply:x=>{S.flags.rentUp=(S.flags.rentUp||0)+1;addNews('律所','房租涨了三成。')}},
  {label:'搬到便宜的地方',note:'口碑 -5 · 省钱 · 客户会嘀咕',
   apply:x=>{addBuzz(-5);S.flags.rentUp=Math.max(0,(S.flags.rentUp||0)-1);
     addNews('律所','所里搬了个地方，租金省下来一截。')}}],
 onSkip:x=>{S.flags.rentUp=(S.flags.rentUp||0)+1}},

{id:'f_fake',tier:'firm',mood:'press',weight:7,cooldown:50,
 title:'有人在外面冒用所名',
 text:x=>`有当事人拿着一份盖着你所公章的委托合同上门问进度——所里查无此案。公章是假的，人也不是所里的。`,
 choices:[
  {label:'报案，同时发声明',cost:15000,note:'声望 +2 · 口碑 +4',
   apply:x=>{S.prestige+=2;addBuzz(4);addNews('律所','就冒用所名一事报案并发了声明。')}},
  {label:'私下处理，别声张',risk:7,note:'口碑 -2 · 后面可能还有人上门',
   apply:x=>{addBuzz(-2)}},
  {label:'把这个当事人的案子接下来',cost:x=>0,note:'口碑 +7 · 白干一单',
   apply:x=>{addBuzz(7);S.leads.push(makeLead('small'));
     addNews('律所','那个被骗的当事人，所里接了，没收钱。')}}],
 onSkip:x=>{addBuzz(-5);addRisk(5,'冒名执业未处理')}},

{id:'f_intern',tier:'firm',mood:'night',weight:8,cooldown:46,
 title:'实习鉴定怎么写',
 text:x=>`一个实习律师满一年了，鉴定表放在桌上。他这一年主要在跑腿复印，独立办案几乎没有。`,
 choices:[
  {label:'如实写，跟他谈下一年怎么带',note:'声望 +1 · 他会留下',
   apply:x=>{S.prestige+=1;if(S.staff.length<OFFICES[S.office].cap)S.staff.push(person('paralegal',1))}},
  {label:'照常写"表现良好"',risk:9,note:'省事 · 实习鉴定造假是有人管的',
   apply:x=>{if(S.staff.length<OFFICES[S.office].cap)S.staff.push(person('associate',1))}}],
 onSkip:x=>{addRisk(5,'实习鉴定无人过问')}},

{id:'f_ad',tier:'firm',mood:'press',weight:8,cooldown:44,
 title:'宣传稿要一个"胜诉率"',
 text:x=>`市场那边做宣传册，问能不能写个胜诉率。"同行都写百分之九十几。"`,
 choices:[
  {label:'不写。这个数没法写',note:'声望 +1 · 知名度 -0.5',
   apply:x=>{S.prestige+=1;S.fame=Math.max(0,S.fame-.5)}},
  {label:'写办结案件数和代表案例',note:'知名度 +1.5 · 口碑 +3',
   apply:x=>{S.fame+=1.5;addBuzz(3)}},
  {label:'写百分之九十六',risk:15,note:'知名度 +4 · 虚假宣传是要被处理的',
   apply:x=>{S.fame+=4;addBuzz(6)}}],
 onSkip:x=>{}},

{id:'f_branch',tier:'firm',mood:'meeting',weight:7,cooldown:60,
 cond:x=>S.office>=1&&S.staff.length>=10,
 title:'要不要开个分所',
 text:x=>`隔壁市有人牵线，说可以挂一个分所，出人出牌子就行，业务他们自己跑。`,
 choices:[
  {label:'不开。管不过来的摊子不摊',note:'声望 +1',
   apply:x=>{S.prestige+=1}},
  {label:'开，派两个人常驻',cost:x=>600000,note:'知名度 +3 · 案源上限抬高 · 占两个人',
   apply:x=>{S.fame+=3;S.flags.branch=1;
     addNews('律所','分所挂牌了，派了两个人常驻。')}},
  {label:'只挂名，人不去',cost:x=>150000,risk:16,note:'知名度 +2 · 出了事算你的',
   apply:x=>{S.fame+=2;addNews('律所','分所挂了名，人没派过去。')}}],
 onSkip:x=>{}},

{id:'f_conflict',tier:'firm',mood:'sign',weight:8,cooldown:42,
 cond:x=>S.clients.some(c=>c.rel>=3),
 title:'老客户的对手找上门',
 text:x=>{const cl=S.clients.filter(c=>c.rel>=3);const c=cl.length?pick(cl):null;
   return `一家公司来谈合作，开的价很好。问题是，它和${c?c.name:'所里一个老客户'}正在打官司。`},
 choices:[
  {label:'回绝，跟老客户说一声',note:'老客户关系 +1 · 口碑 +4',
   apply:x=>{const cl=S.clients.filter(c=>c.rel>=3);if(cl.length){const c=pick(cl);c.rel=clamp(c.rel+1,0,5)}
     addBuzz(4)}},
  {label:'接，做好隔离墙',cost:x=>50000,risk:12,note:'进一个大案源 · 老客户未必买账',
   apply:x=>{S.leads.push(makeLead('major'));
     const cl=S.clients.filter(c=>c.rel>=3);if(cl.length&&Math.random()<.5){const c=pick(cl);c.rel=clamp(c.rel-2,0,5);
       addNews('客户',`${c.name}听说了这件事，最近不太说话。`)}}},
  {label:'接，不说',risk:24,note:'进一个大案源 · 这是没披露的利益冲突',
   apply:x=>{S.leads.push(makeLead('major'));queueChain('conflict',null)}}],
 onSkip:x=>{}},

{id:'f_credit',tier:'firm',mood:'press',weight:7,cooldown:50,
 cond:x=>S.cases.length>=3,
 title:'你们的案子成了别人的教材',
 text:x=>{const w=S.cases[0];return `一个同行在培训课上把《${w?w.name:'所里一个案子'}》当范例讲了两个小时，PPT 里没提是谁办的。`},
 choices:[
  {label:'联系他，要求署名',note:'声望 +2',
   apply:x=>{S.prestige+=2}},
  {label:'自己也开一门课',cost:30000,note:'声望 +3 · 知名度 +2',
   apply:x=>{S.prestige+=3;S.fame+=2;addNews('律所','所里开了一门实务课，讲自己的案子。')}},
  {label:'随他去',note:'什么也没发生',
   apply:x=>{}}],
 onSkip:x=>{}},

// ═══ 人物 · 第二批 ═══
{id:'p_leave',tier:'person',mood:'empty',weight:8,cooldown:42,
 title:'要请长假',
 text:x=>`${x.e.name}来请假，家里老人住院，得回去一两个月。`,
 choices:[
  {label:'准假，活分出去',note:'口碑 +5 · 他体力回满',
   apply:x=>{x.e.energy=100;addBuzz(5)}},
  {label:'准假，但停薪',cost:x=>-x.e.salary,note:'省一个月工资 · 口碑 -4',
   apply:x=>{x.e.energy=90;addBuzz(-4)}},
  {label:'现在走不开',note:'体力 -20 · 口碑 -6',
   apply:x=>{x.e.energy=clamp(x.e.energy-20,0,100);addBuzz(-6)}}],
 onSkip:x=>{x.e.energy=clamp(x.e.energy-12,0,100);addBuzz(-3)}},

{id:'p_fight',tier:'person',mood:'meeting',weight:7,cooldown:46,
 cond:x=>S.staff.length>=4,
 title:'两个人在会议室吵起来了',
 text:x=>{const o=S.staff.filter(e=>e.id!==x.e.id);const b=o.length?pick(o):null;
   return `${x.e.name}和${b?b.name:'另一个律师'}为一份材料该谁改吵到了门外能听见。`},
 choices:[
  {label:'把两个人叫进来当面说清',note:'口碑 +3 · 两人体力 -5',
   apply:x=>{addBuzz(3);x.e.energy=clamp(x.e.energy-5,0,100)}},
  {label:'把两人分到不同案组，别碰面',note:'默契清零，但耳根清净',
   apply:x=>{Object.keys(S.chemistry).forEach(k=>{if(k.includes(String(x.e.id)))S.chemistry[k]=0})}},
  {label:'装没听见',note:'口碑 -4',
   apply:x=>{addBuzz(-4)}}],
 onSkip:x=>{addBuzz(-3)}},

{id:'p_moments',tier:'person',mood:'press',weight:8,cooldown:44,
 title:'朋友圈发了不该发的',
 text:x=>`${x.e.name}昨晚发了条朋友圈，配图是卷宗的一页，当事人的名字没打码。已经有人截图了。`,
 choices:[
  {label:'立刻删，向当事人道歉',cost:5000,note:'口碑 -2 · 事态按住了',
   apply:x=>{addBuzz(-2)}},
  {label:'删，并在所里立规矩',note:'口碑 +3 · 声望 +1',
   apply:x=>{addBuzz(3);S.prestige+=1}},
  {label:'没什么大不了的',risk:16,note:'泄露当事人信息是要担责的',
   apply:x=>{addBuzz(-6)}}],
 onSkip:x=>{addBuzz(-8);addRisk(10,'当事人信息外泄未处理')}},

{id:'p_cert',tier:'person',mood:'sign',weight:8,cooldown:44,
 cond:x=>x.e&&x.e.role==='paralegal',
 title:'助理想转执业律师',
 text:x=>`${x.e.name}实习期满了，要你签实习证明。签了他就是执业律师，薪水也得往上调。`,
 choices:[
  {label:'签，按执业律师定薪',note:'他升一级 · 月薪上调',
   apply:x=>{x.e.role='associate';x.e.level=clamp(x.e.level+1,1,5);
     STATS.forEach(([k])=>x.e.stats[k]+=ri(1,3));
     x.e.salary=marketSalary(x.e);
     addNews('团队',`${x.e.name}转为执业律师。`)}},
  {label:'签，但薪水先不动',risk:4,note:'省钱 · 他会比较',
   apply:x=>{x.e.role='associate';x.e.level=clamp(x.e.level+1,1,5);
     STATS.forEach(([k])=>x.e.stats[k]+=ri(1,3));addBuzz(-3)}},
  {label:'再带一年',note:'口碑 -5 · 他可能走',
   apply:x=>{addBuzz(-5);if(Math.random()<.4&&free(x.e)){S.staff=S.staff.filter(y=>y.id!==x.e.id);
     addNews('团队',`${x.e.name}没等到证明，自己找了下家。`)}}}],
 onSkip:x=>{addBuzz(-4)}},

{id:'p_moonlight',tier:'person',mood:'night',weight:7,cooldown:50,
 title:'有人在外面接私活',
 text:x=>`一份不是所里出的代理词，落款是${x.e.name}的名字。他自己在外面接了案子，没走所里。`,
 choices:[
  {label:'要求他把案子转进所里，按规矩分成',note:'进一个案源 · 口碑 +2',
   apply:x=>{S.leads.push(makeLead('small'));addBuzz(2)}},
  {label:'按所规处理，扣一个月奖金',cost:x=>-x.e.salary*.5,note:'声望 +1 · 他体力 -15',
   apply:x=>{S.prestige+=1;x.e.energy=clamp(x.e.energy-15,0,100)}},
  {label:'当没看见',risk:13,note:'私自代理，所里要担连带责任',
   apply:x=>{}}],
 onSkip:x=>{addRisk(8,'所内人员私自代理无人过问')}},

{id:'p_retire',tier:'person',mood:'empty',weight:6,cooldown:60,
 cond:x=>x.e&&x.e.level>=4&&x.e.weeks>=150,
 title:'老律师想退了',
 text:x=>`${x.e.name}说想歇了，案子交一交，证也该注销了。他手上那几个老客户，跟了他十几年。`,
 choices:[
  {label:'办一场交接，带着新人一个个上门',cost:40000,note:'客户关系保住 · 他离所',
   apply:x=>{S.staff=S.staff.filter(y=>y.id!==x.e.id);
     S.clients.forEach(c=>{if(c.rel>=3&&Math.random()<.7)c.rel=clamp(c.rel,0,5)});
     addBuzz(4);chron(`${x.e.name}退休，客户做了交接。`)}},
  {label:'返聘他做顾问，不办案只带人',cost:x=>x.e.salary*.6,note:'他留下 · 全所能力慢慢涨',
   apply:x=>{x.e.salary=Math.round(x.e.salary*.6/100)*100;x.e.energy=100;
     S.flags.mentor=1;addNews('团队',`${x.e.name}转做所里的顾问，不办案，带人。`)}},
  {label:'让他走',note:'老客户跟着走一批',
   apply:x=>{S.staff=S.staff.filter(y=>y.id!==x.e.id);
     S.clients.forEach(c=>{if(c.rel>=3&&Math.random()<.5)c.rel=clamp(c.rel-2,0,5)});
     addBuzz(-4);chron(`${x.e.name}退休离所。`)}}],
 onSkip:x=>{}},

{id:'p_team',tier:'person',mood:'meeting',weight:6,cooldown:55,
 cond:x=>x.e&&x.e.star,
 title:'要带自己的团队进来',
 text:x=>`${x.e.name}说想把原来带的两个人也弄进来，"用着顺手"。工资得所里发。`,
 choices:[
  {label:'同意，两个人一起进',cost:x=>200000,note:'进 2 人 · 默契起步就高',
   apply:x=>{for(let i=0;i<2;i++)if(S.staff.length<OFFICES[S.office].cap){
       const e=person(pick(['associate','paralegal','litigator']),ri(2,3));S.staff.push(e);
       S.chemistry[chemKey(x.e.id,e.id)]=2}
     addNews('团队',`${x.e.name}带进来两个人。`)}},
  {label:'先进一个，看情况',cost:x=>100000,note:'进 1 人',
   apply:x=>{if(S.staff.length<OFFICES[S.office].cap){
     const e=person('associate',ri(2,3));S.staff.push(e);S.chemistry[chemKey(x.e.id,e.id)]=2}}},
  {label:'所里不这么搞',note:'他体力 -15 · 可能动心思',
   apply:x=>{x.e.energy=clamp(x.e.energy-15,0,100);
     if(!S.poach&&Math.random()<.35){const r=pick(S.rivals);S.poach={id:x.e.id,by:r.name,at:S.week};
       addNews('团队',`${r.name}开始接触${x.e.name}。`)}}}],
 onSkip:x=>{}},

// ═══ 结案之后（close）═══
{id:'x_refund',tier:'close',mood:'empty',weight:10,cooldown:26,
 cond:x=>x.c.score<5.5,
 title:'客户要退一部分律师费',
 text:x=>`《${x.c.name}》结了一周，${x.c.clientName}来了封邮件：结果没达到预期，希望退回一部分费用。`,
 choices:[
  {label:'按合同办，不退',note:'客户关系 -1 · 口碑 -3',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel-1,0,5);addBuzz(-3)}},
  {label:'退两成，把话说开',cost:x=>x.c.paid*0.2,note:'客户关系 +1 · 口碑 +4',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel+1,0,5);addBuzz(4)}},
  {label:'下个案子给他打折，这次不退',note:'客户关系不变 · 留个人情',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.last=S.week-8;addBuzz(1)}}],
 onSkip:x=>{addBuzz(-5);const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel-2,0,5)}},

{id:'x_poach',tier:'close',mood:'press',weight:9,cooldown:30,
 cond:x=>x.c.score>=7.5&&x.c.team&&x.c.team.length>0,
 title:'对家盯上了这个案子的主办',
 text:x=>{const e=S.staff.find(y=>y.id===x.c.team[0]);const r=pick(S.rivals);
   return `《${x.c.name}》办得漂亮，${r.name}那边已经给${e?e.name:'主办律师'}打了两次电话。`},
 choices:[
  {label:'加薪到行情价以上',note:'留人',
   apply:x=>{const e=S.staff.find(y=>y.id===x.c.team[0]);
     if(e){e.salary=Math.round(marketSalary(e)*1.2/100)*100;addNews('团队',`给${e.name}提了薪。`)}}},
  {label:'让他主办下一个大案',note:'留人 · 他体力 -10',
   apply:x=>{const e=S.staff.find(y=>y.id===x.c.team[0]);if(e)e.energy=clamp(e.energy-10,0,100);addBuzz(2)}},
  {label:'不接这个茬',note:'可能走人',
   apply:x=>{const e=S.staff.find(y=>y.id===x.c.team[0]);
     if(e&&free(e)&&Math.random()<.5){S.staff=S.staff.filter(y=>y.id!==e.id);
       addBuzz(-5);addNews('团队',`${e.name}离所了。`);chron(`${e.name}在办完《${x.c.name}》之后离所。`)}}}],
 onSkip:x=>{}},

{id:'x_news',tier:'close',mood:'press',weight:9,cooldown:28,
 cond:x=>x.c.score>=7,
 title:'案子上了本地新闻',
 text:x=>`《${x.c.name}》的判决被本地媒体报了，标题起得挺大。记者想再约一次深访。`,
 choices:[
  {label:'接受采访，只谈法律问题',note:'知名度 +2 · 口碑 +5',
   apply:x=>{S.fame+=2;addBuzz(5)}},
  {label:'让当事人自己决定说不说',note:'客户关系 +1 · 知名度 +0.5',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel+1,0,5);S.fame+=.5}},
  {label:'借势做一轮宣传',cost:40000,risk:8,note:'知名度 +4 · 口碑 +8 · 容易过头',
   apply:x=>{S.fame+=4;addBuzz(8)}}],
 onSkip:x=>{S.fame+=.5}},

{id:'x_banner',tier:'close',mood:'celebrate',weight:8,cooldown:32,
 cond:x=>x.c.score>=8,
 title:'当事人送了面锦旗',
 text:x=>`${x.c.clientName}的人抱着一面锦旗来了所里，非要挂在前台。`,
 choices:[
  {label:'挂上，拍张照发出去',note:'知名度 +1.5 · 口碑 +4',
   apply:x=>{S.fame+=1.5;addBuzz(4)}},
  {label:'收下，但不挂',note:'客户关系 +1',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel+1,0,5)}}],
 onSkip:x=>{}},

{id:'x_complain',tier:'close',mood:'rain',weight:9,cooldown:30,
 cond:x=>x.c.score>=7,
 title:'对方把你投诉了',
 text:x=>`败诉那边不服，一纸投诉递到律协，说你们在代理过程中有违规。内容大半是气话，但有一条不太好解释。`,
 choices:[
  {label:'认真写答复，附上全套材料',cost:20000,note:'执业风险 -6 · 占一周',
   apply:x=>{addRisk(-6);addNews('律协','投诉答复已提交，材料很全。')}},
  {label:'托人说和，让他撤回',cost:50000,risk:12,note:'快 · 但记录上留了一笔',
   apply:x=>{addNews('律协','那份投诉撤回了。')}},
  {label:'不理它',note:'执业风险 +8',
   apply:x=>{addRisk(8,'投诉未答复')}}],
 onSkip:x=>{addRisk(10,'投诉无人答复');addBuzz(-4)}},

{id:'x_referral',tier:'close',mood:'sign',weight:10,cooldown:24,
 cond:x=>x.c.score>=7&&x.c.sat>=70,
 title:'客户介绍了新客户',
 text:x=>`${x.c.clientName}的老板给一个朋友打了电话，说"这事你找他们"。人明天就来。`,
 choices:[
  {label:'照常接待，按正常价',note:'来一个新案源',
   apply:x=>{S.leads.push(makeLead());addNews('案源',`${x.c.clientName}介绍来一个新客户。`)}},
  {label:'给个介绍价，先把关系做上',cost:x=>0,note:'来一个新案源 · 老客户关系 +1 · 收费低一成五',
   apply:x=>{const l=makeLead();l.fee=Math.round(l.fee*.85/1000)*1000;S.leads.push(l);
     const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel+1,0,5)}},
  {label:'返一笔介绍费给老客户',cost:x=>x.c.paid*0.05,risk:14,note:'两个案源 · 这笔钱走不了正账',
   apply:x=>{S.leads.push(makeLead());S.leads.push(makeLead('small'))}}],
 onSkip:x=>{}},

{id:'x_typical',tier:'close',mood:'celebrate',weight:7,cooldown:40,
 cond:x=>x.c.score>=8.5,
 title:'判决被收进了典型案例',
 text:x=>`《${x.c.name}》的判决被收进了本地法院的年度典型案例，裁判要旨那一段基本是照你们的代理意见写的。`,
 choices:[
  {label:'写一篇案例评析投出去',cost:8000,note:'声望 +3 · 知名度 +1',
   apply:x=>{S.prestige+=3;S.fame+=1;addNews('行业','所里就这个案子写了一篇评析。')}},
  {label:'拿去做业务推介',note:'知名度 +2.5 · 声望 +1',
   apply:x=>{S.fame+=2.5;S.prestige+=1}}],
 onSkip:x=>{S.prestige+=1}},

{id:'x_regret',tier:'close',mood:'empty',weight:8,cooldown:34,
 cond:x=>x.c.score<7,
 title:'当事人说当初没听懂',
 text:x=>`${x.c.clientName}现在的说法是：签委托的时候，没人跟他讲清楚可能是这个结果。风险告知书上有他的签字。`,
 choices:[
  {label:'把签字的告知书和会议记录拿出来',note:'客户关系 -1 · 但站得住',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel-1,0,5)}},
  {label:'再当面讲一遍，把话说透',cost:5000,note:'客户关系不变 · 口碑 +3',
   apply:x=>{addBuzz(3)}},
  {label:'以后所有案子都加一道当面录音的风险告知',cost:25000,note:'执业风险 -8 · 声望 +1',
   apply:x=>{addRisk(-8);S.prestige+=1;addNews('律所','所里把风险告知改成了当面讲、全程录音。')}}],
 onSkip:x=>{addBuzz(-4);addRisk(5,'风险告知争议未处理')}},

{id:'x_debrief',tier:'close',mood:'meeting',weight:11,cooldown:22,
 title:'结案复盘会',
 text:x=>`《${x.c.name}》结了，按所里的规矩要开个复盘。有人觉得是走形式，有人憋了一肚子话。`,
 choices:[
  {label:'认真复盘，把问题摆出来',note:'全组默契 +　下次这类案子更有底',
   apply:x=>{const t=(x.c.team||[]).map(id=>S.staff.find(e=>e.id===id)).filter(Boolean);
     for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++){
       const k=chemKey(t[i].id,t[j].id);S.chemistry[k]=(S.chemistry[k]||0)+.6}
     addBuzz(2)}},
  {label:'只讲好的，别伤和气',note:'全组体力 +6',
   apply:x=>{(x.c.team||[]).forEach(id=>{const e=S.staff.find(y=>y.id===id);
     if(e)e.energy=clamp(e.energy+6,0,100)})}},
  {label:'把复盘写成所内案例，归档',cost:6000,note:'声望 +1 · 以后办同类案更稳',
   apply:x=>{S.prestige+=1;addNews('律所',`《${x.c.name}》的复盘写成了所内案例。`)}}],
 onSkip:x=>{}},

{id:'x_archive',tier:'close',mood:'night',weight:10,cooldown:24,
 title:'客户要把材料拿回去',
 text:x=>`${x.c.clientName}派人来取当初交的那几箱原件。清单是两年前列的，中间经手过四五个人。`,
 choices:[
  {label:'一件件当面点清，双方签字',note:'交付规范 · 客户关系 +1 · 占半天',
   apply:x=>{const cl=S.clients.find(y=>y.id===x.c.clientId);if(cl)cl.rel=clamp(cl.rel+1,0,5);
     addRisk(-3)}},
  {label:'按清单整箱交接，签个总数',note:'快 · 以后说不清就麻烦',
   apply:x=>{if(Math.random()<.3){addRisk(6,'原件交接未逐件点验');
     addNews('律所','客户后来说少了一份东西，谁也拿不出点验记录。')}}},
  {label:'先扫描留底再交',cost:9000,note:'执业风险 -5 · 交付更扎实',
   apply:x=>{addRisk(-5)}}],
 onSkip:x=>{addRisk(4,'卷宗原件交接无记录')}},

{id:'x_bill',tier:'close',mood:'sign',weight:10,cooldown:24,
 title:'最后一笔账对不上',
 text:x=>`财务把《${x.c.name}》的账合了一遍，差出来一笔两万多的支出，票据上写的是"差旅",但那几天没人出差。`,
 choices:[
  {label:'查清楚，该谁的谁认',note:'声望 +1 · 有人会不高兴',
   apply:x=>{S.prestige+=1;addRisk(-4);
     const t=(x.c.team||[]).map(id=>S.staff.find(e=>e.id===id)).filter(Boolean);
     if(t.length)pick(t).energy=clamp(pick(t).energy-10,0,100)}},
  {label:'走办公经费冲掉',risk:9,note:'省事 · 账上留个说不清的窟窿',
   apply:x=>{}},
  {label:'补一套报销制度，以后按新规矩来',cost:12000,note:'执业风险 -7 · 声望 +1',
   apply:x=>{addRisk(-7);S.prestige+=1;addNews('律所','所里重新定了办案费用的报销规矩。')}}],
 onSkip:x=>{addRisk(5,'办案费用去向不明')}},
];

// ── 链式后果：数周后回来找你 ────────────────────────────────
const CHAINS={
 evidence:{id:'ch_evidence',tier:'case',mood:'hallway',needCase:true,
  title:'对方申请排除证据',
  text:x=>`对方递了一份排除证据的申请，矛头指向那份来路可疑的材料。法官要你们当庭说明来源。`,
  choices:[
   {label:'主动撤回那份证据',note:'事实 -10，但不再追究',
    apply:x=>{Q(x.c,'fact',-10);addNews('办案',`《${x.c.name}》主动撤回了争议证据。`)}},
   {label:'硬扛，坚持来源合法',risk:12,note:'事实 -4 · 法理 -6 · 后面还有麻烦',
    apply:x=>{Q(x.c,'fact',-4);Q(x.c,'law',-6);addRisk(6,'证据来源被质疑仍坚持提交')}}],
  onSkip:x=>{Q(x.c,'fact',-14);addRisk(8,'证据来源无人说明');addNews('办案','那份证据被直接排除了。')}},

 promise:{id:'ch_promise',tier:'case',mood:'rain',needCase:true,
  title:'客户来问那句话还算不算数',
  text:x=>`当初"这个案子没问题"那句话，${x.c.clientName}一直记着。现在情况没那么乐观，他要一个解释。`,
  choices:[
   {label:'坦白，重新说明风险',note:'客户满意度 -10，但事说开了',
    apply:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-10)}},
   {label:'再打一次包票',risk:10,note:'客户满意度 +6 · 坑越挖越深',
    apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+6);queueChain('promise',x.c)}},
   {label:'主动减免部分律师费',cost:x=>x.c.fee*0.15,note:'客户满意度 +16',
    apply:x=>{x.c.sat=Math.min(100,(x.c.sat||70)+16);x.c.paidIn-=x.c.fee*0.15}}],
  onSkip:x=>{x.c.sat=Math.max(0,(x.c.sat||70)-18);addBuzz(-5)}},

 conflict:{id:'ch_conflict',tier:'firm',mood:'press',
  title:'两头都是你的客户',
  text:x=>`老客户的人在法院门口看见了所里的车。电话打过来只有一句话：这案子你们是不是两边都接了。`,
  choices:[
   {label:'退出后接的那一方，钱原路退回',cost:x=>300000,note:'口碑 +4 · 老客户关系保住',
    apply:x=>{addBuzz(4);const cl=S.clients.filter(c=>c.rel>=2);
      if(cl.length)pick(cl).rel=clamp(pick(cl).rel,0,5);
      addNews('律所','退出了后接的那一方，费用原路退回。')}},
   {label:'两边都留着，说不构成冲突',risk:20,note:'口碑 -8 · 这事捂不住',
    apply:x=>{addBuzz(-8);
      const cl=S.clients.filter(c=>c.rel>=3);
      if(cl.length){const c=pick(cl);c.rel=0;addNews('客户',`${c.name}解除了全部委托。`)}}}],
  onSkip:x=>{addBuzz(-10);addRisk(14,'利益冲突被当面指出仍未处理')}},

 overwork:{id:'ch_overwork',tier:'case',mood:'hospital',needCase:true,
  title:'人倒下了',
  text:x=>{const t=TEAM(x.c),w=t.sort((a,b)=>a.energy-b.energy)[0];
    return `${w?w.name:'组里有人'}在办公室晕过去了，送到医院说是长期睡眠不足加急性胃炎，医生让至少休两周。`},
  choices:[
   {label:'让他休，活分给别人',note:'全组体力 -6，交付 -5',
    apply:x=>{EN(TEAM(x.c),-6);Q(x.c,'work',-5)}},
   {label:'外聘一位律师顶上',cost:130000,note:'不掉进度',
    apply:x=>{addNews('团队','临时外聘了一位律师顶上。')}}],
  onSkip:x=>{EN(TEAM(x.c),-14);Q(x.c,'work',-10);addBuzz(-4)}}
};

// ── 按阈值触发的事件（不进随机池，由 processRisk 直接调用）────
const RISK_EVENTS={
 probe:{id:'ev_probe',tier:'risk',mood:'press',
  title:'司法局来立案调查',
  text:x=>`一纸调查通知送到所里。近两年的收费记录、冲突检索、归档情况，要在十天内报上去。`+
    `带队的那位说得很客气："配合一下，把情况说清楚就行。"`,
  choices:[
   {label:'全面配合，该补的补该改的改',cost:x=>Math.round(Math.max(40000,S.risk*2600)/1000)*1000,
    note:'执业风险 -16 · 占人占时间',
    apply:x=>{addRisk(-16);addBuzz(2);
      S.staff.filter(free).slice(0,2).forEach(e=>e.energy=clamp(e.energy-12,0,100));
      addNews('司法局','调查结束，出具了整改意见，没有进一步处理。')}},
   {label:'请个懂行的人帮着走一趟',cost:x=>Math.round(Math.max(90000,S.risk*4800)/1000)*1000,risk:8,
    note:'执业风险 -22 · 但这次配合本身也会被记一笔',
    apply:x=>{addRisk(-22);addNews('司法局','调查很快结束了，过程比想象中顺利。')}},
   {label:'材料先报一部分，拖着看',
    note:'执业风险 +7 · 这事不会自己过去',
    apply:x=>{addRisk(7,'调查期间材料报送不全');addBuzz(-4);
      addNews('司法局','调查没有结束，要求补充材料。')}}],
  onSkip:x=>{addRisk(10,'立案调查无人应对');addBuzz(-6)}}
};

// ── 行业新闻：只进消息栏，不弹窗 ────────────────────────────
const NEWSFEED=[
 ['行业','律协发布年度报告：全省执业律师数同比增长 6.8%，青年律师流失率仍在两成以上。'],
 ['行业','法院系统推广繁简分流，简易程序案件平均审理周期缩短到 42 天。'],
 ['行业','几家大所开始按小时计费向中小企业客户推广，市场价格战苗头初现。'],
 ['监管','司法局通报一批违规执业案例，多数涉及未披露利益冲突和违规风险代理。'],
 ['监管','刑事案件风险代理仍属禁止范围，已有律所因此被处罚。'],
 ['行业','某红圈所整建制团队出走自立门户，带走三家上市公司常年顾问业务。'],
 ['市场','企业法务部扩编成风，外部律师的"非核心业务"份额被进一步挤压。'],
 ['市场','几家互联网平台上线法律咨询直营，低价小案被进一步分流。'],
 ['行业','明镜榜启动年度评选，今年新增"年度青年律师"单项。'],
 ['法院','多地法院试行庭审全程录音录像并向当事人开放调取。'],
 ['行业','一份执业调查显示，超过六成律师在过去一年有过连续加班超过两周的经历。'],
 ['市场','建设工程领域争议激增，多家所紧急扩招工程法律方向律师。'],
 ['监管','多地律协开展实习律师管理专项检查，重点查实习鉴定与考勤造假。'],
 ['行业','一份行业调研显示，青年律师前三年平均月收入低于同城平均工资。'],
 ['法院','多地法院推行电子卷宗随案生成，律师阅卷不用再跑一趟。'],
 ['市场','几家头部所开始要求合伙人自带创收指标，达不到就降级。'],
 ['监管','司法行政部门通报：以"包打赢"招揽业务被列为重点整治对象。'],
 ['行业','某所因为一份虚假的胜诉率宣传册被约谈，宣传册已全部回收。'],
 ['法院','小额诉讼程序适用范围扩大，一批简单纠纷不再进普通程序。'],
 ['市场','法律科技公司推出合同自动审查工具，常年顾问业务首当其冲。'],
 ['行业','律协换届，新一届理事会提出要给青年律师"托底"。'],
 ['监管','关于律师参与民事诉讼调解的新规下发，调解结案率纳入考核。'],
 ['行业','一位执业三十年的老律师注销执业证，在朋友圈写了很长一段。'],
 ['市场','企业合规不起诉试点扩围，刑辩与合规业务开始交叉。'],
 ['法院','多地试行庭前会议实质化，开庭当天的突袭式举证越来越难。'],
 ['行业','几家所联合发起"不打价格战"倡议，签了名的只有七家。'],
 ['监管','律师被诉泄露当事人隐私的案例增加，多与社交媒体有关。'],
 ['市场','建筑、地产两个行业的法律服务需求同比下滑，诉讼量却在涨。'],
 ['行业','年度明镜榜提名名单公布，有两家新锐所第一次进入视野。'],
 ['法院','执行悬赏公告上线统一平台，找不到人的案子多了一条路。']
];
