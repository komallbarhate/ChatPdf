/* ═══ Study Mode — Flashcards, MCQs, Fill Blanks, Viva ═══ */

/* Entry point called from app.js with actual data */
function renderStudyMode(data, tab) {
  if (!data) return;
  const t = tab || 'flashcards';
  const diff = document.getElementById('difficultyFilter')?.value || 'all';
  const filter = items => (diff === 'all' ? items : items.filter(x => x.difficulty === diff)) || [];
  const container = document.getElementById('studyContent');
  if (!container) return;

  if (t === 'flashcards')   renderFlashcards(filter(data.flashcards || []), container);
  else if (t === 'mcqs')    renderMCQs(filter(data.mcqs || []), container);
  else if (t === 'fill_blanks') renderFillBlanks(filter(data.fill_blanks || []), container);
  else if (t === 'viva')    renderViva(filter(data.viva_questions || []), container);
}

/* ── Flashcards ── */
function renderFlashcards(cards, container) {
  if (!cards.length) { container.innerHTML = emptyMsg('No flashcards at this difficulty.'); return; }
  container.innerHTML = `
    <p class="study-tip">Click any card to reveal the answer</p>
    <div class="flashcard-grid">
      ${cards.map((c, i) => `
        <div class="flashcard" onclick="this.classList.toggle('flipped')">
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <div class="card-label">Question</div>
              <div class="card-text">${esc(c.front)}</div>
              <div class="card-footer"><span class="diff-badge diff-${c.difficulty}">${cap(c.difficulty)}</span><span class="card-flip-hint">Tap to flip →</span></div>
            </div>
            <div class="flashcard-back">
              <div class="card-label">Answer</div>
              <div class="card-text">${esc(c.back)}</div>
              <div class="card-footer"><span class="diff-badge diff-${c.difficulty} inv">${cap(c.difficulty)}</span></div>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

/* ── MCQs ── */
function renderMCQs(mcqs, container) {
  if (!mcqs.length) { container.innerHTML = emptyMsg('No MCQs at this difficulty.'); return; }
  container.innerHTML = mcqs.map((q, qi) => `
    <div class="mcq-card" id="mcq-${qi}">
      <div class="mcq-header">
        <span class="mcq-num">Q${qi + 1}</span>
        <span class="diff-badge diff-${q.difficulty}">${cap(q.difficulty)}</span>
      </div>
      <div class="mcq-question">${esc(q.question)}</div>
      <div class="mcq-options">
        ${Object.entries(q.options).map(([k, v]) => `
          <button class="mcq-option" onclick="answerMCQ(${qi},'${k}','${q.answer}')" id="mcq-${qi}-${k}">
            <span class="mcq-opt-key">${k}</span>
            <span class="mcq-opt-val">${esc(v)}</span>
          </button>`).join('')}
      </div>
      <div class="mcq-explanation" id="mcq-exp-${qi}">
        <strong>Explanation:</strong> ${esc(q.explanation)}
      </div>
    </div>`).join('');
}

function answerMCQ(qi, selected, correct) {
  const alreadyDone = document.querySelector(`#mcq-${qi} .mcq-option.correct, #mcq-${qi} .mcq-option.wrong`);
  if (alreadyDone) return;
  document.querySelectorAll(`#mcq-${qi} .mcq-option`).forEach(btn => btn.disabled = true);
  const correctEl = document.getElementById(`mcq-${qi}-${correct}`);
  if (correctEl) correctEl.classList.add('correct');
  if (selected !== correct) {
    const wrongEl = document.getElementById(`mcq-${qi}-${selected}`);
    if (wrongEl) wrongEl.classList.add('wrong');
  }
  const exp = document.getElementById(`mcq-exp-${qi}`);
  if (exp) exp.classList.add('show');
}

/* ── Fill Blanks ── */
function renderFillBlanks(items, container) {
  if (!items.length) { container.innerHTML = emptyMsg('No fill-in-the-blank items at this difficulty.'); return; }
  container.innerHTML = `
    <p class="study-tip">Click on each blank to reveal the answer</p>
    ${items.map((item, i) => {
      let si = 0;
      const answers = item.answers || [];
      const sentence = esc(item.sentence).replace(/_{2,}/g, () => {
        const ans = answers[si] || '???';
        const idx = si++;
        return `<span class="fill-blank" onclick="revealBlank(this,'${esc(ans)}')" title="Click to reveal">________</span>`;
      });
      return `
        <div class="fill-card">
          <div class="fill-sentence">${sentence}</div>
          <span class="diff-badge diff-${item.difficulty}">${cap(item.difficulty)}</span>
        </div>`;
    }).join('')}`;
}

function revealBlank(el, answer) {
  el.textContent = answer;
  el.classList.add('revealed');
  el.style.cursor = 'default';
}

/* ── Viva Questions ── */
function renderViva(qs, container) {
  if (!qs.length) { container.innerHTML = emptyMsg('No viva questions at this difficulty.'); return; }
  container.innerHTML = `
    <p class="study-tip">Click a question to reveal key answer points</p>
    ${qs.map((q, i) => `
      <div class="viva-card">
        <div class="viva-question" onclick="toggleViva(${i})">
          <span><strong>Q${i + 1}.</strong> ${esc(q.question)}</span>
          <div class="viva-right">
            <span class="diff-badge diff-${q.difficulty}">${cap(q.difficulty)}</span>
            <span class="viva-toggle" id="vtog-${i}">+</span>
          </div>
        </div>
        <div class="viva-points" id="viva-${i}">
          ${(q.key_points || []).map(p => `<div class="viva-point">• ${esc(p)}</div>`).join('')}
        </div>
      </div>`).join('')}`;
}

function toggleViva(i) {
  const el = document.getElementById(`viva-${i}`);
  const tog = document.getElementById(`vtog-${i}`);
  if (!el) return;
  const open = el.classList.toggle('show');
  if (tog) tog.textContent = open ? '−' : '+';
}

/* ── Helpers ── */
function emptyMsg(msg) {
  return `<div class="feature-empty"><div class="feature-empty-icon">📭</div><p>${msg}</p></div>`;
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
