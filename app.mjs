import { createQuiz, answerQuiz, quizOptions, gradeProgress, selectDailyCards, summarizeProgress } from './study-core.mjs?v=2';

const STORAGE_KEY = 'phrase-garden-v1';
const state = {
  cards: [], progress: {}, settings: { goal: 20 }, history: [], session: [], index: 0,
  view: 'today', filter: 'all', query: '', revealed: false,
  practice: { day: '', sessions: {} },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.progress = saved.progress || {};
    state.settings = { goal: 20, ...(saved.settings || {}) };
    state.history = Array.isArray(saved.history) ? saved.history : [];
    if (saved.practice?.day === dayKey()) state.practice = saved.practice;
  } catch { toast('学习记录读取失败，请先备份浏览器数据'); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    progress: state.progress, settings: state.settings, history: state.history, practice: state.practice,
  }));
}

function dayKey(value = Date.now()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dailyDone() { return new Set(state.history.filter((item) => dayKey(item.at) === dayKey()).map(item => item.cardId)).size; }

function streak() {
  const days = new Set(state.history.map((item) => dayKey(item.at)));
  let count = 0;
  const date = new Date();
  while (days.has(dayKey(date.getTime()))) { count += 1; date.setDate(date.getDate() - 1); }
  return count;
}

function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 1700);
}

function setView(view) {
  state.view = view;
  $$('.view').forEach((node) => { node.hidden = node.id !== `view-${view}`; });
  $$('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  if (view === 'library') renderLibrary();
  if (view === 'review') renderReview();
  if (view === 'today') renderToday();
  location.hash = view;
}

function renderStats() {
  const stats = summarizeProgress(state.cards, state.progress);
  $('#stats-grid').innerHTML = [
    ['今日完成', dailyDone()], ['到期复习', stats.due], ['学习中', stats.learning], ['已掌握', stats.mastered],
  ].map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('');
  const done = dailyDone(); const goal = state.settings.goal;
  $('#goal-done').textContent = done; $('#goal-ring small').textContent = `/ ${goal}`;
  $('#goal-ring').style.setProperty('--p', Math.min(100, Math.round(done / goal * 100)));
  $('#streak-count').textContent = streak();
}

function getSession(context) {
  if (state.practice.day !== dayKey()) state.practice = { day: dayKey(), sessions: {} };
  if (!state.practice.sessions[context]) {
    const completed = new Set(state.history.filter(item => dayKey(item.at) === dayKey()).map(item => item.cardId));
    const available = state.cards.filter(card => !completed.has(card.id));
    const count = Math.max(0, state.settings.goal - dailyDone());
    const cards = context === 'review' ? dueCards() : count ? selectDailyCards(available, state.progress, Date.now(), count) : [];
    state.practice.sessions[context] = { quiz: createQuiz(cards), feedback: null, options: null };
  }
  return state.practice.sessions[context];
}

function cardMarkup(context) {
  const session = getSession(context);
  const { quiz, feedback } = session;
  if (quiz.done && !feedback) return `<div class="empty-card"><div><h2>${context === 'review' ? '到期复习已完成' : '今天完成啦'}</h2><p>学习记录已保存，明天继续。</p><button class="outline" data-go="library">逛逛全部词库</button></div></div>`;
  const task = feedback || { ...quiz.queue[0], direction: quiz.direction, group: quiz.group };
  const card = state.cards.find(item => item.id === task.id);
  const language = task.direction === 'en' ? 'zh' : 'en';
  if (!session.options) session.options = quizOptions(card, task.direction, state.cards);
  saveState();
  return `<div class="card-meta"><span>第 ${task.group + 1} / ${Math.ceil(quiz.ids.length / 5)} 组</span><span>${task.direction === 'en' ? '① 英文 → 中文' : '② 中文 → 英文'}</span></div>
    <p class="quiz-hint">${task.spacer ? '穿插巩固 · 错题稍后再见' : '每组 5 个 · 整组完成后切换语言'}</p>
    <h2 class="phrase quiz-prompt" lang="${task.direction === 'en' ? 'en' : 'zh-CN'}">${escapeHtml(card[task.direction])}</h2>
    <p class="quiz-instruction">${task.direction === 'en' ? '选择对应的中文含义' : '选择对应的英文搭配'}</p>
    <div class="quiz-options">${session.options.map((label, index) => `<button class="quiz-option ${feedback ? label === card[language] ? 'correct' : index === feedback.choice ? 'incorrect' : '' : ''}" data-choice="${index}" ${feedback ? 'disabled' : ''}><span>${'ABCD'[index]}</span><b>${escapeHtml(label)}</b>${feedback && label === card[language] ? '<em>✓</em>' : ''}</button>`).join('')}</div>
    ${feedback ? `<div class="quiz-feedback" role="status"><strong>${feedback.correct ? '答对了' : '再记一次：' + escapeHtml(card[language])}</strong><p>${feedback.correct ? '点击下一题继续' : '这道题会隔 2 道题再出现。'}</p>${card.example ? `<p>${escapeHtml(card.example)}<br>${escapeHtml(card.translation || '')}</p>` : ''}</div><button class="quiz-next" data-action="next">${quiz.done ? '完成本轮' : '下一题'} →</button>` : ''}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function refreshSession() {
  state.practice = { day: dayKey(), sessions: {} };
}

function renderToday() {
  renderStats();
  $('#study-panel').innerHTML = cardMarkup('today');
}

function dueCards() {
  const now = Date.now();
  const due = state.cards.filter((card) => state.progress[card.id]?.due <= now)
    .sort((a, b) => state.progress[a.id].due - state.progress[b.id].due);
  return due;
}

function renderReview() {
  $('#review-card').innerHTML = cardMarkup('review');
}

function choose(choice) {
  const session = getSession(state.view);
  if (session.feedback || session.quiz.done || !session.options?.[choice]) return;
  const quiz = session.quiz;
  const task = quiz.queue[0];
  const card = state.cards.find(item => item.id === task.id);
  const correct = session.options[choice] === card[quiz.direction === 'en' ? 'zh' : 'en'];
  session.feedback = { ...task, direction: quiz.direction, group: quiz.group, choice, correct };
  const now = Date.now();
  for (const {id, rating} of answerQuiz(quiz, correct, state.cards)) {
    state.progress[id] = gradeProgress(state.progress[id], rating, now);
    state.history.push({ cardId: id, rating, at: now });
  }
  saveState(); renderStats();
  if (state.view === 'review') renderReview(); else renderToday();
}

function renderLibrary() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.cards.filter((card) => {
    const progress = state.progress[card.id];
    const matchText = `${card.en} ${card.zh} ${card.example || ''}`.toLowerCase().includes(query);
    const matchFilter = state.filter === 'all' || (state.filter === 'unseen' && !progress) ||
      (state.filter === 'learning' && progress && progress.stage < 6) || (state.filter === 'mastered' && progress?.stage >= 6);
    return matchText && matchFilter;
  });
  $('#library-count').textContent = `${filtered.length} / ${state.cards.length} 条`;
  $('#library-list').innerHTML = filtered.slice(0, 300).map((card) => {
    const progress = state.progress[card.id];
    return `<article class="phrase-row"><strong>${escapeHtml(card.en)}</strong><p>${escapeHtml(card.zh)}</p><span class="stage-badge">${progress ? `阶段 ${progress.stage}/6` : '未学习'}</span></article>`;
  }).join('') || '<div class="empty-state">没有找到匹配的搭配。</div>';
}

function bindEvents() {
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => { state.index = 0; state.revealed = false; setView(button.dataset.view); }));
  document.addEventListener('click', (event) => {
    const option = event.target.closest('[data-choice]');
    if (option) choose(Number(option.dataset.choice));
    if (event.target.closest('[data-action="next"]')) {
      const session = getSession(state.view);
      session.feedback = null; session.options = null; saveState();
      if (state.view === 'review') renderReview(); else renderToday();
    }
    const go = event.target.closest('[data-go]')?.dataset.go; if (go) setView(go);
  });
  $('#search-input').addEventListener('input', (event) => { state.query = event.target.value; renderLibrary(); });
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => { $$('.chip').forEach((item) => item.classList.remove('active')); chip.classList.add('active'); state.filter = chip.dataset.filter; renderLibrary(); }));
  $('#daily-goal').addEventListener('change', (event) => { state.settings.goal = Number(event.target.value); saveState(); renderStats(); toast('目标已更新，下轮练习生效'); });
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('确定清空全部学习记录吗？该操作无法撤销。')) return;
    state.progress = {}; state.history = []; refreshSession(); saveState(); renderStats(); toast('学习记录已清空');
  });
}

async function init() {
  loadState();
  const response = await fetch('./cards.json');
  if (!response.ok) throw new Error('词库加载失败');
  state.cards = await response.json();
  $('#loading').hidden = true;
  $('#daily-goal').value = String(state.settings.goal);
  bindEvents();
  const initial = ['today', 'library', 'review', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  setView(initial);
}

init().catch((error) => { $('#loading').textContent = `${error.message}，请刷新页面重试。`; });
