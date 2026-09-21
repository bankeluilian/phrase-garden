export const INTERVAL_DAYS = [1, 3, 7, 15, 30, 60];

const DAY = 86_400_000;

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
