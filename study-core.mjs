export const INTERVAL_DAYS = [1, 3, 7, 15, 30, 60];

const DAY = 86_400_000;

export function createQuiz(cards) {
  const ids = cards.map(card => card.id);
  return { ids, group: 0, direction: 'en', queue: ids.slice(0, 5).map(id => ({ id })), mistakes: {}, done: !ids.length };
}

export function answerQuiz(quiz, correct, cards) {
  if (quiz.done) return [];
  const task = quiz.queue.shift();
  if (!correct) {
    if (!task.spacer) quiz.mistakes[task.id] = true;
    const candidates = [...quiz.ids, ...cards.map(card => card.id)];
    while (quiz.queue.length < 2) {
      const id = candidates.find(id => id !== task.id && !quiz.queue.some(item => item.id === id));
      if (!id) break;
      quiz.queue.push({ id, spacer: true });
    }
    quiz.queue.splice(2, 0, task);
  }
  if (quiz.queue.length) return [];
  const group = quiz.ids.slice(quiz.group * 5, quiz.group * 5 + 5);
  if (quiz.direction === 'en') {
    quiz.direction = 'zh';
    quiz.queue = group.map(id => ({ id }));
    return [];
  }
  const completed = group.map(id => ({ id, rating: quiz.mistakes[id] ? 'hard' : 'good' }));
  quiz.group += 1;
  quiz.direction = 'en';
  quiz.mistakes = {};
  quiz.queue = quiz.ids.slice(quiz.group * 5, quiz.group * 5 + 5).map(id => ({ id }));
  quiz.done = !quiz.queue.length;
  return completed;
}

export function quizOptions(card, direction, cards) {
  const language = direction === 'en' ? 'zh' : 'en';
  const shuffle = items => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const choices = [...new Set(cards.filter(item => item[direction] !== card[direction]).map(item => item[language]))]
    .filter(label => label !== card[language]);
  return shuffle([card[language], ...shuffle(choices).slice(0, 3)]);
}

export function gradeProgress(previous, rating, now = Date.now()) {
  const stage = Number(previous?.stage ?? 0);
  const lapses = Number(previous?.lapses ?? 0);
  const reviews = Number(previous?.reviews ?? 0) + 1;

  if (rating === 'again') {
    return {
      stage: 0,
      due: now + 10 * 60_000,
      lapses: lapses + 1,
      reviews,
      lastReviewed: now,
      rating,
    };
  }

  if (rating === 'hard') {
    return {
      stage: Math.max(0, stage - 1),
      due: now + DAY,
      lapses,
      reviews,
      lastReviewed: now,
      rating,
    };
  }

  const nextStage = Math.min(stage + 1, INTERVAL_DAYS.length);
  const interval = INTERVAL_DAYS[Math.min(stage, INTERVAL_DAYS.length - 1)];
  return {
    stage: nextStage,
    due: now + interval * DAY,
    lapses,
    reviews,
    lastReviewed: now,
    rating: 'good',
  };
}

export function selectDailyCards(cards, progress, now = Date.now(), goal = 20) {
  const due = cards
    .filter((card) => progress[card.id] && progress[card.id].due <= now)
    .sort((a, b) => progress[a.id].due - progress[b.id].due);
  const unseen = cards.filter((card) => !progress[card.id]);
  const future = cards
    .filter((card) => progress[card.id] && progress[card.id].due > now)
    .sort((a, b) => progress[a.id].due - progress[b.id].due);

  return [...due, ...unseen, ...future].slice(0, Math.max(1, goal));
}

export function buildCloze(card) {
  if (card.question && Array.isArray(card.answers) && card.answers[0]) {
    return { question: card.question, answer: card.answers[0] };
  }

  const words = card.en.trim().split(/\s+/);
  const answer = words.pop() || card.en;
  return { question: `${words.join(' ')} ___`.trim(), answer };
}

export function summarizeProgress(cards, progress, now = Date.now()) {
  let learned = 0;
  let due = 0;
  let mastered = 0;

  for (const card of cards) {
    const item = progress[card.id];
    if (!item) continue;
    learned += 1;
    if (item.due <= now) due += 1;
    if (item.stage >= INTERVAL_DAYS.length) mastered += 1;
  }

  return {
    total: cards.length,
    learned,
    due,
    learning: learned - mastered,
    mastered,
    unseen: cards.length - learned,
  };
}
