import "./style.css";
import { WORD_LIST } from "./words";
import {
  addScore,
  getRanking,
  loadPlayer,
  savePlayer,
  type PlayerIdentity,
  type ScoreEntry,
} from "./leaderboard";

/* ------------------------------------------------------------------ */
/*  Types & state                                                      */
/* ------------------------------------------------------------------ */

type Mode = "time";
type View = "identity" | "test" | "results" | "leaderboard";

interface TestState {
  mode: Mode;
  timeLimit: number; // seconds, used when mode === "time"
  wordLimit: number; // words, used when mode === "words"
  words: string[];
  typed: string[]; // what the user has actually typed per word (finished words)
  currentInput: string; // current (unfinished) word buffer
  currentIndex: number; // index of the word currently being typed
  startedAt: number | null;
  finished: boolean;
  correctChars: number;
  incorrectChars: number;
  extraChars: number;
  missedChars: number;
  keystrokes: number;
}

let state: TestState = createInitialState();
let timerInterval: number | null = null;
let timeRemaining = 0;
let currentPlayer: PlayerIdentity | null = loadPlayer();
let lastEntry: ScoreEntry | null = null;
let leaderboardFilter: { mode: Mode; amount: number } = {
  mode: "time",
  amount: 15,
};

function createInitialState(): TestState {
  return {
    mode: "time",
    timeLimit: 15,
    wordLimit: 0,
    words: generateWords(200),
    typed: [],
    currentInput: "",
    currentIndex: 0,
    startedAt: null,
    finished: false,
    correctChars: 0,
    incorrectChars: 0,
    extraChars: 0,
    missedChars: 0,
    keystrokes: 0,
  };
}

function generateWords(count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  DOM shell                                                           */
/* ------------------------------------------------------------------ */

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="wrap">
    <header class="topbar">
      <div class="logo"><span class="logo-mark">_</span>typerush</div>
      <nav class="topnav">
        <span id="player-badge" class="player-badge hidden"></span>
        <button id="nav-leaderboard" class="nav-link">peringkat</button>
      </nav>
    </header>

    <!-- IDENTITY SCREEN -->
    <section class="identity-screen" id="identity-screen">
      <h1 class="identity-title">siap ikut lomba ngetik? ⌨️</h1>
      <p class="identity-sub">masukin nama & username instagram kamu buat masuk papan peringkat.</p>
      <form id="identity-form" class="identity-form">
        <label>
          nama
          <input id="input-name" type="text" placeholder="cth. budi santoso" maxlength="30" required />
        </label>
        <label>
          username instagram
          <div class="ig-input">
            <span>@</span>
            <input id="input-ig" type="text" placeholder="budi.ngetik" maxlength="30" />
          </div>
        </label>
        <button type="submit" class="primary-btn">mulai tes →</button>
      </form>
    </section>

    <!-- TEST SCREEN -->
    <main class="test-area hidden" id="test-area">
      <div class="stats-live" id="stats-live">
        <span id="live-metric">15</span>
      </div>
      <div class="words-box" id="words-box" tabindex="0"></div>
      <input id="hidden-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
      <p class="hint">klik area teks lalu mulai mengetik &middot; <kbd>tab</kbd> + <kbd>enter</kbd> untuk restart</p>
    </main>

    <!-- RESULTS SCREEN -->
    <section class="results hidden" id="results">
      <div class="results-grid">
        <div class="result-big">
          <span class="result-label">wpm</span>
          <span class="result-value" id="res-wpm">0</span>
        </div>
        <div class="result-big">
          <span class="result-label">acc</span>
          <span class="result-value" id="res-acc">0%</span>
        </div>
        <div class="result-small">
          <div><span class="result-label">raw</span><span id="res-raw">0</span></div>
          <div><span class="result-label">karakter</span><span id="res-chars">0/0/0/0</span></div>
          <div><span class="result-label">waktu</span><span id="res-time">0s</span></div>
          <div><span class="result-label">mode</span><span id="res-mode">-</span></div>
        </div>
      </div>
      <div class="results-side">
        <div class="rank-callout" id="rank-callout">
          <span class="rank-number" id="rank-number">#1</span>
          <span class="rank-caption" id="rank-caption">peringkat kamu</span>
        </div>
        <div class="results-actions">
          <button id="restart-btn" class="restart-btn" title="coba lagi">↻ coba lagi</button>
          <button id="view-leaderboard-btn" class="secondary-btn">lihat peringkat</button>
          <button id="new-player-btn" class="secondary-btn">pemain berikutnya</button>
        </div>
      </div>
    </section>

    <!-- LEADERBOARD SCREEN -->
    <section class="leaderboard-screen hidden" id="leaderboard-screen">
      <div class="leaderboard-header">
        <h2>papan peringkat</h2>
        <button id="back-from-leaderboard" class="secondary-btn">← kembali</button>
      </div>
      <div class="leaderboard-filters" id="leaderboard-filters"></div>
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table" id="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>nama</th>
              <th>instagram</th>
              <th>wpm</th>
              <th>akurasi</th>
            </tr>
          </thead>
          <tbody id="leaderboard-body"></tbody>
        </table>
      </div>
      <p class="leaderboard-empty hidden" id="leaderboard-empty">belum ada yang main di kategori ini. jadilah yang pertama!</p>
    </section>

    <footer class="footer">
      <p>Workshop & Riset Informatika &copy; 2026</p>
    </footer>
  </div>
`;

/* ------------------------------------------------------------------ */
/*  Element refs                                                       */
/* ------------------------------------------------------------------ */

const identityScreen = document.querySelector<HTMLElement>("#identity-screen")!;
const identityForm = document.querySelector<HTMLFormElement>("#identity-form")!;
const inputName = document.querySelector<HTMLInputElement>("#input-name")!;
const inputIg = document.querySelector<HTMLInputElement>("#input-ig")!;

const wordsBox = document.querySelector<HTMLDivElement>("#words-box")!;
const hiddenInput = document.querySelector<HTMLInputElement>("#hidden-input")!;
const liveMetric = document.querySelector<HTMLSpanElement>("#live-metric")!;
const testArea = document.querySelector<HTMLDivElement>("#test-area")!;

const resultsPanel = document.querySelector<HTMLDivElement>("#results")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart-btn")!;
const viewLeaderboardBtn = document.querySelector<HTMLButtonElement>(
  "#view-leaderboard-btn",
)!;
const newPlayerBtn =
  document.querySelector<HTMLButtonElement>("#new-player-btn")!;
const rankNumber = document.querySelector<HTMLSpanElement>("#rank-number")!;
const rankCaption = document.querySelector<HTMLSpanElement>("#rank-caption")!;

const leaderboardScreen = document.querySelector<HTMLElement>(
  "#leaderboard-screen",
)!;
const leaderboardFilters = document.querySelector<HTMLDivElement>(
  "#leaderboard-filters",
)!;
const leaderboardBody =
  document.querySelector<HTMLTableSectionElement>("#leaderboard-body")!;
const leaderboardEmpty =
  document.querySelector<HTMLParagraphElement>("#leaderboard-empty")!;
const navLeaderboard =
  document.querySelector<HTMLButtonElement>("#nav-leaderboard")!;
const backFromLeaderboard = document.querySelector<HTMLButtonElement>(
  "#back-from-leaderboard",
)!;
const playerBadge = document.querySelector<HTMLSpanElement>("#player-badge")!;

/* ------------------------------------------------------------------ */
/*  View management                                                     */
/* ------------------------------------------------------------------ */

function showView(view: View) {
  identityScreen.classList.toggle("hidden", view !== "identity");
  testArea.classList.toggle("hidden", view !== "test");
  resultsPanel.classList.toggle("hidden", view !== "results");
  leaderboardScreen.classList.toggle("hidden", view !== "leaderboard");

  if (view === "test") {
    hiddenInput.focus();
  }
  updatePlayerBadge();
}

function updatePlayerBadge() {
  if (currentPlayer) {
    playerBadge.textContent = `👤 ${currentPlayer.name}`;
    playerBadge.classList.remove("hidden");
  } else {
    playerBadge.classList.add("hidden");
  }
}

/* ------------------------------------------------------------------ */
/*  Identity screen                                                     */
/* ------------------------------------------------------------------ */

if (currentPlayer) {
  inputName.value = currentPlayer.name;
  inputIg.value = currentPlayer.igUsername;
}

identityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = inputName.value.trim();
  const ig = inputIg.value.trim().replace(/^@/, "");
  if (!name) return;

  currentPlayer = { name, igUsername: ig };
  savePlayer(currentPlayer);
  resetTest();
  showView("test");
});

/* ------------------------------------------------------------------ */
/*  Rendering the typing area                                          */
/* ------------------------------------------------------------------ */

function renderWords() {
  wordsBox.innerHTML = state.words
    .map((word, wIndex) => {
      let letters = "";
      if (wIndex < state.currentIndex) {
        const typedWord = state.typed[wIndex] ?? "";
        letters = renderFinishedWord(word, typedWord);
      } else if (wIndex === state.currentIndex) {
        letters = renderCurrentWord(word, state.currentInput);
      } else {
        letters = word
          .split("")
          .map((ch) => `<span class="char">${escapeHtml(ch)}</span>`)
          .join("");
      }
      const wordClass = wIndex === state.currentIndex ? "word current" : "word";
      return `<span class="${wordClass}" data-word-index="${wIndex}">${letters}</span>`;
    })
    .join(" ");

  scrollToCurrentWord();
}

function renderFinishedWord(word: string, typed: string): string {
  let html = "";
  const maxLen = Math.max(word.length, typed.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < word.length && i < typed.length) {
      const cls = word[i] === typed[i] ? "char correct" : "char incorrect";
      html += `<span class="${cls}">${escapeHtml(word[i])}</span>`;
    } else if (i >= word.length) {
      html += `<span class="char extra">${escapeHtml(typed[i])}</span>`;
    } else {
      html += `<span class="char missed">${escapeHtml(word[i])}</span>`;
    }
  }
  return html;
}

function renderCurrentWord(word: string, input: string): string {
  let html = "";
  const maxLen = Math.max(word.length, input.length);
  for (let i = 0; i < maxLen; i++) {
    const isCaret = i === input.length;
    let cls = "char";
    let ch = "";
    if (i < word.length) {
      ch = word[i];
      if (i < input.length) {
        cls += input[i] === word[i] ? " correct" : " incorrect";
      }
    } else {
      ch = input[i];
      cls += " extra";
    }
    if (isCaret) cls += " caret-before";
    html += `<span class="${cls}">${escapeHtml(ch)}</span>`;
  }
  if (input.length >= word.length) {
    html += `<span class="char caret-end"></span>`;
  }
  return html;
}

function escapeHtml(ch: string): string {
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  return ch;
}

function scrollToCurrentWord() {
  const el = wordsBox.querySelector<HTMLElement>(
    `[data-word-index="${state.currentIndex}"]`,
  );
  if (!el) return;
  const boxRect = wordsBox.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top - boxRect.top > boxRect.height - 60) {
    wordsBox.scrollTop += elRect.top - boxRect.top - 20;
  }
}

/* ------------------------------------------------------------------ */
/*  Timer                                                               */
/* ------------------------------------------------------------------ */

function startTimerIfNeeded() {
  if (state.startedAt !== null) return;

  state.startedAt = Date.now();
  timeRemaining = 15;
  liveMetric.textContent = String(timeRemaining);

  timerInterval = window.setInterval(() => {
    timeRemaining -= 1;
    liveMetric.textContent = String(Math.max(timeRemaining, 0));

    if (timeRemaining <= 0) {
      finishTest();
    }
  }, 1000);
}


/* ------------------------------------------------------------------ */
/*  Input handling                                                      */
/* ------------------------------------------------------------------ */

hiddenInput.addEventListener("keydown", (e) => {
  if (state.finished) return;

  if (e.key === "Tab") {
    e.preventDefault();
    resetTest();
    return;
  }

  if (e.key === " ") {
    e.preventDefault();
    if (state.currentInput.length === 0) return;
    commitCurrentWord();
    return;
  }

  if (e.key === "Backspace") {
    e.preventDefault();
    if (state.currentInput.length > 0) {
      state.currentInput = state.currentInput.slice(0, -1);
    }
    renderWords();
    return;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    startTimerIfNeeded();
    state.currentInput += e.key;
    state.keystrokes += 1;

    const targetWord = state.words[state.currentIndex] ?? "";
    const idx = state.currentInput.length - 1;
    if (idx < targetWord.length) {
      if (e.key === targetWord[idx]) state.correctChars += 1;
      else state.incorrectChars += 1;
    } else {
      state.extraChars += 1;
    }

    renderWords();
  }
});

function commitCurrentWord() {
  state.typed[state.currentIndex] = state.currentInput;

  const target = state.words[state.currentIndex] ?? "";

  if (state.currentInput.length < target.length) {
    state.missedChars += target.length - state.currentInput.length;
  }

  state.currentInput = "";
  state.currentIndex += 1;

  if (state.currentIndex >= state.words.length - 10) {
    state.words.push(...generateWords(50));
  }

  renderWords();
}

wordsBox.addEventListener("click", () => hiddenInput.focus());
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (
    !testArea.classList.contains("hidden") &&
    !target.closest(".topbar")
  ) {
    hiddenInput.focus();
  }
});

/* ------------------------------------------------------------------ */
/*  Finish & results                                                    */
/* ------------------------------------------------------------------ */

function finishTest() {
  if (state.finished) return;
  state.finished = true;
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const elapsedMs = state.startedAt ? Date.now() - state.startedAt : 0;
  const elapsedMinutes = Math.max(elapsedMs / 1000 / 60, 1 / 60);

  const correct = state.correctChars;
  const incorrect = state.incorrectChars;
  const extra = state.extraChars;
  const missed = state.missedChars;
  const totalTyped = correct + incorrect + extra;

  const grossWpm = totalTyped / 5 / elapsedMinutes;
  const netWpm = (correct - incorrect - extra) / 5 / elapsedMinutes;
  const wpm = Math.max(Math.round(netWpm), 0);
  const rawWpm = Math.max(Math.round(grossWpm), 0);
  const totalForAcc = correct + incorrect + extra;
  const accuracy =
    totalForAcc > 0 ? Math.round((correct / totalForAcc) * 100) : 100;

  document.querySelector("#res-wpm")!.textContent = String(wpm);
  document.querySelector("#res-acc")!.textContent = `${accuracy}%`;
  document.querySelector("#res-raw")!.textContent = String(rawWpm);
  document.querySelector("#res-chars")!.textContent =
    `${correct}/${incorrect}/${extra}/${missed}`;
  document.querySelector("#res-time")!.textContent =
    `${Math.round(elapsedMs / 1000)}s`;
  document.querySelector("#res-mode")!.textContent = "time 15";

  const amount = 15;

  if (currentPlayer) {
    lastEntry = addScore({
      name: currentPlayer.name,
      igUsername: currentPlayer.igUsername,
      wpm,
      accuracy,
      raw: rawWpm,
      mode: state.mode,
      amount,
    });

    const ranking = getRanking(state.mode, amount);
    const rankIdx = ranking.findIndex((e) => e.id === lastEntry!.id);
    const rank = rankIdx === -1 ? ranking.length : rankIdx + 1;
    rankNumber.textContent = `#${rank}`;
    rankCaption.textContent = `peringkat kamu dari ${ranking.length} peserta (${state.mode} ${amount})`;
  }

  showView("results");
}

/* ------------------------------------------------------------------ */
/*  Reset / mode switching                                              */
/* ------------------------------------------------------------------ */

function resetTest() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  state = createInitialState();
  liveMetric.textContent = "15";

  showView("test");
  renderWords();
  hiddenInput.value = "";
  hiddenInput.focus();
}

restartBtn.addEventListener("click", resetTest);

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !testArea.classList.contains("hidden")) {
    e.preventDefault();
    resetTest();
  }
});

/* ------------------------------------------------------------------ */
/*  Leaderboard screen                                                  */
/* ------------------------------------------------------------------ */

function renderLeaderboardFilters() {
  leaderboardFilters.innerHTML = `
    <button data-mode="time" data-amount="15" class="active">
      time 15
    </button>
  `;
}

function renderLeaderboardTable() {
  const ranking = getRanking(
    leaderboardFilter.mode,
    leaderboardFilter.amount,
  ).slice(0, 20);

  if (ranking.length === 0) {
    leaderboardBody.innerHTML = "";
    leaderboardEmpty.classList.remove("hidden");
    return;
  }
  leaderboardEmpty.classList.add("hidden");

  leaderboardBody.innerHTML = ranking
    .map((entry, i) => {
      const isMe = lastEntry && entry.id === lastEntry.id;
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1);
      return `
        <tr class="${isMe ? "me" : ""}">
          <td>${medal}</td>
          <td>${escapeHtml(entry.name)}</td>
          <td>${entry.igUsername ? "@" + escapeHtml(entry.igUsername) : "—"}</td>
          <td>${entry.wpm}</td>
          <td>${entry.accuracy}%</td>
        </tr>
      `;
    })
    .join("");
}

function openLeaderboard() {
  renderLeaderboardFilters();
  renderLeaderboardTable();
  showView("leaderboard");
}

leaderboardFilters.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-mode]",
  );
  if (!btn) return;
  leaderboardFilter = {
    mode: btn.dataset.mode as Mode,
    amount: Number(btn.dataset.amount),
  };
  renderLeaderboardFilters();
  renderLeaderboardTable();
});

navLeaderboard.addEventListener("click", openLeaderboard);

viewLeaderboardBtn.addEventListener("click", () => {
  leaderboardFilter = {
    mode: "time",
    amount: 15,
  };

  openLeaderboard();
});

backFromLeaderboard.addEventListener("click", () => {
  showView(
    currentPlayer && state.finished
      ? "results"
      : currentPlayer
        ? "test"
        : "identity",
  );
});

newPlayerBtn.addEventListener("click", () => {
  currentPlayer = null;
  inputName.value = "";
  inputIg.value = "";
  showView("identity");
  inputName.focus();
});

/* ------------------------------------------------------------------ */
/*  Init                                                                */
/* ------------------------------------------------------------------ */

renderWords();

if (currentPlayer) {
  showView("test");
} else {
  showView("identity");
}
