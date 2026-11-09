/* Local editorial prototype. Public source notes and fictional samples stay visibly distinct. */
(() => {
  'use strict';
  const data = window.EDITORIAL_DATA || {research:[],calls:[],phd:[]};
  const archive = window.JOB_ARCHIVE || {meta:{},items:[]};
  const leaderboards = window.DESIGN_LEADERBOARDS || {checkedAt:null,categories:[]};
  const release = window.SITE_RELEASE || {};
  let detailReturnHash = '#/home', detailPushed = false;
  const main = document.querySelector('#main');
  const dialog = document.querySelector('#detail-dialog');
  const e = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let saved = new Set(Array.isArray(readLocal('jryt-saved', [])) ? readLocal('jryt-saved', []) : []);
  let route = '', query = new URLSearchParams(), filters = {}, toastTimer;
  const jobs = archive.items.map(job => {
    const historical = job.historical ?? archive.meta.historical ?? false;
    return {...job, id:`job-${job.id}`, kind:'jobs', category:'高校招聘', organization:job.school || job.organization || '机构待确认', summary:job.summary || job.note || job.title, tags:job.tags || [job.discipline,job.level].filter(Boolean), historical, sourceLabel:job.sourceName || '查看官方公告', details:job.details || [{label:'院校与地区',value:[job.school,job.province,job.city].filter(Boolean).join(' · ')},{label:'学校层次',value:job.level || '未披露'},{label:'招聘方向',value:job.discipline || '以原文为准'},{label:'岗位类型',value:job.jobType || '以原文为准'},{label:'原公告截止说明',value:job.deadlineText || job.deadline || '未披露'},{label:'最近核验',value:job.verifiedAt || '未核验'}], body:job.body || [job.note || '请通过官方原文查看具体岗位条件。', historical ? '这是历史公告，尚未重新核验当前有效性。请结合最新官方公告和岗位附件确认。' : '本站整理官方公告中的岗位信息，具体申请条件与提交方式请查看原始来源。']};
  });
  const research = data.research.map(x => ({...x,kind:'research'}));
  const calls = data.calls.map(x => ({...x,kind:'calls'}));
  const phd = data.phd.map(x => ({...x,kind:'phd'}));
  const sourceDate = value => {
    if (!value) return '未披露';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false}) + '（北京时间）' : value;
  };
  const modelId = (board, row) => `model-${board.id}-${row.name}`;
  const countText = value => value == null ? '未披露' : Number(value).toLocaleString('en-US');
  const modelResults = leaderboards.categories.flatMap(board => board.rows.map(row => ({
    id:modelId(board,row), title:row.name, organization:row.organization, kind:'ai', category:board.label,
    discipline:board.label, publicResult:true, tags:[board.label,board.sourceName],
    summary:`${board.title} · 原榜第 ${row.rank} 名 · ${board.metric} ${row.score}。${board.description}`,
    details:[{label:'原榜名次',value:row.rank},{label:board.metric,value:row.score},{label:board.confidenceLabel || '置信区间',value:row.confidence || '未披露'},...(row.rankRange?[{label:'原榜排名范围',value:row.rankRange}]:[]),{label:board.sampleLabel || '样本量',value:countText(row.samples)},{label:'评测来源',value:board.sourceName},{label:'来源更新',value:sourceDate(board.sourceUpdatedAt)},{label:'本站收录',value:board.checkedAt || leaderboards.checkedAt || '未披露'}],
    body:[board.metricDescription,...board.notes], sourceUrl:row.url || board.sourceUrl, sourceLabel:'查看原始榜单'
  })));
  const all = [...research,...jobs,...phd,...calls,...modelResults];
  const byId = new Map(all.map(x => [x.id,x]));
  const categories = {research:'研究成果',jobs:'高校招聘',phd:'博士申请',calls:'征稿机会',ai:'设计 AI 评测'};
  const imageFor = item => item.id === 'agentic-design' ? 'assets/hero-design.svg' : /古画|修复|诗|Poem|Ink/i.test(item.title+' '+item.summary) ? 'assets/research-ink.svg' : 'assets/research-forms.svg';
  const timeZones = new Map();
  const timeZoneOf = item => {
    const zone = item.dateTimezone;
    if (typeof zone !== 'string' || !zone.trim()) return null;
    if (!timeZones.has(zone)) {
      try { new Intl.DateTimeFormat('en', {timeZone:zone}).format(); timeZones.set(zone, zone); }
      catch { timeZones.set(zone, null); }
    }
    return timeZones.get(zone);
  };
  const currentDate = item => new Intl.DateTimeFormat('sv-SE', {timeZone:timeZoneOf(item) || 'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const timeZoneLabel = item => timeZoneOf(item) || '时区未披露（按北京时间判断）';
  const stateOf = item => {
    if (item.availability === 'closed') return 'closed';
    if (item.availability === 'expired') return 'expired';
    const today = currentDate(item);
    const cutoff = item.deadline || item.deadlineUpperBound;
    if (cutoff && cutoff < today) return 'expired';
    if (item.historical) return 'unknown';
    if (item.availability === 'open') {
      const verified = item.sourceVerifiedAt || item.verifiedAt;
      const verifiedDay = typeof verified === 'string' ? verified.slice(0,10) : '';
      const requestedDays = Number(item.reverifyAfterDays ?? release.reverifyAfterDays ?? 30);
      const maxAgeDays = Number.isFinite(requestedDays) && requestedDays >= 0 ? requestedDays : 30;
      const ageDays = (Date.parse(today) - Date.parse(verifiedDay)) / 86400000;
      if (!Number.isFinite(ageDays) || ageDays > maxAgeDays) return 'unknown';
      return 'open';
    }
    return ['not_started','unknown'].includes(item.availability) ? item.availability : 'unknown';
  };
  const isOpportunity = item => ['jobs','phd','calls'].includes(item.kind);
  const isCurrent = item => !['expired','closed'].includes(stateOf(item));
  const recommendable = item => !isOpportunity(item) || isCurrent(item) || item.featured === true;
  const statusMatches = item => filters.status === 'all' || (filters.status ? stateOf(item) === filters.status : isCurrent(item));
  const statusNames = {expired:'已截止',closed:'已关闭／取消',open:'开放中',not_started:'尚未开始',unknown:'开放状态待确认'};
  const badge = item => (item.isDemo ? '<span class="badge demo">示例内容</span>' : item.historical ? '<span class="badge archive">历史样本</span>' : `<span class="badge source">${item.publicResult?'公开评测':'真实来源'}</span>`) + (isOpportunity(item) ? `<span class="badge job-state ${stateOf(item)}">${statusNames[stateOf(item)]}</span>` : '');
  const arrow = '<span aria-hidden="true">↗</span>';
  const saveIcon = '<svg viewBox="0 0 18 22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 2h12v18l-6-4-6 4z"/></svg>';
  const saveButton = (item, label=false) => `<button class="bookmark" data-save="${e(item.id)}" aria-pressed="${saved.has(item.id)}" aria-label="${saved.has(item.id)?'取消收藏':'收藏'}：${e(item.title)}">${saveIcon}${label?`<span>${saved.has(item.id)?'已收藏':'收藏这条内容'}</span>`:''}</button>`;
  const openTitle = (item, extra='') => `<button class="plain-link ${extra}" data-open="${e(item.id)}">${e(item.title)}</button>`;
  const notice = text => `<div class="notice"><span class="dot"></span><span>${text}</span></div>`;
  const title = (en,cn,desc,stat='') => `<div class="page-heading"><div><div class="kicker">${en}</div><h1>${cn}</h1><p>${desc}</p></div>${stat}</div>`;
  const sectionTitle = (cn,en,href,label='查看全部') => `<div class="section-title"><h2>${cn}<span class="english">${en}</span></h2>${href?`<a class="text-link" href="${href}">${label} ↗</a>`:''}</div>`;
  const empty = (text='试试其他关键词或筛选条件。', savedPage=false) => `<div class="empty-state"><div class="empty-icon">◇</div><h2>${savedPage?'给下一步，留一点线索':'暂时没有匹配的内容'}</h2><p>${text}</p>${savedPage?'<a class="button secondary" href="#/home">去看看精选 ↗</a>':'<button class="button secondary" data-reset>清空筛选</button>'}</div>`;
  function matches(item, keyword='') { return [item.title,item.summary,item.organization,item.school,item.discipline,item.province,item.city,item.category,...(item.tags || [])].join(' ').toLowerCase().includes(keyword.trim().toLowerCase()); }
  function select(id,caption,options) {return `<select id="${id}" data-filter="${id}" aria-label="${caption}"><option value="">${caption}</option>${options.map(option=>{const [value,label]=Array.isArray(option)?option:[option,option];return `<option value="${e(value)}" ${filters[id]===value?'selected':''}>${e(label)}</option>`;}).join('')}</select>`;}
  function statusFilter() {return select('status','当前机会',[['all','全部含历史'],['open','开放中'],['not_started','尚未开始'],['unknown','状态待确认'],['expired','已截止'],['closed','已关闭／取消']]);}
  function searchField(placeholder) {return `<input id="local-keyword" data-filter="keyword" type="search" value="${e(filters.keyword || '')}" placeholder="${placeholder}" aria-label="${placeholder}">`;}
  function articleCard(item) {return `<article class="article-card"><button class="article-image plain-link" data-open="${e(item.id)}" aria-label="阅读：${e(item.title)}"><img src="${imageFor(item)}" alt="${/ink/.test(imageFor(item))?'山水与数字修复主题插画':'设计与智能协作主题插画'}" loading="lazy"></button><div class="article-label">${e(item.discipline || '设计研究')} ${badge(item)}</div><h3>${openTitle(item)}</h3><p>${e(item.summary)}</p><div class="article-meta"><span>${e(item.organization || '研究观察')}</span><span>·</span><span>编辑导读</span></div>${saveButton(item)}</article>`;}
  function opportunityCard(item) {return `<article class="opportunity-card"><div class="card-top"><span class="institution-icon" aria-hidden="true">${item.kind==='phd'?'博':'文'}</span><span>${e(item.organization)}</span>${saveButton(item)}</div><div class="article-label">${e(item.category || categories[item.kind])} ${badge(item)}</div><h2>${openTitle(item)}</h2><p>${e(item.summary)}</p><dl class="card-facts"><div><dt>${item.kind==='phd'?'资助类型':'机会类型'}</dt><dd>${e(item.funding || item.type || '未披露')}</dd></div><div><dt>${item.isDemo?'示例截止日期':'截止日期'}</dt><dd>${e(item.deadlineText || item.deadline || '未披露')}<small class="date-zone">${e(timeZoneLabel(item))}</small></dd></div><div><dt>研究方向</dt><dd>${e(item.discipline)}</dd></div><div><dt>${item.kind==='phd'?'地区':'机会状态'}</dt><dd>${e(item.kind==='phd' ? item.region || '未披露' : item.isDemo ? '演示条目' : statusNames[stateOf(item)])}</dd></div></dl><div class="card-bottom">${(item.tags || []).slice(0,2).map(t=>`<span class="tag">${e(t)}</span>`).join('')}<button class="plain-link detail-link" data-open="${e(item.id)}">查看要求 ↗</button></div></article>`;}
  function compact(item,index) {return `<article class="compact-row"><span class="number">${String(index+1).padStart(2,'0')}</span><div><h3>${openTitle(item)}</h3><p>${e(categories[item.kind])} · ${e(item.organization)} &nbsp; ${badge(item)}</p></div>${saveButton(item)}</article>`;}
  function homePage() {
    const eligible = all.filter(x=>!x.publicResult && !x.isDemo && recommendable(x));
    const feature = eligible.find(x=>x.featured) || research.find(x=>!x.isDemo) || eligible[0] || research[0];
    const dates = [...calls,...phd].filter(x=>x.deadline && ['open','not_started'].includes(stateOf(x))).sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,3);
    const edition = release.builtAt ? sourceDate(release.builtAt) : '本地内容预览';
    return `<div class="edition-line"><b>THE EDIT &nbsp; / &nbsp; 艺术与设计的下一步</b><span class="date">${e(edition)}</span></div>
    <section class="hero" aria-label="精选导读"><div class="hero-copy"><span class="eyebrow">本期关注 &nbsp; ART × DESIGN</span><h1>${e(feature?.title || '让好信息，连接你的下一步。')}</h1><p>${e(feature?.summary || '内容正在整理。你可以浏览各栏目，查看已收录的研究、职业机会与公开模型成绩。')}</p>${feature?`<button class="button" data-open="${e(feature.id)}">阅读详情 ${arrow}</button><div class="hero-meta"><span>来源：${e(feature.organization)}</span><span>${e(categories[feature.kind])}</span>${badge(feature)}</div>`:'<a class="button" href="#/ai">浏览公开榜单 ↗</a>'}</div><div class="hero-art"><img src="assets/hero-design.svg" alt="球体、台阶与几何框架组成的艺术设计主题插画"><div class="art-caption"><span>DESIGNING WITH INTELLIGENCE</span><span>原创编辑插画 / 非论文原图</span></div></div></section>
    <section class="quick-links" aria-label="探索栏目">${[['jobs','↗','发现好工作','高校艺术与设计岗位'],['phd','⌘','寻找博士机会','研究方向、名额与资助'],['research','▤','跟进新研究','论文解读与投稿机会'],['ai','◈','查看模型榜单','公开成绩与设计相关能力']].map(([r,icon,h,p])=>`<a class="quick-link" href="#/${r}"><span class="quick-icon" aria-hidden="true">${icon}</span><span><strong>${h}</strong><small>${p}</small></span><span class="arrow">↗</span></a>`).join('')}</section>
    <div class="home-columns"><div>${sectionTitle('值得读的新研究','RESEARCH NOTES','#/research')}<div class="research-grid">${research.length?research.filter(x=>x.id!==feature?.id).slice(0,2).map(articleCard).join('') || research.slice(0,2).map(articleCard).join(''):empty('暂无已收录的研究成果。')}</div><section class="latest-section">${sectionTitle('为下一步，留意这些','NEXT OPPORTUNITIES','#/phd','探索机会')}<div class="compact-list">${[phd,calls,jobs].map(items=>items.find(x=>x.featured===true && recommendable(x)) || items.find(recommendable)).filter(Boolean).map(compact).join('') || empty('暂无已收录的申请与招聘机会。')}</div></section></div><aside class="home-rail"><section class="deadline-box"><div class="rail-heading"><h2>机会日历</h2><span class="label">UP NEXT</span></div>${dates.map(item=>`<div class="deadline-entry"><div class="date-tile"><strong>${e(item.deadline.slice(8))}</strong><small>${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(item.deadline.slice(5,7))-1]}</small></div><div><h3>${openTitle(item)}</h3><p>${e(categories[item.kind])}${item.isDemo?' · 示例':''}</p></div></div>`).join('')}<p class="rail-note">${dates.some(x=>x.isDemo)?'包含功能演示日期，请勿据此申请。':dates.length?'展示有明确日期且确认开放或尚未开始的机会，具体时间以官方原文为准。':'暂无已确认的近期截止日期。'}</p></section><section class="lab-promo"><span class="label">DESIGN AI RANKINGS &nbsp; ↗</span><h3>创作工具怎么选，<br>先看公开成绩。</h3><p>按创作场景查看模型排名，追溯分数、样本与评测来源。</p><a href="#/ai">查看设计 AI 模型榜 <span>↗</span></a></section></aside></div>`;
  }
  function jobsPage() {
    const items=jobs.filter(x=>matches(x,filters.keyword)&&(!filters.province||x.province===filters.province)&&(!filters.discipline||matches(x,filters.discipline))&&statusMatches(x));
    if (filters.sort==='school') items.sort((a,b)=>(a.school || '').localeCompare(b.school || '','zh-CN')); else items.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));
    const pageSize=12,total=Math.max(1,Math.ceil(items.length/pageSize));filters.page=Math.min(filters.page||1,total);const start=(filters.page-1)*pageSize;
    return `${title('CAREER OPPORTUNITIES','找到下一站，让热爱继续。','全国高校艺术与设计岗位，按方向、地区和公告状态筛选。',`<div class="heading-stat"><strong>${jobs.length}</strong>条招聘公告</div>`)}${notice(jobs.some(x=>x.historical) ? `含 ${jobs.filter(x=>x.historical).length} 条历史公告，历史条目的当前有效性尚待复核。默认展示当前机会，已结束条目可切换“全部含历史”查看。` : '默认展示当前机会，包含开放状态待确认的条目；已结束条目可切换“全部含历史”查看。开放状态、截止说明与核验时间见详情。')}<div class="filter-bar">${searchField('学校、岗位、学科或城市')}${select('province','全部省份',[...new Set(jobs.map(j=>j.province).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN')))}${select('discipline','全部方向',['设计','美术','音乐','舞蹈','数字媒体','艺术理论'])}${statusFilter()}<button class="reset-button" data-reset>重置</button></div><div class="result-line"><span>找到 <b>${items.length}</b> 条公告</span>${select('sort','最新发布优先',[['school','按学校名称']])}</div>${items.length?`<div class="table-container"><table><thead><tr><th>学校 / 招聘公告</th><th>地区</th><th>方向与层次</th><th>公告截止</th><th>日期状态</th><th>操作</th></tr></thead><tbody>${items.slice(start,start+pageSize).map(item=>`<tr><td><strong><button class="plain-link" data-open="${e(item.id)}">${e(item.school)}</button></strong><button class="table-title" data-open="${e(item.id)}">${e(item.title)}</button></td><td>${e(item.province)}<small>${e(item.city)}</small></td><td>${e(item.discipline)}<small>${e(item.level)}</small></td><td>${e(item.deadlineText || item.deadline || '未披露')}<small>${e(timeZoneLabel(item))}</small><small>核验 ${e(item.verifiedAt || item.sourceVerifiedAt || '未核验')}</small></td><td><span class="job-state ${stateOf(item)}">${statusNames[stateOf(item)]}</span></td><td><div class="row-actions">${saveButton(item)}<button class="plain-link" data-open="${e(item.id)}" aria-label="查看${e(item.school)}公告">↗</button></div></td></tr>`).join('')}</tbody></table></div><div class="pagination"><span>显示 ${start+1}–${Math.min(start+pageSize,items.length)} 条 / 共 ${items.length} 条</span><div><button class="page-button" data-page="${filters.page-1}" ${filters.page===1?'disabled':''}>← 上一页</button><span class="page-button current">${filters.page} / ${total}</span><button class="page-button" data-page="${filters.page+1}" ${filters.page===total?'disabled':''}>下一页 →</button></div></div>`:empty()}`;
  }
  function phdPage() {
    const items=phd.filter(x=>matches(x,filters.keyword)&&(!filters.region||x.region===filters.region)&&(!filters.funding||x.funding===filters.funding)&&statusMatches(x));
    return `${title('DOCTORAL PATHWAYS','让好问题，找到研究的地方。','关注博士项目、研究方向与资助条件，为下一段学术旅程做好准备。')}${notice(phd.some(x=>x.isDemo)?'含虚构产品示例，示例已单独标注，请勿据此申请。':'默认展示当前机会，已结束项目可切换“全部含历史”查看。未明确的名额、资助和截止时间保持未知，请查看项目原文。')}
    <div class="filter-bar">${searchField('搜索研究方向、项目或关键词')}${select('region','全部地区',[...new Set(phd.map(x=>x.region).filter(Boolean))])}${select('funding','全部资助类型',[...new Set(phd.map(x=>x.funding).filter(Boolean))])}${statusFilter()}<button class="reset-button" data-reset>重置</button></div><div class="result-line"><span><b>${items.length}</b> 条博士项目信息</span><span>条件透明 · 方向优先</span></div>${items.length?`<div class="opportunity-grid">${items.map(opportunityCard).join('')}</div>`:empty()}`;
  }
  function researchPage() {
    const isCalls=query.get('tab')==='calls';
    let items=(isCalls?calls:research).filter(x=>matches(x,filters.keyword)&&(!filters.discipline||matches(x,filters.discipline))&&(!isCalls||statusMatches(x)));
    return `${title('RESEARCH & PUBLICATION','读懂新研究，也找到你的表达。','从论文与专刊导读，到期刊、会议和作品征集。')}
    <div class="tabs"><a href="#/research" class="${!isCalls?'active':''}">研究成果 <span>${research.length}</span></a><a href="#/research?tab=calls" class="${isCalls?'active':''}">征稿机会 <span>${calls.length}</span></a></div>
    ${notice(isCalls ? (calls.some(x=>x.isDemo) ? '含虚构产品示例，示例已单独标注，请勿据此投稿。' : '默认展示当前机会，已结束征稿可切换“全部含历史”查看。根据原始来源整理投稿要求，未明确的信息保持未知。') : '研究卡片保留原始来源。本站提供编辑导读，请结合原文进一步阅读；配图为原创编辑插画。')}
    <div class="filter-bar">${searchField(isCalls?'搜索主题、征稿类型或关键词':'搜索论文、主题或研究团队')}${select('discipline','全部方向',['设计','人机交互','生成式 AI','数字艺术'])}${isCalls?statusFilter():''}<button class="reset-button" data-reset>重置</button></div>
    ${items.length?`<div class="${isCalls?'opportunity-grid':'research-grid research-full'}">${items.map(isCalls?opportunityCard:articleCard).join('')}</div>`:empty()}`;
  }
  function aiPage() {
    const board=leaderboards.categories.find(x=>x.id===query.get('board')) || leaderboards.categories[0];
    if (!board) return `${title('DESIGN AI RANKINGS','设计 AI 模型榜','按原始评测来源收录公开成绩。')}${empty('暂无通过检查的榜单快照，后续更新后将在这里展示。')}`;
    const items=board.rows.filter(row=>matches({title:row.name,organization:row.organization},filters.keyword)&&(!filters.organization||row.organization===filters.organization));
    const maxScore=Math.max(1,...board.rows.map(row=>row.score));
    return `<section class="leaderboard-page">${title('DESIGN AI RANKINGS','设计 AI 模型榜','汇集与艺术、设计创作相关的公开评测，按场景查看模型表现。',`<div class="heading-stat"><strong>${leaderboards.categories.length}</strong>个公开分项榜</div>`)}
    <nav class="leaderboard-tabs" aria-label="评测类别">${leaderboards.categories.map((x,i)=>`<a class="leaderboard-tab ${x.id===board.id?'active':''}" href="#/ai?board=${e(x.id)}" ${x.id===board.id?'aria-current="page"':''}><small>0${i+1}</small><strong>${e(x.label)}</strong><span>${x.rows.length} 个模型</span></a>`).join('')}</nav>
    <div class="leaderboard-grid"><div class="leaderboard-content"><div class="leaderboard-intro"><div><h2>${e(board.title)}</h2><p>${e(board.description)}</p></div><a class="source-pill" href="${e(board.sourceUrl)}" target="_blank" rel="noopener noreferrer">${e(board.sourceName)} ↗</a></div>
    <div class="leaderboard-toolbar filter-bar">${searchField('搜索模型或机构')}${select('organization','全部机构',[...new Set(board.rows.map(x=>x.organization))])}<button class="reset-button" data-reset>重置</button></div>
    <div class="leaderboard-result"><span>展示 <b>${items.length}</b> / ${board.rows.length} 个模型 · 保留原榜名次</span><span>${e(board.metric)} · 越高越好</span></div>
    ${items.length?`<div class="leaderboard-scroll" role="region" aria-label="${e(board.label)}模型排名" tabindex="0"><table class="leaderboard-table"><caption class="sr-only">${e(board.title)}，${e(board.sourceName)}，本站收录日期 ${e(board.checkedAt || leaderboards.checkedAt || '未披露')}</caption><thead><tr><th scope="col" class="rank-cell">名次</th><th scope="col" class="model-cell">模型 / 机构</th><th scope="col" class="score-cell">${e(board.metric)}</th><th scope="col" class="confidence-cell">${e(board.confidenceLabel || '置信区间')}</th><th scope="col" class="samples-cell">${e(board.sampleLabel || '样本量')}</th><th scope="col" class="source-cell">来源</th></tr></thead><tbody>${items.map(row=>`<tr data-leaderboard-row><td class="rank-cell"><span class="rank-medal ${row.rank<=3?'top-rank':''}">${e(String(row.rank).padStart(2,'0'))}</span></td><td class="model-cell"><button class="model-link plain-link" data-open="${e(modelId(board,row))}">${e(row.name)}</button><small>${e(row.organization)}</small></td><td class="score-cell"><strong>${e(row.score)}</strong><span class="score-bar" aria-hidden="true"><i style="width:${Math.round(row.score/maxScore*100)}%"></i></span></td><td class="confidence-cell">${e(row.confidence || '—')}</td><td class="samples-cell">${countText(row.samples)}</td><td class="source-cell"><a href="${e(row.url || board.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(row.name)} 的原始榜单">原榜 ↗</a></td></tr>`).join('')}</tbody></table></div>`:empty('没有找到匹配的模型，试试模型名称或机构。')}
    <p class="leaderboard-footnote">${e(board.coverage)} 筛选只缩小显示范围，不重新编号。点击模型名可查看成绩详情。</p></div>
    <aside class="leaderboard-aside"><section class="source-card"><div class="kicker">PUBLIC BENCHMARK</div><h3>这份排名来自哪里？</h3><p>${e(board.metricDescription)}</p><dl class="source-facts"><div><dt>评测来源</dt><dd>${e(board.sourceName)}</dd></div><div><dt>来源更新</dt><dd>${e(sourceDate(board.sourceUpdatedAt))}</dd></div><div><dt>本站收录</dt><dd>${e(board.checkedAt || leaderboards.checkedAt || '未披露')}</dd></div><div><dt>收录范围</dt><dd>${e(board.coverage)}</dd></div></dl><a class="text-link" href="${e(board.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看完整原榜 ↗</a></section><section class="reading-card"><h3>怎样读这份榜单</h3><ul>${board.notes.map(note=>`<li>${e(note)}</li>`).join('')}</ul></section></aside></div>
    <details class="leaderboard-method"><summary>评分与收录说明</summary><div class="method-copy"><p>本站整理公开评测的原始成绩，按来源与任务分别列榜。每张榜单保留模型版本名称、原榜名次和评分口径，暂不合成跨任务的“设计综合分”。</p><p>这些结果可辅助比较创作工具；通用偏好评测并不等于艺术与设计专家的专业评价。不同榜单的分数不能直接比较，接近的分数需要结合置信区间与样本量阅读。</p><p>当前展示已收录的公开成绩快照。“来源更新”是原榜标注的日期，“本站收录”是该快照的实际读取日期；来源读取失败时保留上次可用快照。完整范围与最新结果请查看原榜。</p></div></details></section>`;
  }
  function savedPage() {const items=all.filter(x=>saved.has(x.id));return `${title('YOUR READING DESK','留给下一步的线索。','收藏感兴趣的研究与机会，回到这里继续探索。',`<div class="heading-stat"><strong>${items.length}</strong>条已收藏内容</div>`)}${items.length?`<div class="compact-list">${items.map(compact).join('')}</div>`:empty('点击卡片上的书签，即可把研究和机会留在这里。<br>收藏仅保存在当前浏览器。',true)}`;}
  function searchPage() {const keyword=query.get('q')||'';const items=all.filter(x=>matches(x,keyword));return `${title('FIND YOUR NEXT IDEA','找到与你有关的信息。',`搜索「${e(keyword)}」，共找到 ${items.length} 条内容。`)}${items.length?`<div class="compact-list">${items.map(compact).join('')}</div>`:empty('没有找到相关内容，试试“设计”“博士”或“AI”。')}`;}
  function render() {
    const pages={home:homePage,jobs:jobsPage,phd:phdPage,research:researchPage,ai:aiPage,saved:savedPage,search:searchPage};
    main.innerHTML=(pages[route]||homePage)();
    document.querySelectorAll('[data-route]').forEach(a=>{const active=a.dataset.route===route;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.title=`${({home:'精选首页',jobs:'招聘',phd:'博士申请',research:'研究与投稿',ai:'设计 AI 评测',saved:'我的收藏',search:'搜索'}[route]||'精选首页')} · 今日有图`;
    updateSaveCount();
  }
  function renderKeepFocus() {const el=document.activeElement;const id=el?.id;let caret;try{caret=el.selectionStart;}catch{}render();if(id){const next=document.getElementById(id);next?.focus({preventScroll:true});if(caret!=null&&next?.setSelectionRange)next.setSelectionRange(caret,caret);}}
  function updateSaveCount(){document.querySelector('#saved-count').textContent=all.filter(x=>saved.has(x.id)).length;}
  function showToast(message){clearTimeout(toastTimer);const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),2600);}
  function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{showToast('浏览器未允许保存，当前选择仅在本次访问有效');return false;}}
  function toggleSaved(id){const item=byId.get(id);if(!item)return;const existed=saved.has(id);if(existed)saved.delete(id);else saved.add(id);const ok=persist('jryt-saved',[...saved]);if(route==='saved')render();{document.querySelectorAll('[data-save]').forEach(button=>{if(button.dataset.save===id){button.setAttribute('aria-pressed',String(saved.has(id)));button.setAttribute('aria-label',`${saved.has(id)?'取消收藏':'收藏'}：${item.title}`);const span=button.querySelector('span');if(span)span.textContent=saved.has(id)?'已收藏':'收藏这条内容';}});updateSaveCount();}if(ok)showToast(existed?'已取消收藏':'已收藏到「我的收藏」');}
  function showDetail(id){const item=byId.get(id);if(!item)return;
    document.querySelector('#detail-content').innerHTML=`<div class="detail-heading">${e(categories[item.kind])} ${badge(item)}</div><h2 id="detail-title">${e(item.title)}</h2><p class="detail-summary">${e(item.summary)}</p>${item.isDemo?notice('这是虚构的产品演示内容，不代表真实院校、项目或正在开放的机会。'):item.historical?notice('历史公告尚未重新核验。请以最新官方信息为准。'):''}${['jobs','phd','calls'].includes(item.kind)&&!item.isDemo?notice(`机会状态：${e(statusNames[stateOf(item)])} · 最近核验：${e(item.verifiedAt || item.sourceVerifiedAt || '未核验')}`):''}<dl class="detail-facts">${[...(item.details||[]),...(isOpportunity(item)?[{label:'日期时区',value:timeZoneLabel(item)}]:[])].map(d=>`<div><dt>${e(d.label)}</dt><dd>${e(d.value)}</dd></div>`).join('')}</dl><div class="detail-body">${(item.body||[]).map(p=>`<p>${e(p)}</p>`).join('')}</div><div class="detail-actions">${item.sourceUrl&&/^https?:\/\//.test(item.sourceUrl)?`<a class="button" href="${e(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${e(item.sourceLabel||'查看官方原文')} ↗</a>`:''}<button class="button secondary" data-copy-link="${e(item.id)}">复制详情链接</button>${saveButton(item,true)}${item.deadline&&item.isDemo?`<button class="button secondary" data-calendar="${e(item.id)}">导出示例日历 ↓</button>`:''}</div><p class="detail-note">${item.isDemo?'示例信息用于讨论产品功能与阅读体验。':item.historical?'来源：原高校招聘项目。本站保存的是公告索引，不接受报名。':item.publicResult?'成绩来自公开榜单，本站未运行这项评测；完整方法与最新结果请查看来源。':'页面为编辑导读，请通过原始来源进一步阅读。'}</p>`;
    if (!dialog.open) dialog.showModal();document.body.style.overflow='hidden';dialog.scrollTop=0;
  }
  function downloadCalendar(id){const item=byId.get(id);if(!item?.deadline)return;const date=item.deadline.replaceAll('-','');const next=new Date(item.deadline+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const end=next.toISOString().slice(0,10).replaceAll('-','');const clean=s=>String(s).replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//JRYT//Product preview//ZH','BEGIN:VEVENT',`UID:${item.id}@jryt.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${date}`,`DTEND;VALUE=DATE:${end}`,`SUMMARY:${clean('[示例] '+item.title)}`,'DESCRIPTION:虚构的产品演示事件，不是真实申请截止。','END:VEVENT','END:VCALENDAR'].join('\r\n');const url=URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='示例机会-'+item.id+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('示例日历文件已导出');}
  function openDetail(id) {
    if (!byId.has(id)) return;
    if (!location.hash.startsWith('#/item/')) detailReturnHash = location.hash || '#/home';
    detailPushed = true;
    location.hash = '/item/' + encodeURIComponent(id);
  }
  function closeDetail() {
    if (location.hash.startsWith('#/item/')) {
      if (detailPushed) { detailPushed = false; history.back(); }
      else location.hash = detailReturnHash;
    } else dialog.close();
  }
  function routeChanged(){
    const hash=location.hash.replace(/^#\/?/,'');
    const [path,params='']=hash.split('?');
    let detailId=null;
    if(path.startsWith('item/')) { try { detailId=decodeURIComponent(path.slice(5)); } catch { detailId=''; } }
    const item=detailId!==null?byId.get(detailId):null;
    const next=detailId!==null ? (item?.kind==='calls'?'research':item?.kind || 'home') : path||'home';
    const changed=next!==route;route=next;query=new URLSearchParams(item?.kind==='calls'?'tab=calls':params);filters={page:1};
    if(dialog.open) dialog.close();
    render();
    if(detailId!==null) {
      if(item) {if(!detailPushed)detailReturnHash=item.kind==='calls'?'#/research?tab=calls':'#/'+item.kind;showDetail(detailId);document.title=`${item.title} · 今日有图`;}
      else {main.innerHTML=title('CONTENT UNAVAILABLE','这条内容暂不可用。','该条目可能已撤下，或尚未包含在当前公开版本中。')+'<a class="button" href="#/home">返回首页 ↗</a>';}
    } else detailPushed=false;
    window.scrollTo({top:0});if(changed&&!item)main.focus({preventScroll:true});
  }
  document.querySelector('#global-search').addEventListener('submit',event=>{event.preventDefault();const value=document.querySelector('#search-input').value.trim();if(value)location.hash='/search?q='+encodeURIComponent(value);});
  document.addEventListener('click',event=>{const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-save')){toggleSaved(target.dataset.save);return;}
    if(target.hasAttribute('data-open')){openDetail(target.dataset.open);return;}
    if(target.hasAttribute('data-copy-link')){const url=new URL(location.href);url.hash='/item/'+encodeURIComponent(target.dataset.copyLink);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url.href).then(()=>showToast('详情链接已复制')).catch(()=>showToast('请复制浏览器地址栏中的详情链接'));else showToast('请复制浏览器地址栏中的详情链接');return;}
    if(target.hasAttribute('data-reset')){if(route==='search'){document.querySelector('#search-input').value='';location.hash='/home';}else{filters={page:1};render();}return;}
    if(target.hasAttribute('data-page')){filters.page=Number(target.dataset.page);render();document.querySelector('.filter-bar')?.scrollIntoView({block:'start'});return;}
    if(target.hasAttribute('data-calendar'))downloadCalendar(target.dataset.calendar);
  });
  main.addEventListener('input',event=>{const key=event.target.dataset.filter;if(!key||event.target.tagName==='SELECT')return;filters[key]=event.target.value;filters.page=1;renderKeepFocus();});
  main.addEventListener('change',event=>{const key=event.target.dataset.filter;if(!key||event.target.tagName!=='SELECT')return;filters[key]=event.target.value;filters.page=1;renderKeepFocus();});
  document.querySelector('.dialog-close').addEventListener('click',closeDetail);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});dialog.addEventListener('close',()=>{if(!dialog.open)document.body.style.overflow='';});dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closeDetail();}});
  const releaseLabel = document.querySelector('#release-label');
  if(releaseLabel) releaseLabel.textContent=release.version ? `最近整理 ${release.builtAt ? sourceDate(release.builtAt) : '时间未披露'} · 保留原始来源` : '真实来源与示例内容已分别标注';
  window.addEventListener('hashchange',routeChanged);routeChanged();
})();
