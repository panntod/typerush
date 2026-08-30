import "./style.css";
import { WORD_LIST } from "./words";

/* ------------------------------------------------------------------ */
/*  Types & state                                                      */
/* ------------------------------------------------------------------ */

type Mode = "time" | "words";

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

const TIME_OPTIONS = [15, 30, 60, 120];
const WORD_OPTIONS = [10, 25, 50, 100];

let state: TestState = createInitialState("time", 30, 25);
let timerInterval: number | null = null;
let timeRemaining = 0;

function createInitialState(mode: Mode, timeLimit: number, wordLimit: number): TestState {
  const count = mode === "words" ? wordLimit : 200; // generous pool for time mode
  return {
    mode,
    timeLimit,
    wordLimit,
    words: generateWords(count),
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
/*  DOM references                                                     */
/* ------------------------------------------------------------------ */

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="wrap">
    <header class="topbar">
      <div class="logo"><span class="logo-mark">_</span>typerush</div>
    </header>

    <div class="config" id="config">
      <div class="config-group" id="mode-group">
        <button data-mode="time" class="active">time</button>
        <button data-mode="words">words</button>
      </div>
      <div class="config-divider"></div>
      <div class="config-group" id="amount-group"></div>
    </div>

    <main class="test-area" id="test-area">
      <div class="stats-live" id="stats-live">
        <span id="live-metric">30</span>
      </div>
      <div class="words-box" id="words-box" tabindex="0"></div>
      <input id="hidden-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
      <p class="hint">klik area teks lalu mulai mengetik &middot; <kbd>tab</kbd> + <kbd>enter</kbd> untuk restart</p>
    </main>

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
      <button id="restart-btn" class="restart-btn" title="restart test">↻</button>
    </section>

    <footer class="footer">
      <p>Workshop Riset Informatika 2026</p>
    </footer>
  </div>
`;

const wordsBox = document.querySelector<HTMLDivElement>("#words-box")!;
const hiddenInput = document.querySelector<HTMLInputElement>("#hidden-input")!;
const liveMetric = document.querySelector<HTMLSpanElement>("#live-metric")!;
const testArea = document.querySelector<HTMLDivElement>("#test-area")!;
const resultsPanel = document.querySelector<HTMLDivElement>("#results")!;
const modeGroup = document.querySelector<HTMLDivElement>("#mode-group")!;
const amountGroup = document.querySelector<HTMLDivElement>("#amount-group")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart-btn")!;

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderAmountOptions() {
  const options = state.mode === "time" ? TIME_OPTIONS : WORD_OPTIONS;
  const current = state.mode === "time" ? state.timeLimit : state.wordLimit;
  amountGroup.innerHTML = options
    .map(
      (opt) =>
        `<button data-amount="${opt}" class="${opt === current ? "active" : ""}">${opt}</button>`
    )
    .join("");
}

function renderWords() {
  wordsBox.innerHTML = state.words
    .map((word, wIndex) => {
      let letters = "";
      if (wIndex < state.currentIndex) {
        // finished word: compare to what was typed
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
      // extra typed characters
      html += `<span class="char extra">${escapeHtml(typed[i])}</span>`;
    } else {
      // missed characters (word longer than what was typed)
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
  const el = wordsBox.querySelector<HTMLElement>(`[data-word-index="${state.currentIndex}"]`);
  if (!el) return;
  const boxRect = wordsBox.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top - boxRect.top > boxRect.height - 60) {
    wordsBox.scrollTop += elRect.top - boxRect.top - 20;
  }
}

/* ------------------------------------------------------------------ */
/*  Timer                                                              */
/* ------------------------------------------------------------------ */

function startTimerIfNeeded() {
  if (state.startedAt !== null) return;
  state.startedAt = Date.now();
  if (state.mode === "time") {
    timeRemaining = state.timeLimit;
    liveMetric.textContent = String(timeRemaining);
    timerInterval = window.setInterval(() => {
      timeRemaining -= 1;
      liveMetric.textContent = String(Math.max(timeRemaining, 0));
      if (timeRemaining <= 0) {
        finishTest();
      }
    }, 1000);
  }
}

function updateLiveWordCounter() {
  if (state.mode === "words") {
    liveMetric.textContent = `${state.currentIndex}/${state.words.length}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Input handling                                                     */
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
    if (state.currentInput.length === 0) return; // ignore leading spaces
    commitCurrentWord();
    return;
  }

  if (e.key === "Backspace") {
    e.preventDefault();
    if (state.currentInput.length > 0) {
      state.currentInput = state.currentInput.slice(0, -1);
    } else if (state.currentIndex > 0 && (e.ctrlKey || e.metaKey)) {
      // no-op guard, keep simple backspace-to-previous-word disabled by default
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

    if (state.mode === "words" && state.currentIndex === state.words.length - 1) {
      const targetLen = state.words[state.currentIndex].length;
      if (state.currentInput.length >= targetLen + 8) {
        // safety cap so a runaway last word can't type forever
        commitCurrentWord();
        finishTest();
      }
    }
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
  updateLiveWordCounter();

  if (state.mode === "words" && state.currentIndex >= state.words.length) {
    renderWords();
    finishTest();
    return;
  }

  if (state.mode === "time" && state.currentIndex >= state.words.length - 10) {
    // extend the pool so the user never runs out of words in time mode
    state.words.push(...generateWords(50));
  }

  renderWords();
}

wordsBox.addEventListener("click", () => hiddenInput.focus());
document.addEventListener("click", (e) => {
  if (resultsPanel.classList.contains("hidden") && !(e.target as HTMLElement).closest(".config")) {
    hiddenInput.focus();
  }
});

/* ------------------------------------------------------------------ */
/*  Finish & results                                                   */
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

  const grossWpm = (totalTyped / 5) / elapsedMinutes;
  const netWpm = ((correct - incorrect - extra) / 5) / elapsedMinutes;
  const wpm = Math.max(Math.round(netWpm), 0);
  const rawWpm = Math.max(Math.round(grossWpm), 0);
  const totalForAcc = correct + incorrect + extra;
  const accuracy = totalForAcc > 0 ? Math.round((correct / totalForAcc) * 100) : 100;

  document.querySelector("#res-wpm")!.textContent = String(wpm);
  document.querySelector("#res-acc")!.textContent = `${accuracy}%`;
  document.querySelector("#res-raw")!.textContent = String(rawWpm);
  document.querySelector("#res-chars")!.textContent = `${correct}/${incorrect}/${extra}/${missed}`;
  document.querySelector("#res-time")!.textContent = `${Math.round(elapsedMs / 1000)}s`;
  document.querySelector("#res-mode")!.textContent =
    state.mode === "time" ? `time ${state.timeLimit}` : `words ${state.wordLimit}`;

  testArea.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
}

/* ------------------------------------------------------------------ */
/*  Reset / mode switching                                             */
/* ------------------------------------------------------------------ */

function resetTest() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  state = createInitialState(state.mode, state.timeLimit, state.wordLimit);
  liveMetric.textContent = state.mode === "time" ? String(state.timeLimit) : `0/${state.wordLimit}`;
  testArea.classList.remove("hidden");
  resultsPanel.classList.add("hidden");
  renderWords();
  hiddenInput.value = "";
  hiddenInput.focus();
}

modeGroup.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
  if (!btn) return;
  const mode = btn.dataset.mode as Mode;
  if (mode === state.mode) return;
  state.mode = mode;
  [...modeGroup.querySelectorAll("button")].forEach((b) => b.classList.toggle("active", b === btn));
  renderAmountOptions();
  resetTest();
});

amountGroup.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-amount]");
  if (!btn) return;
  const amount = Number(btn.dataset.amount);
  if (state.mode === "time") state.timeLimit = amount;
  else state.wordLimit = amount;
  [...amountGroup.querySelectorAll("button")].forEach((b) => b.classList.toggle("active", b === btn));
  resetTest();
});

restartBtn.addEventListener("click", resetTest);

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    resetTest();
  }
});

/* ------------------------------------------------------------------ */
/*  Init                                                               */
/* ------------------------------------------------------------------ */

renderAmountOptions();
renderWords();
hiddenInput.focus();

