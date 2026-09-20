'use strict';
// 静态数据表：岗位、部门、案型、客户、场地、设施、对手、目标
const KEY='law_firm_sim_v1',VERSION=1;

// ── 人 ──────────────────────────────────────────────────────
// 岗位 → [名称, 主能力]
const roles={
  partner:['合伙人','biz'],
  litigator:['诉讼律师','trial'],
  corporate:['非诉律师','dili'],
  associate:['授薪律师','res'],
  paralegal:['律师助理','dili'],
  bd:['市场与客户关系','biz']
};
const roleColors={partner:'#3a5878',litigator:'#8a3b33',corporate:'#3f6b5c',associate:'#5a5b86',paralegal:'#7a6a44',bd:'#8b5a3c'};
const STATS=[['trial','庭辩'],['res','研究'],['biz','商务'],['dili','尽调']];
const names=['应知遥','裴叙','关砚舟','宋怀安','邬清','纪淮','闻见山','岑渡','霍青衣','司徒白','梅长孺','连舸','蔺照','游砚','詹清越','傅秋声','慕行止','卫阑','邢照野','昝停云','冉溯','喻不归','葛明烛','宗庭','商未晚','荀直','阚山','弋南','谭引之','曲未平'];
const traits=['稳健','钻研型','较真','高效率','会来事'];
const starTraits={
  rain:{name:'创收王',desc:'参与案件的收费水平大幅提升'},
  auth:{name:'学术权威',desc:'更容易上明镜榜，行业声望加成'},
  media:{name:'媒体宠儿',desc:'口碑收益更强，但存在翻车风险'},
  all:{name:'万金油',desc:'参与案件的结案评级明显提升'}
};

// ── 部门与案型 ──────────────────────────────────────────────
const DEPTS={
  lit:{name:'诉讼部',color:'#8a3b33',court:true},
  corp:{name:'公司部',color:'#3a5878',court:false},
  ip:{name:'知产部',color:'#3f6b5c',court:true},
  crim:{name:'刑辩部',color:'#6b4a7a',court:true}
};
// mult 收费倍率 / bias 四维天然偏向 / rk 基础风险倾向 / scales 可用规模
const CASE_TYPES=[
  {id:'contract', dept:'lit', name:'合同纠纷',     mult:1.00, bias:'fact', rk:1, scales:['small','major']},
  {id:'equity',   dept:'lit', name:'股权纠纷',     mult:1.25, bias:'law',  rk:2, scales:['small','major']},
  {id:'constr',   dept:'lit', name:'建工纠纷',     mult:1.35, bias:'fact', rk:2, scales:['major','mega']},
  {id:'labor',    dept:'lit', name:'劳动争议',     mult:0.70, bias:'deal', rk:1, scales:['small']},
  {id:'enforce',  dept:'lit', name:'执行异议',     mult:0.85, bias:'work', rk:2, scales:['small','major']},
  {id:'counsel',  dept:'corp',name:'常年法律顾问', mult:0.90, bias:'work', rk:0, scales:['small','major']},
  {id:'finance',  dept:'corp',name:'股权融资',     mult:1.30, bias:'deal', rk:1, scales:['major']},
  {id:'ma',       dept:'corp',name:'并购重组',     mult:1.70, bias:'deal', rk:2, scales:['major','mega']},
  {id:'ipo',      dept:'corp',name:'IPO 辅导',     mult:2.00, bias:'work', rk:3, scales:['mega']},
  {id:'compli',   dept:'corp',name:'合规整改',     mult:1.10, bias:'work', rk:0, scales:['small','major']},
  {id:'tm',       dept:'ip',  name:'商标侵权',     mult:0.95, bias:'fact', rk:1, scales:['small','major']},
  {id:'patent',   dept:'ip',  name:'专利无效',     mult:1.40, bias:'law',  rk:1, scales:['major']},
  {id:'copy',     dept:'ip',  name:'著作权纠纷',   mult:0.90, bias:'law',  rk:1, scales:['small','major']},
  {id:'secret',   dept:'ip',  name:'商业秘密',     mult:1.45, bias:'fact', rk:3, scales:['major','mega']},
  {id:'ecrime',   dept:'crim',name:'经济犯罪辩护', mult:1.55, bias:'law',  rk:3, scales:['major','mega']},
  {id:'bail',     dept:'crim',name:'取保候审',     mult:0.75, bias:'deal', rk:3, scales:['small']},
  {id:'appeal',   dept:'crim',name:'二审改判',     mult:1.20, bias:'law',  rk:2, scales:['small','major']},
  {id:'family',   dept:'crim',name:'家事继承',     mult:1.00, bias:'deal', rk:1, scales:['small','major']}
];
const typeById=id=>CASE_TYPES.find(t=>t.id===id);

// 规模三档
const scaleDefs={
  small:{name:'小案',     base:350000,  weeks:8,  need:2, cap:7.5},
  major:{name:'大案',     base:1700000, weeks:18, need:3, cap:9.2},
  mega: {name:'长期项目', base:5000000, weeks:32, need:4, cap:9.5}
};

// 四阶段：stat 决定推进速度，quality 决定这阶段涨哪个维度
const PHASES=[
  {name:'接案与方案',stat:'biz',  quality:'deal'},
  {name:'调查取证',  stat:'dili', quality:'fact'},
  {name:'论证与主攻',stat:'trial',quality:'law'},
  {name:'收尾交付',  stat:'res',  quality:'work'}
];
const QUALITIES=[['fact','事实'],['law','法理'],['deal','博弈'],['work','交付']];

// ── 收费方案 ────────────────────────────────────────────────
// up 签约比例 / end 结案固定比例 / resultK 结果系数权重 / hourly 是否按周计费
const FEES={
  fixed: {name:'固定收费',up:.70,end:.30,resultK:.35,hourly:0,
    desc:'签约收七成，结案收三成。旱涝保收，办得再漂亮也不多给。'},
  risk:  {name:'风险代理',up:.10,end:0,  resultK:1.75,hourly:0,
    desc:'先收一成，结案按标的和结果分成。全胜爆赚，败诉基本白干。'},
  hourly:{name:'计费小时',up:.10,end:.25,resultK:.10,hourly:1,
    desc:'每周按人头结算，现金流最平滑；账单会一点点磨掉客户满意度。'}
};
const HOUR_RATE=22000; // 每人每周计费

// 办案投入档
const EFFORTS={
  lean:  {name:'精简办理',cost:.6, q:-.12,note:'每周开支低，四维涨得慢'},
  normal:{name:'常规投入',cost:1,  q:0,   note:'按部就班'},
  heavy: {name:'重兵投入',cost:1.7,q:.18, note:'开支高，四维涨得快，客户更满意'}
};

// 每周指令
const ORDERS={
  rush:   {name:'加班赶工',hint:'进度 +35%，本周质量 -30%，体力 -3；连赶三周会出事'},
  quality:{name:'死磕细节',hint:'本周质量 +30%，进度 -20%'},
  care:   {name:'团建安抚',hint:'全组体力 +6，默契积累加快'},
  save:   {name:'控成本',  hint:'本周人力开支 -35%，质量 -15%，体力 -2'},
  free:   {name:'放手',    hint:'14% 概率撞上意外突破'}
};

// ── 场地与设施 ──────────────────────────────────────────────
const OFFICES=[
  {name:'写字楼隔断间',room:'三张桌子一台打印机',    rent:50000, cap:8, slots:1,upgrade:2600000,desc:'一个案组独立推进，先办出一个像样的代表案。'},
  {name:'整层办公区',  room:'独立会客室',            rent:120000,cap:12,slots:2,upgrade:7000000,desc:'两条案线并行，要在人手和排期之间取舍。'},
  {name:'CBD 自有楼层',room:'两间会议室 + 模拟法庭',rent:250000,cap:18,slots:3,upgrade:null,   desc:'三条案线并行，真正按组合经营一家所。'}
];
const facilities=[
  ['db',   '案例数据库',    '收尾交付推进 +10%，结案评级 +0.12',       3200000],
  ['room', '独立会客层',    '接案阶段推进 +10%，客户满意度 +8，结案评级 +0.10',5400000],
  ['risk', '内部合规风控岗','所有执业风险涨幅 ×0.65',                  7500000],
  ['court','模拟法庭室',    '主攻阶段推进 +12%，诉讼类案件结案评级 +0.30',9800000]
];

// ── 市场 ────────────────────────────────────────────────────
// 排期窗口：月份 → [媒体关注倍率, 拥挤度 0~1, 名称]
const WINDOWS={
  1:[.95,.55,'春节前后'],2:[.95,.35,'节后'],  3:[1.0,.15,'开春窗口'],4:[1.0,.30,''],
  5:[1.0,.35,''],        6:[1.1,.60,'年中结账'],7:[1.05,.45,'暑期'], 8:[1.05,.45,'暑期'],
  9:[1.0,.15,'秋季窗口'],10:[1.05,.40,''],    11:[1.25,.95,'年底结案潮'],12:[1.3,1.0,'年底结案潮']
};
const trends=[
  ['建工纠纷','地产链条爆雷，工程款官司排到明年'],
  ['劳动争议','裁员潮带来一大批个案'],
  ['合规整改','监管新规落地，企业排队做合规'],
  ['商业秘密','技术人员流动引发一批竞业官司'],
  ['并购重组','产业整合加速，交易所排队'],
  ['经济犯罪辩护','专项行动收网，刑辩需求上来']
];
const clientDefs={
  sme:   {name:'本地中小企业',      desc:'合同、劳动、常年顾问的主力来源',likes:['合同纠纷','劳动争议','常年法律顾问','执行异议']},
  listed:{name:'上市公司与投资机构',desc:'并购、融资、合规与商业秘密',    likes:['并购重组','股权融资','IPO 辅导','合规整改','商业秘密']},
  hnwi:  {name:'个人高净值',        desc:'家事、继承、股权与著作权',      likes:['家事继承','股权纠纷','著作权纠纷']},
  gov:   {name:'政府与国企',        desc:'建工、合规与执行',              likes:['建工纠纷','合规整改','执行异议','专利无效']},
  indiv: {name:'刑事与家事个人客户',desc:'刑辩、取保、家事',              likes:['经济犯罪辩护','取保候审','二审改判','家事继承']}
};
const RIVAL_DEFS=[
  ['恒泰律师事务所','老牌红圈所，什么都接，报价也最高',9],
  ['京衡诉讼团队','只做诉讼，庭上出了名的难缠',7],
  ['汇通法律服务','低价走量，小案抢得最凶',5],
  ['远东（中国）办公室','外所中国办公室，专啃跨境并购',8],
  ['执一律师事务所','新锐精品所，挑案子挑客户',6],
  ['广源律师事务所','关系型，政府和国企项目吃得开',7]
];

// ── 当事人名字池：拼出「XX 诉 XX」 ─────────────────────────
const PARTY_A=['德昌','瑞丰','中启','华勤','恒业','安泰','天穹','远陆','嘉禾','科远','沃德','鼎立','盛联','广厦','明辉','北岸','长风','新元','振华','同泰'];
const PARTY_SUF=['建设','科技','实业','置业','医药','物流','食品','传媒','化工','新材料','电子','投资','机械','环保'];
const SURNAMES=['陈','李','王','张','吴','周','郑','许','何','邓','冯','曾','蒋','韩','唐'];

// 案情一句话：按案型取，不套模板
const BRIEFS={
  contract:['一批货验收时说没问题，钱付了三成，剩下七成拖了两年。','合同盖的是分公司的章，总公司说这事跟他们没关系。','双方在微信上把价改了，纸面合同一个字没动。'],
  equity:['当年口头约定的干股，现在公司值钱了，章程上查无此人。','增资那轮的对赌到期，创始人说他从没签过那份补充协议。','兄弟俩一人一半，其中一个把公司的钱挪去买了房。'],
  constr:['工程干完三年，结算单签了字，审计口径又变了一次。','甲方说是质量问题，施工方说是设计图本身就有问题。','层层转包到第四手，最后干活的那批人要钱要到了法院门口。'],
  labor:['末位淘汰被公司算成不胜任，赔偿金按 N 还是 2N 吵了半年。','加班记录全在一个已经注销的考勤系统里。','签的是劳务协议，干的是全职的活，社保一天没交。'],
  enforce:['判决生效两年，被执行人名下干干净净，钱都在他爱人账上。','查封的那套房，突然冒出来一个住了十年的租客。','公司刚被执行就换了法人，新法人是个七十岁的门卫。'],
  counsel:['这家公司过去三年的合同模板都是从网上抄的，没人改过。','新老板上任要做全套梳理，一查发现十七份协议已经过期。','董事会要一个随时能接电话的人，出事了别让他们等排期。'],
  finance:['投资人临签字前加了一条回购，创始人没看懂就要签。','这轮估值定得虚高，老股东不同意稀释。','钱到账了，工商变更卡在一个小股东的签字上。'],
  ma:['尽调做到一半，发现标的公司有一笔没入账的对外担保。','两边都想要控制权，只肯在董事会席位上各让一步。','交割日定了，反垄断申报还没批下来。'],
  ipo:['报告期内有一笔关联交易，怎么解释都不太干净。','实控人认定这一项，交易所问询函来了三轮。','股权代持历史遗留了十一年，要一个一个还原。'],
  compli:['新规下来三个月，这家公司连合规负责人都还没定。','内部自查报告写得漂亮，实际业务一条没改。','分公司我行我素，总部的制度传不下去。'],
  tm:['对方注册的商标和他们家只差一个偏旁，店还开在同一条街。','用了八年的老字号，被别人抢先注册了。','电商平台一封投诉就把整个店铺下架了。'],
  patent:['对方拿一个快过期的专利，开口要八位数。','这项技术在申请日之前就已经公开发表过。','权利要求写得太宽，宽到把行业惯例也圈进去了。'],
  copy:['一段三十秒的配乐，赔偿主张按整部片子算。','照片是员工在职期间拍的，著作权归谁没人写过。','翻译作品被人整本搬走，只改了书名。'],
  secret:['核心团队集体跳槽，第二个月对家出了同款产品。','竞业协议签了，补偿金一分没发过。','服务器日志显示，离职前一周有人打包下载了整个图库。'],
  ecrime:['账面上是借款，检方说是非法吸收公众存款。','老板说他只管销售，财务的事一概不知。','涉案金额认定差了两千万，全看那批合同怎么定性。'],
  bail:['人进去十二天，家属连案由都问不清楚。','取保的条件谈好了，保证金凑不齐。','这案子本身够不上羁押必要，地方上不肯松口。'],
  appeal:['一审认定的关键证据，取证程序上有硬伤。','量刑比同类案件重了两年，理由只写了半页。','新证据在一审开庭后才找到，够不够"新"是个问题。'],
  family:['老人立了三份遗嘱，一份公证，两份手写。','离婚时说好房子给孩子，过户一直没办。','再婚配偶和前一段的子女，为一套安置房僵了三年。']
};

// 结案评级 → 结果文案。court=true 走诉讼口径，false 走非诉口径
const VERDICTS=[
  [8.5,'全部诉讼请求获支持','全部核心条件达成'],
  [7.0,'主要诉求获支持',    '主要条件谈成'],
  [5.5,'部分支持',          '部分条件让步'],
  [4.0,'调解结案',          '勉强收尾'],
  [0,  '败诉',              '交易终止']
];

// ── 执业红线 ────────────────────────────────────────────────
const RISK_TIERS=[
  [85,'停业整顿','司法局已经立案调查，随时可能停业'],
  [65,'被投诉',  '手上有正在处理的投诉，再出事就不好收场'],
  [40,'已被提示','司法局发过风险提示，注意点'],
  [0, '正常',    '执业记录干净']
];
const RISK_DECAY=4,RISK_DECAY_WEEKS=9;

const MAX_POLISH=2;

// ── 开局 ────────────────────────────────────────────────────
const ORIGINS={
  spinoff:{name:'大所出走',line:'带走一个老客户和一名资深律师。原所的竞业条款还没过，前两个案子接不到上市公司。',
    money:3000000,fame:1,prestige:2,tag:'标准',noListed:2},
  scholar:{name:'法学院明星',line:'论文比案子多。同行敬你三分，客户不知道你是谁。声望高，钱少。',
    money:1200000,fame:0,prestige:6,tag:'声望流'},
  funded: {name:'家里出钱',line:'启动资金到位，代价是每年被抽走一百五十万，两年内要交出一件像样的案子。',
    money:8000000,fame:.5,prestige:0,levy:1500000,deadline:104,tag:'高压'},
  three:  {name:'三人草台班子',line:'三个人一间隔断。前两个案子只能接小案，办砸就散伙。',
    money:800000,fame:.3,prestige:0,small:true,smallOnly:2,tag:'困难'}
};

// ── 目标与成就 ──────────────────────────────────────────────
const GOALS=[
  {id:'first', name:'第一个案子',desc:'办结并收到第一笔律师费',            check:()=>S.cases.length>=1,             reward:()=>{S.money+=600000}, rw:'开办补贴 ¥600,000'},
  {id:'good',  name:'办出口碑',  desc:'办结一件评级 7.5 以上的案子',       check:()=>S.cases.some(c=>c.score>=7.5), reward:()=>{S.fame+=2},       rw:'社会知名度 +2'},
  {id:'repeat',name:'回头客',    desc:'同一个客户委托你第 2 次',           check:()=>S.clients.some(c=>c.entries>=2),reward:()=>{S.money+=1200000},rw:'业务拓展金 ¥1,200,000'},
  {id:'list',  name:'登上明镜榜',desc:'拿下任意一项明镜榜年度提名',        check:()=>!!S.flags.listed,              reward:()=>{S.money+=1500000}, rw:'榜单分红 ¥1,500,000'},
  {id:'floor', name:'自己的楼层',desc:'升级到 CBD 自有楼层，开放三条案线', check:()=>S.office>=2,                   reward:()=>{S.prestige+=6},   rw:'行业声望 +6'},
  {id:'client',name:'客户版图',  desc:'五类客户资产总量达到 1,200',        check:()=>clientTotal()>=1200,           reward:()=>{S.fame+=3},       rw:'社会知名度 +3'},
  {id:'top',   name:'行业第一',  desc:'律所综合实力登顶行业榜单',          check:()=>industryRank()[0].name===S.firm,reward:()=>{S.prestige+=10}, rw:'行业声望 +10'}
];
const ACHIEVEMENTS=[
  ['perfect','全胜',      '办结一件评级 9.0 以上的案子',      ()=>S.cases.some(c=>c.score>=9)],
  ['bigfee', '一单顶一年','单个案子收费超过 ¥15,000,000',     ()=>S.cases.some(c=>c.paid>=15000000)],
  ['busy',   '高产之年',  '同一年内办结 5 个案子',            ()=>{const m={};return S.cases.some(c=>(m[c.endYear]=(m[c.endYear]||0)+1)>=5)}],
  ['stars',  '名家云集',  '同时拥有 3 名 ★ 名律师',           ()=>S.staff.filter(e=>e.star).length>=3],
  ['risky',  '刀尖上走路','风险代理连赢 3 次',                ()=>(S.flags.riskWin||0)>=3],
  ['clean',  '一身清白',  '红线全程不超过 20，且办结 10 个案子',()=>S.cases.length>=10&&(S.flags.riskPeak||0)<20],
  ['duo',    '黄金搭档',  '同一对律师合作办结 3 个案子',      ()=>Object.values(S.chemistry).some(n=>n>=3)],
  ['full',   '人才济济',  '团队规模达到 18 人',               ()=>S.staff.length>=18],
  ['allfac', '家底齐备',  '建成全部四项所内设施',             ()=>facilities.every(f=>S.facilities[f[0]])],
  ['retain', '常年顾问',  '同时持有 3 份常年法律顾问合同',    ()=>S.retainers.length>=3]
];
