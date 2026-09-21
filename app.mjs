import { buildCloze, gradeProgress, selectDailyCards, summarizeProgress } from './study-core.mjs';

const STORAGE_KEY = 'phrase-garden-v1';
const state = {
  cards: [], progress: {}, settings: { goal: 20 }, history: [], session: [], index: 0,
  view: 'today', filter: 'all', query: '', revealed: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.progress = saved.progress || {};
    state.settings = { goal: 20, ...(saved.settings || {}) };
    state.history = Array.isArray(saved.history) ? saved.history : [];
  } catch { localStorage.removeItem(STORAGE_KEY); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    progress: state.progress, settings: state.settings, history: state.history.slice(-600),
  }));
}

function dayKey(value = Date.now()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dailyDone() { return state.history.filter((item) => dayKey(item.at) === dayKey()).length; }

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

function cardMarkup(card, context, position, total) {
  if (!card) return `<div class="empty-card"><div><h2>今天完成啦</h2><p>休息一下，明天会按记忆规律继续安排。</p><button class="outline" data-go="library">逛逛全部词库</button></div></div>`;
  const progress = state.progress[card.id];
  const cloze = buildCloze(card);
  const isReview = context === 'review';
  const prompt = isReview ? cloze.question : card.en;
  return `<div class="card-meta"><span>${card.category || '固定搭配'}</span><span>${position} / ${total}</span></div>
    <h2 class="phrase">${escapeHtml(prompt)}</h2>
    <p class="meaning ${isReview && !state.revealed ? 'reveal' : 'shown'}" data-reveal>${escapeHtml(isReview ? `${cloze.answer} · ${card.zh}` : card.zh)}</p>
    ${card.example ? `<div class="example ${isReview && !state.revealed ? 'reveal' : 'shown'}" data-reveal><b>${escapeHtml(card.example)}</b>${escapeHtml(card.translation || '')}</div>` : ''}
    <div class="note">${escapeHtml(card.note || '把英文搭配和中文含义整体记忆，回想时先遮住答案。')}${progress ? ` · 当前阶段 ${progress.stage}/6` : ' · 新卡片'}</div>
    <div class="study-actions">
      ${isReview && !state.revealed ? '<button class="rate-good" data-action="reveal">揭晓答案</button>' : '<button class="rate-again" data-rating="again">忘记</button><button class="rate-hard" data-rating="hard">模糊</button><button class="rate-good" data-rating="good">认识</button>'}
    </div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function refreshSession() {
  state.session = selectDailyCards(state.cards, state.progress, Date.now(), state.settings.goal);
  state.index = 0; state.revealed = false;
}

function renderToday() {
  renderStats();
  if (!state.session.length || state.index >= state.session.length) refreshSession();
  const card = state.session[state.index];
  $('#study-panel').innerHTML = cardMarkup(card, 'today', Math.min(state.index + 1, state.session.length), state.session.length);
}

function dueCards() {
  const now = Date.now();
  const due = state.cards.filter((card) => state.progress[card.id]?.due <= now)
    .sort((a, b) => state.progress[a.id].due - state.progress[b.id].due);
  if (due.length) return due;
  return state.cards.filter((card) => state.progress[card.id]).sort((a, b) => (state.progress[a.id].lastReviewed || 0) - (state.progress[b.id].lastReviewed || 0)).slice(0, 20);
}

function renderReview() {
  const cards = dueCards();
  if (state.index >= cards.length) state.index = 0;
  $('#review-card').innerHTML = cardMarkup(cards[state.index], 'review', Math.min(state.index + 1, cards.length), cards.length);
}

function rate(rating) {
  const cards = state.view === 'review' ? dueCards() : state.session;
  const card = cards[state.index]; if (!card) return;
  const now = Date.now();
  state.progress[card.id] = gradeProgress(state.progress[card.id], rating, now);
  state.history.push({ cardId: card.id, rating, at: now });
  saveState(); state.index += 1; state.revealed = false;
  toast(rating === 'again' ? '已安排 10 分钟后回炉' : rating === 'hard' ? '已安排明天复习' : '已加入间隔复习计划');
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
    const rating = event.target.closest('[data-rating]')?.dataset.rating;
    if (rating) rate(rating);
    if (event.target.closest('[data-action="reveal"]')) { state.revealed = true; renderReview(); }
    const go = event.target.closest('[data-go]')?.dataset.go; if (go) setView(go);
  });
  $('#search-input').addEventListener('input', (event) => { state.query = event.target.value; renderLibrary(); });
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => { $$('.chip').forEach((item) => item.classList.remove('active')); chip.classList.add('active'); state.filter = chip.dataset.filter; renderLibrary(); }));
  $('#daily-goal').addEventListener('change', (event) => { state.settings.goal = Number(event.target.value); saveState(); refreshSession(); renderStats(); toast('每日目标已更新'); });
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('确定清空全部学习记录吗？该操作无法撤销。')) return;
    state.progress = {}; state.history = []; saveState(); refreshSession(); renderStats(); toast('学习记录已清空');
  });
}

async function init() {
  loadState();
  const response = await fetch('./cards.json');
  if (!response.ok) throw new Error('词库加载失败');
  state.cards = await response.json();
  $('#loading').hidden = true;
  $('#daily-goal').value = String(state.settings.goal);
  refreshSession(); bindEvents();
  const initial = ['today', 'library', 'review', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  setView(initial);
}

init().catch((error) => { $('#loading').textContent = `${error.message}，请刷新页面重试。`; });
