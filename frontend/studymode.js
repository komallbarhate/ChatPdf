/* ═══ Study Mode — Flashcards, MCQs, Fill Blanks, Viva ═══ */

function renderStudyTab(tab) {
  const data = window.state?.studyData;
  if (!data) return;
  const diff = document.getElementById('difficultyFilter')?.value || 'all';
  const filter = items => diff === 'all' ? items : items.filter(x => x.difficulty === diff);
  const container = document.getElementById('studyContent');

  if (tab === 'flashcards') renderFlashcards(filter(data.flashcards || []), container);
  else if (tab === 'mcqs')   renderMCQs(filter(data.mcqs || []), container);
  else if (tab === 'fill_blanks') renderFillBlanks(filter(data.fill_blanks || []), container);
  else if (tab === 'viva')   renderViva(filter(data.viva_questions || []), container);
}

function renderFlashcards(cards, container) {
  if (!cards.length) { container.innerHTML = empty('No flashcards', diff => `No ${diff} flashcards found.`); return; }
  container.innerHTML = `<div class="flashcard-grid">${cards.map((c,i) => `
    <div class="flashcard" id="fc-${i}" onclick="this.classList.toggle('flipped')">
      <div class="flashcard-inner">
        <div class="flashcard-front">
          <div class="card-label">Question</div>
          <div class="card-text">${esc(c.front)}</div>
          <span class="diff-badge diff-${c.difficulty}">${c.difficulty}</span>
        </div>
        <div class="flashcard-back">
          <div class="card-label">Answer</div>
          <div class="card-text">${esc(c.back)}</div>
        </div>
      </div>
    </div>`).join('')}</div>
    <p style="text-align:center;color:var(--txt-m);font-size:11px;margin-top:16px;">Click any card to flip it</p>`;
}

function renderMCQs(mcqs, container) {
  if (!mcqs.length) { container.innerHTML = empty('No MCQs'); return; }
  container.innerHTML = mcqs.map((q, qi) => `
    <div class="mcq-card" id="mcq-${qi}">
      <div class="mcq-question"><span style="color:var(--red);font-weight:700;">Q${qi+1}.</span> ${esc(q.question)} <span class="diff-badge diff-${q.difficulty}" style="float:right">${q.difficulty}</span></div>
      <div class="mcq-options">
        ${Object.entries(q.options).map(([k,v]) => `
          <button class="mcq-option" onclick="answerMCQ(${qi},'${k}','${q.answer}')" id="mcq-${qi}-${k}">
            <strong>${k}.</strong> ${esc(v)}
          </button>`).join('')}
      </div>
      <div class="mcq-explanation" id="mcq-exp-${qi}"><strong>Explanation:</strong> ${esc(q.explanation)}</div>
    </div>`).join('');
}

function answerMCQ(qi, selected, correct) {
  const answered = document.querySelector(`#mcq-${qi} .mcq-option.correct, #mcq-${qi} .mcq-option.wrong`);
  if (answered) return;
  document.querySelectorAll(`#mcq-${qi} .mcq-option`).forEach(btn => { btn.disabled = true; });
  document.getElementById(`mcq-${qi}-${correct}`).classList.add('correct');
  if (selected !== correct) document.getElementById(`mcq-${qi}-${selected}`).classList.add('wrong');
  const exp = document.getElementById(`mcq-exp-${qi}`); if (exp) exp.classList.add('show');
}

function renderFillBlanks(items, container) {
  if (!items.length) { container.innerHTML = empty('No fill-in-the-blank items'); return; }
  container.innerHTML = items.map((item, i) => {
    let si = 0;
    const sentence = esc(item.sentence).replace(/_+/g, () => {
      const ans = item.answers?.[si++] || '???';
      return `<span class="fill-blank" id="fb-${i}-${si-1}" onclick="revealBlank(${i},${si-1},'${esc(ans)}')">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`;
    });
    return `<div class="fill-card">
      <div class="fill-sentence">${sentence}</div>
      <span class="diff-badge diff-${item.difficulty}">${item.difficulty}</span>
    </div>`;
  }).join('');
}

function revealBlank(i, j, answer) {
  const el = document.getElementById(`fb-${i}-${j}`);
  if (el) { el.textContent = answer; el.classList.add('revealed'); }
}

function renderViva(qs, container) {
  if (!qs.length) { container.innerHTML = empty('No viva questions'); return; }
  container.innerHTML = qs.map((q, i) => `
    <div class="viva-card">
      <div class="viva-question" onclick="toggleViva(${i})">
        <span><strong>Q${i+1}.</strong> ${esc(q.question)} <span class="diff-badge diff-${q.difficulty}">${q.difficulty}</span></span>
        <span class="viva-toggle" id="vtog-${i}">+</span>
      </div>
      <div class="viva-points" id="viva-${i}">
        ${(q.key_points||[]).map(p => `<div class="viva-point">${esc(p)}</div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleViva(i) {
  const el = document.getElementById(`viva-${i}`);
  const tog = document.getElementById(`vtog-${i}`);
  if (el) { el.classList.toggle('show'); if (tog) tog.textContent = el.classList.contains('show') ? '−' : '+'; }
}

function empty(msg) { return `<div class="feature-empty"><div class="feature-empty-icon">📭</div><p>${msg} available at selected difficulty.</p></div>`; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
