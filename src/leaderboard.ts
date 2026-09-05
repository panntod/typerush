// Simple localStorage-backed leaderboard. No backend needed — fits an expo booth setup.

export interface ScoreEntry {
  id: string;
  name: string;
  igUsername: string;
  wpm: number;
  accuracy: number;
  raw: number;
  mode: "time" | "words";
  amount: number; // seconds for time mode, word count for words mode
  createdAt: number; // epoch ms
}

const STORAGE_KEY = "typerush:leaderboard";
const PLAYER_KEY = "typerush:player";

export interface PlayerIdentity {
  name: string;
  igUsername: string;
}

/* ---------------------------- player identity --------------------------- */

export function savePlayer(player: PlayerIdentity): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export function loadPlayer(): PlayerIdentity | null {
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerIdentity;
  } catch {
    return null;
  }
}

/* ------------------------------- scores ---------------------------------- */

export function getScores(): ScoreEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ScoreEntry[];
  } catch {
    return [];
  }
}

export function addScore(entry: Omit<ScoreEntry, "id" | "createdAt">): ScoreEntry {
  const scores = getScores();
  const newEntry: ScoreEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  scores.push(newEntry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  return newEntry;
}

export function clearScores(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Ranked list, highest WPM first. Ties broken by higher accuracy, then earlier submission.
 * `mode`/`amount` are optional filters — pass undefined to include every entry regardless
 * of which test configuration produced it.
 */
export function getRanking(mode?: "time" | "words", amount?: number): ScoreEntry[] {
  let scores = getScores();
  if (mode) scores = scores.filter((s) => s.mode === mode);
  if (amount !== undefined) scores = scores.filter((s) => s.amount === amount);
  return scores.sort((a, b) => {
    if (b.wpm !== a.wpm) return b.wpm - a.wpm;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return a.createdAt - b.createdAt;
  });
}

export function getEntryRank(entryId: string, mode?: "time" | "words", amount?: number): number {
  const ranking = getRanking(mode, amount);
  const idx = ranking.findIndex((e) => e.id === entryId);
  return idx === -1 ? -1 : idx + 1;
}

export function startRankingPolling(
  mode: "time" | "words",
  amount: number,
  onUpdate: (ranking: ScoreEntry[]) => void,
  intervalMs = 5000,
): () => void {
  // Langsung update pertama kali
  onUpdate(getRanking(mode, amount));

  const interval = window.setInterval(() => {
    onUpdate(getRanking(mode, amount));
  }, intervalMs);

  // Return cleanup function
  return () => {
    window.clearInterval(interval);
  };
}