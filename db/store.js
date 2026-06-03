const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.json');

const EMPTY = {
  projects: [],
  members: [],
  nextProjectId: 1,
  nextTaskId: 1,
  nextMilestoneId: 1,
  nextMemberId: 1,
};

let data = null;

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

// ---- 项目 ----
function listProjects() {
  return load().projects;
}

function getProject(id) {
  return load().projects.find(p => p.id === id) || null;
}

function createProject(fields) {
  const store = load();
  const now = new Date().toISOString();
  const project = {
    id: store.nextProjectId++,
    name: fields.name || '未命名项目',
    qaDate: fields.qaDate || '',
    bidDeadline: fields.bidDeadline || '',
    projectInfo: fields.projectInfo || '',
    projectLocation: fields.projectLocation || '',
    projectType: fields.projectType || '',
    projectCost: fields.projectCost || '',
    status: 'active', // active | completed | cancelled
    createdAt: now,
    updatedAt: now,
    scorePoints: fields.scorePoints || [],
    milestones: fields.milestones || [],
    tasks: fields.tasks || [],
    members: fields.members || [],
  };
  store.projects.push(project);
  save();
  return project;
}

function updateProject(id, fields) {
  const store = load();
  const idx = store.projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const project = store.projects[idx];
  Object.keys(fields).forEach(k => {
    if (k !== 'id' && k !== 'createdAt') project[k] = fields[k];
  });
  project.updatedAt = new Date().toISOString();
  store.projects[idx] = project;
  save();
  return project;
}

function deleteProject(id) {
  const store = load();
  store.projects = store.projects.filter(p => p.id !== id);
  save();
  return true;
}

// ---- 评分点 ----
function addScorePoint(projectId, sp) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
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
  save();
  return point;
}

function updateScorePoint(projectId, spId, fields) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.scorePoints.findIndex(s => s.id === spId);
  if (idx === -1) return null;
  Object.assign(project.scorePoints[idx], fields);
  project.updatedAt = new Date().toISOString();
  save();
  return project.scorePoints[idx];
}

function deleteScorePoint(projectId, spId) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.scorePoints = project.scorePoints.filter(s => s.id !== spId);
  // Also clean up associated tasks
  project.tasks = (project.tasks || []).filter(t => t.scorePointId !== spId);
  project.updatedAt = new Date().toISOString();
  save();
  return true;
}

// ---- 任务 ----
function addTask(projectId, task) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const t = {
    id: store.nextTaskId++,
    projectId,
    title: task.title || '',
    scorePointId: task.scorePointId || null,
    chapterTitle: task.chapterTitle || '',
    assignee: task.assignee || '',
    status: 'pending', // pending | in_progress | review | done
    priority: task.priority || 'medium',
    deadline: task.deadline || '',
    note: task.note || '',
    sortOrder: project.tasks.length,
    createdAt: new Date().toISOString(),
  };
  project.tasks.push(t);
  project.updatedAt = new Date().toISOString();
  save();
  return t;
}

function updateTask(projectId, taskId, fields) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  Object.assign(project.tasks[idx], fields);
  project.updatedAt = new Date().toISOString();
  save();
  return project.tasks[idx];
}

function deleteTask(projectId, taskId) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.tasks = project.tasks.filter(t => t.id !== taskId);
  project.updatedAt = new Date().toISOString();
  save();
  return true;
}

function batchCreateTasksFromScorePoints(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  const tasks = [];
  for (const sp of project.scorePoints) {
    // 每个评分点生成编制、初审、终审三个任务
    const stages = [
      { suffix: '编制', status: 'pending', priority: 'high' },
      { suffix: '初审', status: 'pending', priority: 'medium' },
      { suffix: '终审', status: 'pending', priority: 'medium' },
    ];
    for (const stage of stages) {
      const t = addTask(projectId, {
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
}

// ---- 里程碑 ----
function addMilestone(projectId, ms) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const m = {
    id: store.nextMilestoneId++,
    projectId,
    type: ms.type || 'other', // qa | drafting | first_review | final_review | other
    title: ms.title || '',
    startDate: ms.startDate || '',
    endDate: ms.endDate || '',
    status: ms.status || 'pending', // pending | in_progress | completed
    note: ms.note || '',
    sortOrder: project.milestones.length,
    createdAt: new Date().toISOString(),
  };
  project.milestones.push(m);
  project.updatedAt = new Date().toISOString();
  save();
  return m;
}

function updateMilestone(projectId, msId, fields) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const idx = project.milestones.findIndex(m => m.id === msId);
  if (idx === -1) return null;
  Object.assign(project.milestones[idx], fields);
  project.updatedAt = new Date().toISOString();
  save();
  return project.milestones[idx];
}

function deleteMilestone(projectId, msId) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  project.milestones = project.milestones.filter(m => m.id !== msId);
  project.updatedAt = new Date().toISOString();
  save();
  return true;
}

// ---- 成员 ----
function listMembers() {
  return load().members;
}

function addMember(member) {
  const store = load();
  const m = {
    id: store.nextMemberId++,
    name: member.name || '',
    role: member.role || '',
    phone: member.phone || '',
    createdAt: new Date().toISOString(),
  };
  store.members.push(m);
  save();
  return m;
}

function updateMember(id, fields) {
  const store = load();
  const idx = store.members.findIndex(m => m.id === id);
  if (idx === -1) return null;
  Object.assign(store.members[idx], fields);
  save();
  return store.members[idx];
}

function deleteMember(id) {
  const store = load();
  store.members = store.members.filter(m => m.id !== id);
  save();
  return true;
}

// ---- 自动生成里程碑 ----
function generateMilestones(projectId) {
  const project = getProject(projectId);
  if (!project) return null;

  const qaDate = project.qaDate;
  const deadline = project.bidDeadline;
  if (!qaDate || !deadline) return null;

  const start = new Date(qaDate);
  const end = new Date(deadline);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) return null;

  const milestones = [
    { title: '招标答疑', type: 'qa', offset: 0, status: 'pending' },
    { title: '技术标编制', type: 'drafting', offset: Math.round(totalDays * 0.3), status: 'pending' },
    { title: '内部评审', type: 'first_review', offset: Math.round(totalDays * 0.55), status: 'pending' },
    { title: '初步审核', type: 'review', offset: Math.round(totalDays * 0.7), status: 'pending' },
    { title: '终审定稿', type: 'final_review', offset: Math.round(totalDays * 0.85), status: 'pending' },
    { title: '递交标书', type: 'submission', offset: totalDays, status: 'pending' },
  ];

  const created = [];
  for (const ms of milestones) {
    const msStart = new Date(start);
    msStart.setDate(msStart.getDate() + (ms.offset - (ms.type === 'qa' ? 0 : Math.round(totalDays * 0.1))));
    const msEnd = new Date(start);
    msEnd.setDate(msEnd.getDate() + ms.offset);

    // Ensure start doesn't go before qaDate
    const s = msStart < start ? new Date(start) : msStart;

    const m = addMilestone(projectId, {
      type: ms.type,
      title: ms.title,
      startDate: s.toISOString().slice(0, 10),
      endDate: msEnd.toISOString().slice(0, 10),
      status: ms.type === 'qa' ? 'in_progress' : 'pending',
    });
    created.push(m);
  }
  return created;
}


// ---- 项目成员 ----
function addProjectMember(projectId, member) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  const m = {
    id: "pm_" + Date.now() + "_" + Math.random().toString(36).slice(2,6),
    name: member.name || '',
    role: member.role || 'member',
    createdAt: new Date().toISOString(),
  };
  if (!project.members) project.members = [];
  project.members.push(m);
  project.updatedAt = new Date().toISOString();
  save();
  return m;
}

function removeProjectMember(projectId, memberId) {
  const store = load();
  const project = store.projects.find(p => p.id === projectId);
  if (!project) return null;
  if (!project.members) project.members = [];
  project.members = project.members.filter(m => m.id !== memberId);
  project.updatedAt = new Date().toISOString();
  save();
  return true;
}

// ---- 统计 ----
function getDashboard(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  const tasks = project.tasks;
  const milestones = project.milestones;
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
    return {
      ...m,
      daysLeft,
      isOverdue: diff < 0,
      isUrgent: diff > 0 && daysLeft <= 3,
    };
  });

  return { taskStats, milestoneAlerts, project };
}

// ---- 任务公示 ----
function getAnnouncement(projectId) {
  const project = getProject(projectId);
  if (!project) return null;
  const milestones = project.milestones.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const tasksByMember = {};
  for (const t of project.tasks) {
    if (!t.assignee) continue;
    if (!tasksByMember[t.assignee]) tasksByMember[t.assignee] = [];
    tasksByMember[t.assignee].push(t);
  }
  return { project, milestones, tasksByMember };
}

module.exports = {
  load, save,
  listProjects, getProject, createProject, updateProject, deleteProject,
  addScorePoint, updateScorePoint, deleteScorePoint,
  addTask, updateTask, deleteTask, batchCreateTasksFromScorePoints,
  addMilestone, updateMilestone, deleteMilestone,
  listMembers, addMember, updateMember, deleteMember,
  getDashboard, getAnnouncement, generateMilestones,
  addProjectMember, removeProjectMember,
};
