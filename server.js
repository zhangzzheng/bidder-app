const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const store = require('./db/store');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ── AI 模型配置 ──
const AI_CONFIG_PATH = path.join(__dirname, 'ai_config.json');
function getAiConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf-8'));
    }
  } catch(e) { /* ignore */ }
  return { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', apiKey: '' };
}
function saveAiConfig(cfg) {
  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

app.get('/api/ai-config', (req, res) => {
  const cfg = getAiConfig();
  // Don't expose full API key
  res.json({ endpoint: cfg.endpoint, model: cfg.model, apiKey: cfg.apiKey ? cfg.apiKey.slice(0, 8) + '...' + cfg.apiKey.slice(-4) : '', hasKey: !!cfg.apiKey });
});
app.put('/api/ai-config', (req, res) => {
  const { endpoint, model, apiKey } = req.body;
  const cfg = getAiConfig();
  if (endpoint) cfg.endpoint = endpoint;
  if (model) cfg.model = model;
  if (apiKey) cfg.apiKey = apiKey;
  saveAiConfig(cfg);
  res.json({ ok: true });
});

// ── 项目 ──
app.get('/api/projects', (req, res) => res.json(store.listProjects()));

app.get('/api/projects/:id', (req, res) => {
  const p = store.getProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p);
});

app.post('/api/projects', (req, res) => {
  const p = store.createProject(req.body);
  res.status(201).json(p);
});

app.put('/api/projects/:id', (req, res) => {
  const p = store.updateProject(Number(req.params.id), req.body);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p);
});

app.delete('/api/projects/:id', (req, res) => {
  store.deleteProject(Number(req.params.id));
  res.json({ ok: true });
});

// ── 评分点 ──
app.post('/api/projects/:id/score-points', (req, res) => {
  const sp = store.addScorePoint(Number(req.params.id), req.body);
  if (!sp) return res.status(404).json({ error: '项目不存在' });
  res.status(201).json(sp);
});

app.put('/api/projects/:pid/score-points/:spId', (req, res) => {
  const sp = store.updateScorePoint(Number(req.params.pid), req.params.spId, req.body);
  if (!sp) return res.status(404).json({ error: '评分点不存在' });
  res.json(sp);
});

app.delete('/api/projects/:pid/score-points/:spId', (req, res) => {
  store.deleteScorePoint(Number(req.params.pid), req.params.spId);
  res.json({ ok: true });
});

// ── 任务 ──
app.get('/api/projects/:id/tasks', (req, res) => {
  const p = store.getProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p.tasks);
});

app.post('/api/projects/:id/tasks', (req, res) => {
  const t = store.addTask(Number(req.params.id), req.body);
  if (!t) return res.status(404).json({ error: '项目不存在' });
  res.status(201).json(t);
});

app.put('/api/projects/:pid/tasks/:taskId', (req, res) => {
  const t = store.updateTask(Number(req.params.pid), Number(req.params.taskId), req.body);
  if (!t) return res.status(404).json({ error: '任务不存在' });
  res.json(t);
});

app.delete('/api/projects/:pid/tasks/:taskId', (req, res) => {
  store.deleteTask(Number(req.params.pid), Number(req.params.taskId));
  res.json({ ok: true });
});

app.post('/api/projects/:id/tasks/batch-from-score-points', (req, res) => {
  const tasks = store.batchCreateTasksFromScorePoints(Number(req.params.id));
  if (!tasks) return res.status(404).json({ error: '项目不存在' });
  res.status(201).json(tasks);
});

// ── 里程碑 ──
app.get('/api/projects/:id/milestones', (req, res) => {
  const p = store.getProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p.milestones);
});

app.post('/api/projects/:id/milestones', (req, res) => {
  const m = store.addMilestone(Number(req.params.id), req.body);
  if (!m) return res.status(404).json({ error: '项目不存在' });
  res.status(201).json(m);
});

app.put('/api/projects/:pid/milestones/:msId', (req, res) => {
  const m = store.updateMilestone(Number(req.params.pid), Number(req.params.msId), req.body);
  if (!m) return res.status(404).json({ error: '里程碑不存在' });
  res.json(m);
});

app.delete('/api/projects/:pid/milestones/:msId', (req, res) => {
  store.deleteMilestone(Number(req.params.pid), Number(req.params.msId));
  res.json({ ok: true });
});

app.post('/api/projects/:id/generate-milestones', (req, res) => {
  const ms = store.generateMilestones(Number(req.params.id));
  if (!ms) return res.status(400).json({ error: '请先设置答疑时间和截标时间' });
  res.status(201).json(ms);
});

// ── 成员 ──
app.get('/api/members', (req, res) => res.json(store.listMembers()));
app.post('/api/members', (req, res) => { const m = store.addMember(req.body); res.status(201).json(m); });
app.put('/api/members/:id', (req, res) => {
  const m = store.updateMember(Number(req.params.id), req.body);
  if (!m) return res.status(404).json({ error: '成员不存在' });
  res.json(m);
});
app.delete('/api/members/:id', (req, res) => { store.deleteMember(Number(req.params.id)); res.json({ ok: true }); });
// ── 项目成员 ──
app.get('/api/projects/:id/members', (req, res) => {
  const p = store.getProject(Number(req.params.id));
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p.members || []);
});
app.post('/api/projects/:id/members', (req, res) => {
  const m = store.addProjectMember(Number(req.params.id), req.body);
  if (!m) return res.status(404).json({ error: '项目不存在' });
  res.status(201).json(m);
});
app.delete('/api/projects/:pid/members/:mid', (req, res) => {
  store.removeProjectMember(Number(req.params.pid), req.params.mid);
  res.json({ ok: true });
});


// ── Dashboard & Announcement ──
app.get('/api/projects/:id/dashboard', (req, res) => {
  const d = store.getDashboard(Number(req.params.id));
  if (!d) return res.status(404).json({ error: '项目不存在' });
  res.json(d);
});
app.get('/api/projects/:id/announcement', (req, res) => {
  const a = store.getAnnouncement(Number(req.params.id));
  if (!a) return res.status(404).json({ error: '项目不存在' });
  res.json(a);
});

// ═══════════════════════════════════════════════════════════════════
//  核心: 上传标书 → PDF解析 → AI提取 → 自动创建项目
// ═══════════════════════════════════════════════════════════════════

// AbortSignal timeout helper (Node 19+)
function timeoutSignal(ms) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}
app.post('/api/upload-and-create', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: '请上传文件' });

    const buffer = fs.readFileSync(file.path);
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getText();
    const text = pdfData.text;

    fs.unlink(file.path, () => {});

    console.log('PDF解析成功: ' + text.length + '字符');

    if (!text || text.length < 20) {
      return res.status(400).json({ error: '无法从PDF中提取有效文本，文件可能为扫描件' });
    }

    const apiKey = req.headers['x-api-key'] || process.env.DEEPSEEK_KEY || 'sk-a675e0d3d99f423a89ac75f223b42c41';
    let extracted;

    if (apiKey) {
      extracted = await aiExtract(text, apiKey);
    } else {
      extracted = basicExtract(text, file.originalname);
    }

    // 创建项目
    const project = store.createProject({
      name: extracted.name,
      projectLocation: extracted.location,
      projectType: extracted.type,
      projectCost: extracted.cost,
      qaDate: extracted.qaDate,
      bidDeadline: extracted.bidDeadline,
      projectInfo: extracted.info,
    });

    // 添加评分点（带分类）
        // add score points (with category)
    const scoreItems = extracted.scoreItems || [];
    // fallback: use default categories when AI found none
    if (scoreItems.length === 0) {
      const defCats = ['施工组织设计','人员配置','施工部署','质量安全管理','进度计划','资源配置'];
      const defNames = {
        '施工组织设计': ['施工技术方案','施工总平面图','季节性施工','BIM技术应用'],
        '人员配置': ['项目组织机构','类似工程业绩'],
        '施工部署': ['施工部署'],
        '质量安全管理': ['质量管理体系','安全文明施工','环境保护措施'],
        '进度计划': ['施工进度计划'],
        '资源配置': ['资源配备计划'],
      };
      const defScores = {'施工技术方案':12,'施工总平面图':5,'季节性施工':5,'BIM技术应用':5,'项目组织机构':8,'类似工程业绩':7,'施工部署':8,'质量管理体系':10,'安全文明施工':10,'环境保护措施':5,'施工进度计划':10,'资源配备计划':8};
      for (const cat of defCats) {
        for (const name of (defNames[cat]||[])) {
          scoreItems.push({ name, maxScore: defScores[name]||5, criteria: name+'相关评审要点', category: cat });
        }
      }
    }
    const spIds = [];
    for (const item of scoreItems) {
      const sp = store.addScorePoint(project.id, {
        name: item.name,
        maxScore: item.maxScore,
        criteria: item.criteria,
        chapterTitle: item.name,
        category: item.category || '',
      });
      spIds.push(sp.id);
    }

    // 从评分点生成章节任务
    for (let i = 0; i < scoreItems.length; i++) {
      const item = scoreItems[i];
      store.addTask(project.id, {
        title: item.name,
        scorePointId: spIds[i] || null,
        chapterTitle: item.name,
        category: item.category || '',
        status: 'pending',
      });
    }

    // 自动生成里程碑
    store.generateMilestones(project.id);

    res.json(store.getProject(project.id));

  } catch (e) {
    console.error('解析失败:', e);
    const msg = e.name === 'AbortError' ? 'AI解析超时，请重试或检查网络' : '解析失败: ' + e.message;
    res.status(500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  AI 提取 (DeepSeek API) — 同 招标文件助手 的 prompt 结构
// ═══════════════════════════════════════════════════════════════════
async function aiExtract(text, apiKey) {
  const sysPrompt = `你是有20年经验的招标文件分析专家。从文件中提取核心信息，按以下JSON格式输出：

{
  "项目信息": { "项目名称":"", "项目地点":"", "建设规模":"", "项目类型":"房建|市政|公路|水利|机电|装饰|其他", "工程造价":"", "计划工期":"", "招标人":"", "质量标准":"", "工期目标":"" },
  "时间节点": { "答疑时间":"", "截标时间":"", "开标时间":"", "投标有效期":"" },
  "评分标准": {
    "总体评分": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "施工组织设计": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "人员配置": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "施工部署": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "质量安全管理": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "进度计划": [ { "评分项":"", "分值":0, "评分要点":"" } ],
    "资源配置": [ { "评分项":"", "分值":0, "评分要点":"" } ]
  },
  "投标人资格": [ { "类别":"", "要求":"" } ],
  "人员架构要求": { "项目经理": { "要求":"", "注册资格":"", "业绩要求":"" }, "技术负责人": { "要求":"", "职称":"", "业绩要求":"" }, "其他主要人员": [ { "岗位":"", "人数":0, "资格要求":"" } ] },
  "安全目标": "",
  "质量目标": "",
  "否决条款": [ { "内容":"" } ],
  "重点提醒": []
}

重要规则：
1. 项目类型从选项中选一个最接近的
2. 时间格式为 YYYY-MM-DD
3. 评分标准从招标文件中提取，按类别分组 — 每项必须包含评分项名称、分值和评分要点
4. 如果文件中没有明确的评分项，则根据该类常见内容合理推断
5. 输出 ONLY JSON，不要任何其他文字`;

  const aiCfg = getAiConfig();
  const endpoint = aiCfg.endpoint;
  const model = aiCfg.model;

  const response = await fetch(endpoint, {
    signal: timeoutSignal(120000),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (aiCfg.apiKey || apiKey),
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `提取招标文件核心信息：\n${text.slice(0, 120000)}` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('AI API 错误: ' + errText.slice(0, 200));
  }

  const data = await response.json();
  let resultText = data.choices[0].message.content;
  resultText = resultText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Robust JSON extraction & repair
  function parseAIJson(t) {
    // Strategy 1: direct parse
    try { return JSON.parse(t); } catch(e) {}

    // Strategy 2: extract first { ... } block
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) {
      t = t.slice(start, end + 1);
      try { return JSON.parse(t); } catch(e) {}

      // Strategy 3: fix trailing commas (before ] or })
      t = t.replace(/,(\s*[}\]])/g, '$1');
      try { return JSON.parse(t); } catch(e) {}

      // Strategy 4: add missing commas between object items (closing } followed by " or {)
      t = t.replace(/}(\s*)"(\s*)/g, '},$1"$2');
      t = t.replace(/}(\s*){/g, '},$1{');
      try { return JSON.parse(t); } catch(e) {}

      // Strategy 5: add missing commas between array items
      t = t.replace(/\](\s*)\[/g, '],$1[');
      try { return JSON.parse(t); } catch(e) {}
    }

    throw new Error('AI返回格式异常，请重试');
  }

  let result;
  try {
    result = parseAIJson(resultText);
  } catch (jsonErr) {
    console.error('AI JSON解析失败, 原始响应片段:', resultText.slice(0, 500));
    throw new Error('AI返回格式异常，请重试');
  }

  const info = result.项目信息 || result;
  const time = result.时间节点 || result;
  const scoreStd = result.评分标准 || {};

  // 合并所有技术标相关的评分类别（排除总体评分）
  const techCategories = ['施工组织设计', '人员配置', '施工部署', '质量安全管理', '进度计划', '资源配置'];
  const allScoreItems = [];
  for (const cat of techCategories) {
    const items = scoreStd[cat] || [];
    for (const s of items) {
      if (s.评分项) {
        allScoreItems.push({
          name: s.评分项,
          maxScore: s.分值 || 0,
          criteria: s.评分要点 || '',
          category: cat,
        });
      }
    }
  }

  return {
    name: info.项目名称 || '未命名项目',
    location: info.项目地点 || '',
    type: info.项目类型 || '其他',
    cost: info.工程造价 || '',
    qaDate: time.答疑时间 || '',
    bidDeadline: time.截标时间 || '',
    info: info.建设规模 || '',
    scoreItems: allScoreItems,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  基础提取（无AI时用关键词匹配）
// ═══════════════════════════════════════════════════════════════════
const SCORE_CATEGORIES = [
  { category: '施工组织设计', items: [
    { name: '施工技术方案', keywords: ['技术方案', '施工工艺', '技术措施', '施工方法'], score: 12 },
    { name: '施工总平面图', keywords: ['平面布置', '总平面', '施工平面'], score: 5 },
    { name: '季节性施工', keywords: ['季节性', '雨季施工', '冬季施工', '高温施工'], score: 5 },
    { name: 'BIM技术应用', keywords: ['BIM', '建筑信息模型'], score: 5 },
  ]},
  { category: '质量安全管理', items: [
    { name: '质量管理体系', keywords: ['质量', '质保'], score: 10 },
    { name: '安全文明施工', keywords: ['安全', '文明施工'], score: 10 },
    { name: '环境保护措施', keywords: ['环境', '环保', '绿色施工'], score: 5 },
  ]},
  { category: '人员配置', items: [
    { name: '项目组织机构', keywords: ['组织机构', '人员配置', '项目经理', '项目班子'], score: 8 },
    { name: '类似工程业绩', keywords: ['业绩', '类似工程', '经验'], score: 7 },
  ]},
  { category: '进度计划', items: [
    { name: '施工进度计划', keywords: ['进度计划', '工期', '进度'], score: 10 },
  ]},
  { category: '资源配置', items: [
    { name: '资源配备计划', keywords: ['资源', '劳动力', '机械配备'], score: 8 },
  ]},
  { category: '施工部署', items: [
    { name: '施工部署', keywords: ['施工部署', '总体安排', '施工区段'], score: 8 },
  ]},
];

function basicExtract(text, filename) {
  let name = filename.replace(/\.\w+$/, '').replace(/[_-]/g, ' ').trim();

  const namePatterns = [
    /项目名称[：:\s]*([^\n]+)/,
    /工程名称[：:\s]*([^\n]+)/,
    /招标项目[：:\s]*([^\n]+)/,
    /([^，。\n]+技术标)/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { name = m[1].trim(); break; }
  }

  let location = '';
  const locPatterns = [/工程地点[：:\s]*([^\n]+)/, /项目地点[：:\s]*([^\n]+)/, /建设地点[：:\s]*([^\n]+)/, /位于\s*([^，。\n]+)/];
  for (const p of locPatterns) {
    const m = text.match(p);
    if (m) { location = m[1].trim(); break; }
  }

  let type = '其他';
  const typeMap = { '房建': ['房建', '住宅', '商业', '办公', '学校', '医院', '场馆'], '市政': ['市政', '道路', '管网', '园林'], '公路': ['公路', '高速', '桥梁', '隧道'], '水利': ['水利', '水库', '河道'], '机电': ['机电', '设备安装'], '装饰': ['装饰', '装修', '幕墙'] };
  for (const [t, ks] of Object.entries(typeMap)) {
    if (ks.some(k => text.includes(k))) { type = t; break; }
  }

  let qaDate = '', bidDeadline = '';
  const timePatterns = {
    qa: [/答疑[^：:]*[：:]s*(d{4}[D]d{1,2}[D]d{1,2})/, /答疑[^：:]*[：:]s*(d{4}年d{1,2}月d{1,2}日)/],
    dl: [/投标截止[^：:]*[：:]s*(d{4}[D]d{1,2}[D]d{1,2})/, /开标[^：:]*[：:]s*(d{4}[D]d{1,2}[D]d{1,2})/, /递交[^：:]*[：:]s*(d{4}[D]d{1,2}[D]d{1,2})/]
  };
  for (const p of timePatterns.qa) { const m = text.match(p); if (m) { qaDate = m[1].replace(/(\d{4})\D(\d{1,2})\D(\d{1,2}).*/, '$1-$2-$3'); break; } }
  for (const p of timePatterns.dl) { const m = text.match(p); if (m) { bidDeadline = m[1].replace(/(\d{4})\D(\d{1,2})\D(\d{1,2}).*/, '$1-$2-$3'); break; } }

  let info = '';
  const infoPatterns = [/工程概况[：:\s]*([^。]+。)/, /建设规模[：:\s]*([^。]+。)/, /项目概况[：:\s]*([^。]+。)/];
  for (const p of infoPatterns) {
    const m = text.match(p);
    if (m) { info = m[1].trim(); break; }
  }

  // 评分项：按分类匹配关键词
  const textLower = text.toLowerCase();
  const scoreItems = [];
  for (const cat of SCORE_CATEGORIES) {
    for (const item of cat.items) {
      const found = item.keywords.some(k => textLower.includes(k));
      if (found) {
        scoreItems.push({
          name: item.name,
          maxScore: item.score,
          criteria: item.name + '相关评审要点',
          category: cat.category,
        });
      }
    }
  }

  if (scoreItems.length === 0) {
    scoreItems.push(
      { name: '施工进度计划', maxScore: 10, criteria: '进度计划合理性、关键节点把控', category: '进度计划' },
      { name: '质量管理体系', maxScore: 10, criteria: '质量目标、质保体系', category: '质量安全管理' },
      { name: '安全文明施工', maxScore: 10, criteria: '安全生产、文明施工措施', category: '质量安全管理' },
      { name: '施工技术方案', maxScore: 12, criteria: '施工工艺、技术先进性', category: '施工组织设计' },
    );
  }

  return { name, location, type, cost: '', info, qaDate, bidDeadline, scoreItems };
}

// ── 启动 ──
app.listen(PORT, () => {
  console.log(`投标管理工具已启动: http://localhost:${PORT}`);
});
