const fs = require('fs');
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;
const DB_PATH = path.join(__dirname, '..', 'data.json');
const GH_TOKEN = process.env.GH_TOKEN || '';
const GH_REPO = 'zhangzzheng/bidder-app';
const GH_PATH = 'data.json';

const EMPTY = {
  projects: [],
  members: [],
  nextProjectId: 1,
  nextTaskId: 1,
  nextMilestoneId: 1,
  nextMemberId: 1,
};

let data = null;
let ghSha = null; // SHA for GitHub file updates
let ghLock = false; // Simple write lock

// ── GitHub API helpers ──
async function ghFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `token ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'bidder-app',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${body.message || ''}`);
  return body;
}

async function ghRead() {
  const result = await ghFetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`);
  ghSha = result.sha;
  const content = Buffer.from(result.content, 'base64').toString('utf-8');
  return JSON.parse(content);
}

async function ghWrite() {
  // Wait for lock to free
  while (ghLock) await new Promise(r => setTimeout(r, 100));
  ghLock = true;
  try {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const body = { message: 'Update data.json', content, sha: ghSha };
    const result = await ghFetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    ghSha = result.content.sha;
  } finally {
    ghLock = false;
  }
}

// ── Load / Save ──
async function loadAsync() {
  if (data) return data;
  if (IS_VERCEL) {
    try {
      data = await ghRead();
      return data;
    } catch (e) {
      console.error('GitHub read error, using empty:', e.message);
      data = JSON.parse(JSON.stringify(EMPTY));
      // Try to create the file on GitHub
      try {
        const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
        const body = { message: 'Init data.json', content };
        const result = await ghFetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        ghSha = result.content.sha;
      } catch (initErr) {
        console.error('GitHub init error:', initErr.message);
      }
      return data;
    }
  } else {
    return load();
  }
}

async function saveAsync() {
  if (IS_VERCEL) {
    await ghWrite();
  } else {
    save();
  }
}

// ── Local file operations (unchanged) ──
function load() {
  if (data) return data;
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } else {
      data = JSON.parse(JSON.stringify(EMPTY));
    }
  } catch {
    data = JSON.parse(JSON.stringify(EMPTY));
  }
  return data;
}

function save() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Sync adapter: called before every operation ──
let initPromise = null;
function ensureLoaded() {
  if (IS_VERCEL) {
    if (!initPromise) initPromise = loadAsync();
    return initPromise;
  }
  load();
  return Promise.resolve();
}

// Make all operations async-compatible
const ops = {};

ops.listProjects = async () => { await ensureLoaded(); return (data || EMPTY).projects; };

ops.getProject = async (id) => { await ensureLoaded(); return (data || EMPTY).projects.find(p => p.id === id) || null; };

ops.createProject = async (fields) => {
  await ensureLoaded();
  const now = new Date().toISOString();
  const project = {
    id: data.nextProjectId++,
    name: fields.name || '未命名项目',
    qaDate: fields.qaDate || '',
    bidDeadline: fields.bidDeadline || '',
    projectInfo: fields.projectInfo || '',
    projectLocation: fields.projectLocation || '',
    projectType: fields.projectType || '',
    projectCost: fields.projectCost || '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    scorePoints: fields.scorePoints || [],
    milestones: fields.milestones || [],
    tasks: fields.tasks || [],
    members: fields.members || [],
  };
  data.projects.push(project);
  await saveAsync();
  return project;
};

ops.updateProject = async (id, fields) => {
  await ensureLoaded();
  const idx = data.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const project = data.projects[idx];
  Object.keys(fields).forEach(k => {
    if (k !== 'id' && k !== 'createdAt') project[k] = fields[k];
  });
  project.updatedAt = new Date().toISOString();
  data.projects[idx] = project;
  await saveAsync();
  return project;
};

ops.deleteProject = async (id) => {
  await ensureLoaded();
  data.projects = data.projects.filter(p => p.id !== id);
  await saveAsync();
  return true;
};

ops.addScorePoint = async (projectId, sp) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const point = {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: sp.name || '',
    maxScore: sp.maxScore || 0,
    criteria: sp.criteria || '',
    chapterTitle: sp.chapterTitle || '',
    sortOrder: project.scorePoints.length,
    ...sp,
  };
  project.scorePoints.push(point);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return point;
};

ops.updateScorePoint = async (projectId, spId, fields) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.scorePoints.findIndex(s => s.id === spId);
  if (idx === -1) return null;
  Object.assign(project.scorePoints[idx], fields);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return project.scorePoints[idx];
};

ops.deleteScorePoint = async (projectId, spId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.scorePoints = project.scorePoints.filter(s => s.id !== spId);
  project.tasks = (project.tasks || []).filter(t => t.scorePointId !== spId);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return true;
};

ops.addTask = async (projectId, task) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const t = {
    id: data.nextTaskId++,
    projectId,
    title: task.title || '',
    scorePointId: task.scorePointId || null,
    chapterTitle: task.chapterTitle || '',
    assignee: task.assignee || '',
    status: 'pending',
    priority: task.priority || 'medium',
    deadline: task.deadline || '',
    note: task.note || '',
    sortOrder: project.tasks.length,
    createdAt: new Date().toISOString(),
  };
  project.tasks.push(t);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return t;
};

ops.updateTask = async (projectId, taskId, fields) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  Object.assign(project.tasks[idx], fields);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return project.tasks[idx];
};

ops.deleteTask = async (projectId, taskId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.tasks = project.tasks.filter(t => t.id !== taskId);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return true;
};

ops.batchCreateTasksFromScorePoints = async (projectId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const tasks = [];
  const stages = [
    { suffix: '编制', status: 'pending', priority: 'high' },
    { suffix: '初审', status: 'pending', priority: 'medium' },
    { suffix: '终审', status: 'pending', priority: 'medium' },
  ];
  for (const sp of project.scorePoints) {
    for (const stage of stages) {
      const t = await ops.addTask(projectId, {
        title: `${sp.chapterTitle || sp.name} - ${stage.suffix}`,
        scorePointId: sp.id,
        chapterTitle: sp.chapterTitle || sp.name,
        status: stage.status,
        priority: stage.priority,
      });
      tasks.push(t);
    }
  }
  return tasks;
};

ops.addMilestone = async (projectId, ms) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const m = {
    id: data.nextMilestoneId++,
    projectId,
    type: ms.type || 'other',
    title: ms.title || '',
    startDate: ms.startDate || '',
    endDate: ms.endDate || '',
    status: ms.status || 'pending',
    note: ms.note || '',
    sortOrder: project.milestones.length,
    createdAt: new Date().toISOString(),
  };
  project.milestones.push(m);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return m;
};

ops.updateMilestone = async (projectId, msId, fields) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.milestones.findIndex(m => m.id === msId);
  if (idx === -1) return null;
  Object.assign(project.milestones[idx], fields);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return project.milestones[idx];
};

ops.deleteMilestone = async (projectId, msId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.milestones = project.milestones.filter(m => m.id !== msId);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return true;
};

ops.generateMilestones = async (projectId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const qaDate = project.qaDate, deadline = project.bidDeadline;
  if (!qaDate || !deadline) return null;
  const start = new Date(qaDate), end = new Date(deadline);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) return null;
  const msList = [
    { title: '招标答疑', type: 'qa', offset: 0, status: 'in_progress' },
    { title: '技术标编制', type: 'drafting', offset: Math.round(totalDays * 0.3), status: 'pending' },
    { title: '内部评审', type: 'first_review', offset: Math.round(totalDays * 0.55), status: 'pending' },
    { title: '初步审核', type: 'review', offset: Math.round(totalDays * 0.7), status: 'pending' },
    { title: '终审定稿', type: 'final_review', offset: Math.round(totalDays * 0.85), status: 'pending' },
    { title: '递交标书', type: 'submission', offset: totalDays, status: 'pending' },
  ];
  const created = [];
  for (const ms of msList) {
    const msStart = new Date(start);
    msStart.setDate(msStart.getDate() + (ms.offset - (ms.type === 'qa' ? 0 : Math.round(totalDays * 0.1))));
    const msEnd = new Date(start);
    msEnd.setDate(msEnd.getDate() + ms.offset);
    const s = msStart < start ? new Date(start) : msStart;
    const m = await ops.addMilestone(projectId, {
      type: ms.type, title: ms.title,
      startDate: s.toISOString().slice(0, 10),
      endDate: msEnd.toISOString().slice(0, 10),
      status: ms.status,
    });
    created.push(m);
  }
  return created;
};

ops.addProjectMember = async (projectId, member) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  const m = {
    id: "pm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name: member.name || '',
    role: member.role || 'member',
    createdAt: new Date().toISOString(),
  };
  if (!project.members) project.members = [];
  project.members.push(m);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return m;
};

ops.removeProjectMember = async (projectId, memberId) => {
  await ensureLoaded();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return null;
  if (!project.members) project.members = [];
  project.members = project.members.filter(m => m.id !== memberId);
  project.updatedAt = new Date().toISOString();
  await saveAsync();
  return true;
};

ops.getDashboard = async (projectId) => {
  const project = await ops.getProject(projectId);
  if (!project) return null;
  const tasks = project.tasks || [], milestones = project.milestones || [];
  const now = new Date();
  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    review: tasks.filter(t => t.status === 'review').length,
    done: tasks.filter(t => t.status === 'done').length,
  };
  const milestoneAlerts = milestones.map(m => {
    const end = new Date(m.endDate);
    const diff = end - now;
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return { ...m, daysLeft, isOverdue: diff < 0, isUrgent: diff > 0 && daysLeft <= 3 };
  });
  return { taskStats, milestoneAlerts, project };
};

ops.getAnnouncement = async (projectId) => {
  const project = await ops.getProject(projectId);
  if (!project) return null;
  const milestones = (project.milestones || []).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const tasksByMember = {};
  for (const t of (project.tasks || [])) {
    if (!t.assignee) continue;
    if (!tasksByMember[t.assignee]) tasksByMember[t.assignee] = [];
    tasksByMember[t.assignee].push(t);
  }
  return { project, milestones, tasksByMember };
};

// Sync aliases for server.js routes that call store methods directly
// On local, these are sync; on Vercel, they're async (handled in routes)
ops.listMembers = async () => { await ensureLoaded(); return data.members || []; };
ops.addMember = async (member) => {
  await ensureLoaded();
  const m = {
    id: data.nextMemberId++,
    name: member.name || '',
    role: member.role || '',
    phone: member.phone || '',
    createdAt: new Date().toISOString(),
  };
  data.members.push(m);
  await saveAsync();
  return m;
};
ops.updateMember = async (id, fields) => {
  await ensureLoaded();
  const idx = data.members.findIndex(m => m.id === id);
  if (idx === -1) return null;
  Object.assign(data.members[idx], fields);
  await saveAsync();
  return data.members[idx];
};
ops.deleteMember = async (id) => {
  await ensureLoaded();
  data.members = data.members.filter(m => m.id !== id);
  await saveAsync();
  return true;
};

// ── Re-export load/save for migration ──
ops.load = load;
ops.save = save;

module.exports = ops;
