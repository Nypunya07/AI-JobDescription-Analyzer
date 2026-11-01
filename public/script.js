// ============================================================
// public/script.js — Frontend Logic
// ============================================================
// This file runs in the USER'S BROWSER (not on the server).
// It reads the form inputs, calls our Express backend,
// and renders the Gemini results dynamically in the page.
//
// No frameworks — pure vanilla JavaScript.
// ============================================================


// ─── 1. DOM REFERENCES ──────────────────────────────────────
// We "grab" every HTML element we'll need, once at the top.
// This is more efficient than querying the DOM repeatedly.
//
// document.getElementById('id') returns the element with that id,
// or null if it doesn't exist.

const jobDescriptionEl   = document.getElementById('job-description');
const userSkillsEl       = document.getElementById('user-skills');
const analyzeBtnEl       = document.getElementById('analyze-btn');
const btnDefaultContent  = document.getElementById('btn-default-content');
const btnLoadingContent  = document.getElementById('btn-loading-content');
const btnLoadingTextEl   = document.getElementById('btn-loading-text');  // updated during retries

const errorBannerEl      = document.getElementById('error-banner');
const errorMessageEl     = document.getElementById('error-message');

const resultsSectionEl   = document.getElementById('results-section');

// Stats counters
const countRequiredEl    = document.getElementById('count-required');
const countMatchedEl     = document.getElementById('count-matched');
const countMissingEl     = document.getElementById('count-missing');

// Skill chip containers
const requiredListEl     = document.getElementById('required-skills-list');
const matchedListEl      = document.getElementById('matched-skills-list');
const missingListEl      = document.getElementById('missing-skills-list');

// Recommendations container
const recommendationsEl  = document.getElementById('recommendations-list');

// Reset button
const resetBtnEl         = document.getElementById('reset-btn');


// ─── 2. UI STATE HELPERS ────────────────────────────────────
// Small, focused functions that update a single piece of UI.
// Keeping these separate makes the main logic easier to read.

/**
 * setLoading(true)  — disables the button, shows the spinner, hides label
 * setLoading(false) — re-enables the button, hides the spinner, shows label
 *
 * The `hidden` attribute on an HTML element makes it invisible AND removes
 * it from the layout (unlike display:none in CSS, it's a boolean attribute).
 */
function setLoading(isLoading) {
  analyzeBtnEl.disabled = isLoading;          // prevents double-clicks while fetching

  // Toggle which button content is visible
  btnDefaultContent.hidden = isLoading;       // hide "Analyze with Gemini" text
  btnLoadingContent.hidden = !isLoading;      // show "Analyzing…" + spinner
}

/**
 * showError(message) — displays the error banner with the given text.
 * Called for both client-side validation errors and server errors.
 */
function showError(message) {
  errorMessageEl.textContent = message;  // inject the error text
  errorBannerEl.hidden = false;          // make the banner visible
  resultsSectionEl.hidden = true;        // always hide stale results alongside an error
  // Scroll the error into view smoothly so the user can see it
  errorBannerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * hideError() — hides the error banner.
 * Called at the start of every new analysis attempt.
 */
function hideError() {
  errorBannerEl.hidden = true;
  errorMessageEl.textContent = '';
}


// ─── 3. RENDER HELPERS ──────────────────────────────────────
// Functions that build HTML elements from data.
// We create elements in JavaScript and append them to the DOM.

/**
 * createChip(skillName, type) — builds a <span> chip element.
 *
 * @param {string} skillName — the text to show on the chip
 * @param {string} type      — 'required' | 'matched' | 'missing'
 *                             determines the CSS class and icon
 * @returns {HTMLElement}
 */
function createChip(skillName, type) {
  // document.createElement() creates a new HTML element in memory
  // (not yet in the page — we'll append it separately)
  const chip = document.createElement('span');

  // Add base class + type-specific class for coloring
  chip.className = `chip ${type}`;

  // Map each type to a fitting icon
  const icons = {
    required: '🔷',
    matched:  '✅',
    missing:  '📌',
  };

  chip.textContent = `${icons[type] || ''} ${skillName}`;

  return chip;  // return the element so the caller can append it
}

/**
 * createRecCard(rec, index) — builds a recommendation card element.
 *
 * @param {{ skill, reason, resource }} rec — one recommendation object from the API
 * @param {number} index — used to stagger the animation delay
 * @returns {HTMLElement}
 */
function createRecCard(rec, index) {
  const card = document.createElement('div');
  card.className = 'rec-card';

  // Stagger each card's fade-in by 80ms — creates a cascade effect
  // (e.g. card 0: 0ms, card 1: 80ms, card 2: 160ms...)
  card.style.animationDelay = `${index * 80}ms`;

  // innerHTML lets us write HTML template strings inside a JS function.
  // We use textContent for user-provided data (safe) and hardcode the structure.
  // Here all data comes from Gemini (trusted API), so innerHTML is acceptable.
  card.innerHTML = `
    <span class="rec-skill-name">📌 ${escapeHtml(rec.skill)}</span>
    <p class="rec-reason">${escapeHtml(rec.reason)}</p>
    <div class="rec-resource-wrapper">
      <span class="rec-resource-label">📚 Learn:</span>
      <span class="rec-resource-text">${escapeHtml(rec.resource)}</span>
    </div>
  `;

  return card;
}

/**
 * escapeHtml(text) — prevents XSS by converting special characters to HTML entities.
 * Always sanitize user-provided or AI-provided content before injecting into the DOM.
 *
 * XSS (Cross-Site Scripting): a security vulnerability where malicious JavaScript
 * is injected into a page via unsanitized user input.
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ─── 4. renderResults(data) ──────────────────────────────────
// The main rendering function — called once with the API response.
// Populates all stats, chips, and recommendation cards.
//
// @param {Object} data — the parsed JSON from our Express server:
//   {
//     requiredSkills: string[],
//     matchedSkills:  string[],
//     missingSkills:  string[],
//     recommendations: { skill, reason, resource }[]
//   }
function renderResults(data) {

  // ── Guard: validate the shape of the data ──────────────────
  // If Gemini returned something unexpected, show a clear error
  if (
    !Array.isArray(data.requiredSkills) ||
    !Array.isArray(data.matchedSkills)  ||
    !Array.isArray(data.missingSkills)  ||
    !Array.isArray(data.recommendations)
  ) {
    resultsSectionEl.hidden = true;  // don't reveal results section on bad data
    showError('The AI response was in an unexpected format. Please try again.');
    return;
  }

  // ── Clear any previous results ─────────────────────────────
  // .innerHTML = '' wipes all child elements from the container
  requiredListEl.innerHTML     = '';
  matchedListEl.innerHTML      = '';
  missingListEl.innerHTML      = '';
  recommendationsEl.innerHTML  = '';

  // ── Update stat counters ───────────────────────────────────
  countRequiredEl.textContent  = data.requiredSkills.length;
  countMatchedEl.textContent   = data.matchedSkills.length;
  countMissingEl.textContent   = data.missingSkills.length;

  // ── Render Required Skills chips ──────────────────────────
  // For each skill name in the array, create a chip and append it
  data.requiredSkills.forEach((skill, index) => {
    const chip = createChip(skill, 'required');
    // Stagger animation by 40ms per chip
    chip.style.animationDelay = `${index * 40}ms`;
    requiredListEl.appendChild(chip);  // .appendChild() adds the element to the DOM
  });

  // ── Render Matched Skills chips ───────────────────────────
  if (data.matchedSkills.length === 0) {
    // Show a friendly empty state instead of a blank area
    matchedListEl.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.875rem;">No matching skills found.</p>';
  } else {
    data.matchedSkills.forEach((skill, index) => {
      const chip = createChip(skill, 'matched');
      chip.style.animationDelay = `${index * 40}ms`;
      matchedListEl.appendChild(chip);
    });
  }

  // ── Render Missing Skills chips ───────────────────────────
  if (data.missingSkills.length === 0) {
    missingListEl.innerHTML = '<p style="color: var(--color-success); font-size: 0.875rem;">🎉 You have all required skills!</p>';
  } else {
    data.missingSkills.forEach((skill, index) => {
      const chip = createChip(skill, 'missing');
      chip.style.animationDelay = `${index * 40}ms`;
      missingListEl.appendChild(chip);
    });
  }

  // ── Render Recommendation Cards ───────────────────────────
  if (data.recommendations.length === 0) {
    recommendationsEl.innerHTML = '<p style="color: var(--color-text-muted);">No recommendations — you\'re already a great match!</p>';
  } else {
    data.recommendations.forEach((rec, index) => {
      const card = createRecCard(rec, index);
      recommendationsEl.appendChild(card);
    });
  }

  // ── Reveal the results section ────────────────────────────
  // Removing the `hidden` attribute makes the element visible.
  // The CSS animation `fadeSlideUp` then plays automatically.
  resultsSectionEl.hidden = false;

  // Scroll to the results so the user sees them immediately
  resultsSectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// ─── 5. resetApp() ───────────────────────────────────────────
// Clears the results and returns the page to its initial state.
// Called when the user clicks "Analyze Another Job".
function resetApp() {
  // Hide results and errors
  resultsSectionEl.hidden = true;
  hideError();

  // Clear the text inputs
  jobDescriptionEl.value = '';
  userSkillsEl.value     = '';

  // Scroll back to the top of the page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Put focus on the first textarea so the user can start typing immediately
  jobDescriptionEl.focus();
}


// ─── 6. handleAnalyze() — THE MAIN FUNCTION ──────────────────
// Orchestrates: validate → fetch (with retry) → render.
//
// RETRY STRATEGY
// Temporary Gemini errors (503, 429, network failures) are retried
// up to MAX_ATTEMPTS times with exponential backoff + jitter.
// Permanent errors (401, 403, 404, 400) are shown immediately.
//
// The server tags retryable responses with { retryable: true }.

/** Total number of attempts before giving up (1 original + 2 retries). */
const MAX_ATTEMPTS = 3;

/**
 * Pauses execution for `ms` milliseconds.
 * `await sleep(1000)` = wait 1 second without blocking the browser.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns the wait time (ms) before the given attempt number.
 * Attempt 2 → ~1 000 ms, Attempt 3 → ~2 000 ms.
 * Up to 400 ms of random jitter is added to avoid hammering the API
 * in sync with other clients (thundering-herd prevention).
 *
 * @param {number} attempt — upcoming attempt number (2 or 3)
 */
function retryDelay(attempt) {
  const base   = Math.pow(2, attempt - 2) * 1000; // 1 000, 2 000, …
  const jitter = Math.floor(Math.random() * 400);  // 0–399 ms extra
  return base + jitter;
}

/**
 * Updates the visible text inside the loading button.
 * The spinner element is left untouched.
 * @param {string} text
 */
function setLoadingText(text) {
  btnLoadingTextEl.textContent = text;
}

/**
 * Guard: set to true while a request is in-flight.
 * Prevents a second click from launching a parallel fetch.
 */
let isAnalyzing = false;

async function handleAnalyze() {

  // ── Duplicate-submission guard ────────────────────────────
  // If a request is already running, ignore this click entirely.
  if (isAnalyzing) return;

  // ── Read and trim inputs ──────────────────────────────────
  const jobDescription = jobDescriptionEl.value.trim();
  const userSkills     = userSkillsEl.value.trim();

  // ── Client-side validation ────────────────────────────────
  // Instant feedback without a server round-trip.
  // The server also validates — never trust the client alone.
  hideError();

  if (!jobDescription) {
    showError('Please paste a job description before analyzing.');
    jobDescriptionEl.focus();
    return;
  }
  if (jobDescription.length < 50) {
    showError('The job description seems too short. Please paste the full posting.');
    jobDescriptionEl.focus();
    return;
  }
  if (!userSkills) {
    showError('Please enter your technical skills.');
    userSkillsEl.focus();
    return;
  }

  // Hide any previous results before starting a new analysis
  resultsSectionEl.hidden = true;

  // ── Enter loading state ───────────────────────────────────
  isAnalyzing = true;
  setLoading(true);
  setLoadingText('Analyzing…');  // reset to default text on every run

  // Tracks the last error message so we can surface it if all retries fail.
  let lastErrorMessage = 'Gemini is temporarily unavailable. Please try again in a minute.';

  try {
    // ── Retry loop ────────────────────────────────────────────
    // attempt counts from 1 to MAX_ATTEMPTS.
    // We `continue` the loop on retryable errors and `return` on success or
    // permanent failure — so the code after the loop is a true "all failed" path.
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

      // ── Pre-attempt delay (skip for the first attempt) ──────
      if (attempt > 1) {
        const delay = retryDelay(attempt);  // ~1 000 ms, ~2 000 ms
        setLoadingText(`Gemini is busy. Retrying… (${attempt}/${MAX_ATTEMPTS})`);
        await sleep(delay);
      }

      // ── Send the request ─────────────────────────────────────
      // _attempt is passed in the body so the server can log which
      // attempt it is receiving without the client needing to know
      // any internal server details.
      let response, data;
      try {
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobDescription, userSkills, _attempt: attempt }),
        });
        // Always parse JSON — errors also arrive as JSON from our server.
        data = await response.json();
      } catch (networkError) {
        // fetch() itself threw: server is down, or connection dropped mid-flight.
        console.error(`[Attempt ${attempt}/${MAX_ATTEMPTS}] Network error:`, networkError.message);
        lastErrorMessage = 'Could not reach the server. Please check your connection and try again.';
        if (attempt < MAX_ATTEMPTS) continue;  // retry on next iteration
        showError(lastErrorMessage);
        return;
      }

      // ── Success ───────────────────────────────────────────────
      if (response.ok) {
        renderResults(data);
        return;  // done — exit handleAnalyze
      }

      // ── Error response from server ────────────────────────────
      // The server sets data.retryable = true for temporary errors (503, 429,
      // network failures) and omits it for permanent ones (400, 401, 403, 404).
      lastErrorMessage = data.error || 'An unexpected error occurred. Please try again.';
      const isRetryable = data.retryable === true;

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        // Either a permanent error, or we've used all our attempts.
        showError(lastErrorMessage);
        return;
      }

      // Temporary error with retries remaining — log and loop.
      console.warn(`[Attempt ${attempt}/${MAX_ATTEMPTS}] Retryable error — will retry:`, lastErrorMessage);
    }

    // ── All attempts exhausted ────────────────────────────────
    // Reached only if the loop exits normally (which cannot happen due to the
    // returns above, but serves as a defensive fallback).
    showError(
      `Gemini is temporarily unavailable after ${MAX_ATTEMPTS} attempts. ` +
      'Please wait a minute and try again.'
    );

  } finally {
    // ── Always clean up ───────────────────────────────────────
    // `finally` runs on every exit path — return, throw, or loop completion.
    setLoading(false);
    setLoadingText('Analyzing…');  // restore default text for next use
    isAnalyzing = false;
  }
}


// ─── 7. EVENT LISTENERS ─────────────────────────────────────
// Event listeners watch for user actions and call our functions.
// .addEventListener(eventType, callbackFunction)

// "click" on the Analyze button → run handleAnalyze
analyzeBtnEl.addEventListener('click', handleAnalyze);

// "click" on the Reset button → run resetApp
resetBtnEl.addEventListener('click', resetApp);

// Allow pressing Enter (with Ctrl/Cmd) inside the textareas to trigger analysis.
// This is a quality-of-life shortcut — not required, but very useful.
document.addEventListener('keydown', (event) => {
  // Check: was Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac) pressed?
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    // Only trigger if the analyze button is not already in a loading state
    if (!analyzeBtnEl.disabled) {
      handleAnalyze();
    }
  }
});

// ─── CONSOLE LOG — useful for debugging ─────────────────────
// Open browser DevTools (F12 → Console) to see this message.
console.log('✅ AI Job Analyzer script loaded. Press Ctrl+Enter to analyze.');
