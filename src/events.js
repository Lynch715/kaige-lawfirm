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
  {label:'只付误工和交通，开票据',cost:26000,note:'事实 +6',
   apply:x=>{Q(x.c,'fact',6)}},
  {label:'给他一笔，让他把话说得更到位',cost:170000,risk:16,note:'事实 +13 · 证言可信度是个雷',
   apply:x=>{Q(x.c,'fact',13);queueChain('evidence',x.c)}}],
 onSkip:x=>{Q(x.c,'fact',-4);addNews('取证','证人最后没来。')}},

{id:'c1_record',tier:'case',phase:1,mood:'night',weight:9,cooldown:32,
 title:'那段录音是偷录的',
 text:x=>`客户交上来一段录音，对方在里面亲口承认了。问题是，这是在人家办公室里偷录的。`,
 choices:[
  {label:'评估合法性，能用就用，不能用就放弃',cost:45000,note:'法理 +6 · 事实 +4',
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
  {label:'加急费插队',cost:320000,note:'事实 +9 · 不耽误排期',
   apply:x=>{Q(x.c,'fact',9)}},
  {label:'换一家出得快的机构',cost:85000,risk:8,note:'事实 +6 · 这家的报告对方肯定要质疑',
   apply:x=>{Q(x.c,'fact',6)}}],
 onSkip:x=>{x.c.weeks+=2}},

{id:'c1_oversea',tier:'case',phase:1,mood:'empty',weight:7,cooldown:46,
 title:'关键证据在境外',
 text:x=>`最关键的那份文件在境外，要用就得走公证认证，一来一回六周起步。`,
 choices:[
  {label:'走完整流程',cost:190000,note:'事实 +8 · 交付 +5 · 多耗三周',
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
  {label:'托人问问法官的倾向',cost:220000,risk:22,note:'博弈 +14 · 这条线碰不得',
   apply:x=>{Q(x.c,'deal',14)}}],
 onSkip:x=>{Q(x.c,'work',3)}},

{id:'c2_memo',tier:'case',phase:2,mood:'night',weight:9,cooldown:30,
 title:'检索报告里有个硬伤',
 text:x=>{const t=TEAM(x.c),who=t[t.length-1];return `开庭前复核，发现${who?who.name:'助理'}引的那个指导案例，去年已经被新的司法解释覆盖了。整份论证得重来。`},
 choices:[
  {label:'连夜重做',note:'法理 +10 · 全组体力 -8',
   apply:x=>{Q(x.c,'law',10);EN(TEAM(x.c),-8)}},
  {label:'外聘一位学者出意见书',cost:380000,note:'法理 +14',
   apply:x=>{Q(x.c,'law',14);addNews('办案',`《${x.c.name}》请了一位学者出专家意见。`)}},
  {label:'把那段删掉，不提了',note:'法理 +2',
   apply:x=>{Q(x.c,'law',2)}}],
 onSkip:x=>{Q(x.c,'law',-6);addNews('办案','那处硬伤没人再去碰。')}},

{id:'c2_rival',tier:'case',phase:2,mood:'press',weight:8,cooldown:38,
 title:'对方换律师了',
 text:x=>{const r=pick(S.rivals);return `开庭前两周，对方换了代理人——${r.name}的人接了。这家在庭上出了名的不好对付。`},
 choices:[
  {label:'加派一名资深律师上庭',cost:260000,note:'法理 +8 · 博弈 +6',
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
  {label:'给分红，绑长期',cost:430000,note:'留人，口碑 +4',
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
  {label:'配合，该补的补',cost:130000,note:'执业红线 -8',
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
  {label:'接，按他说的走账',cost:-1700000,risk:20,note:'进账 170 万 · 这笔钱有味道',
   apply:x=>{addNews('案源','那笔介绍来的活接了，钱也返了。')}}],
 onSkip:x=>{}},

{id:'f_famous',tier:'firm',mood:'press',weight:7,cooldown:48,
 title:'一个明显赢不了的案子',
 text:x=>`有人找上门，案子本身几乎没有胜算，但社会关注度极高，做了整个行业都会知道你们。`,
 choices:[
  {label:'接，当公益案件做',cost:320000,note:'声望 +3 · 知名度 +2.5 · 口碑 +10',
   apply:x=>{S.prestige+=3;S.fame+=2.5;addBuzz(10);chron('接了一个明知赢不了的案子。')}},
  {label:'不接，律所不是做慈善的',note:'什么也没发生',
   apply:x=>{}}],
 onSkip:x=>{}},

// ═══ 人物 ═══
{id:'p_study',tier:'person',mood:'night',weight:8,cooldown:44,
 title:'想去读在职法硕',
 text:x=>`${x.e.name}来谈，想读个在职法硕，周末要上课，手上的活得减一些。`,
 choices:[
  {label:'支持，学费所里出一半',cost:130000,note:'两项能力 +3，体力 +10',
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
  {label:'直接给股权',cost:850000,note:'彻底绑住，声望 +2',
   apply:x=>{S.prestige+=2;addNews('团队',`${x.e.name}成了权益合伙人。`)}},
  {label:'装作不知道',note:'可能走人',
   apply:x=>{if(Math.random()<.45&&free(x.e)){S.staff=S.staff.filter(y=>y.id!==x.e.id);
     addBuzz(-8);S.prestige=Math.max(0,S.prestige-2);
     addNews('团队',`${x.e.name}辞职了，带走了两个客户。`);chron(`★${x.e.name}出走。`)}}}],
 onSkip:x=>{}}
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

 overwork:{id:'ch_overwork',tier:'case',mood:'hospital',needCase:true,
  title:'人倒下了',
  text:x=>{const t=TEAM(x.c),w=t.sort((a,b)=>a.energy-b.energy)[0];
    return `${w?w.name:'组里有人'}在办公室晕过去了，送到医院说是长期睡眠不足加急性胃炎，医生让至少休两周。`},
  choices:[
   {label:'让他休，活分给别人',note:'全组体力 -6，交付 -5',
    apply:x=>{EN(TEAM(x.c),-6);Q(x.c,'work',-5)}},
   {label:'外聘一位律师顶上',cost:430000,note:'不掉进度',
    apply:x=>{addNews('团队','临时外聘了一位律师顶上。')}}],
  onSkip:x=>{EN(TEAM(x.c),-14);Q(x.c,'work',-10);addBuzz(-4)}}
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
 ['市场','建设工程领域争议激增，多家所紧急扩招工程法律方向律师。']
];
