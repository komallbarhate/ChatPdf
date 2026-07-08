/* ═══ AI Notebook — Auto-save & searchable notes ═══ */

const NB_KEY = 'chatpdf_notebook';

function loadNotes() {
  try { return JSON.parse(localStorage.getItem(NB_KEY) || '[]'); }
  catch { return []; }
}

function saveNotes(notes) {
  localStorage.setItem(NB_KEY, JSON.stringify(notes));
}

function saveToNotebook(question, answer, docName) {
  const notes = loadNotes();
  // Extract key concepts (first 300 chars of answer)
  const summary = answer.replace(/#+\s/g, '').replace(/\*+/g, '').replace(/\n+/g, ' ').trim().slice(0, 300);
  notes.unshift({
    id: Date.now(),
    type: detectNoteType(question),
    question: question.slice(0, 120),
    content: summary + (summary.length >= 300 ? '…' : ''),
    doc: docName.replace(/\.pdf$/i, ''),
    time: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
  });
  // Keep last 100 notes
  saveNotes(notes.slice(0, 100));
  // Re-render if notebook tab active
  if (document.getElementById('tab-notebook')?.classList.contains('active')) renderNotebook();
}

function detectNoteType(q) {
  const l = q.toLowerCase();
  if (l.includes('summar')) return 'Summary';
  if (l.includes('mcq')||l.includes('question')||l.includes('quiz')) return 'Quiz';
  if (l.includes('explain')||l.includes('what is')||l.includes('define')) return 'Definition';
  if (l.includes('chapter')||l.includes('section')) return 'Chapter Notes';
  if (l.includes('key point')||l.includes('important')||l.includes('main')) return 'Key Points';
  if (l.includes('compare')||l.includes('difference')||l.includes('vs')) return 'Comparison';
  return 'Note';
}

function renderNotebook(query = '') {
  let notes = loadNotes();
  if (query) {
    const q = query.toLowerCase();
    notes = notes.filter(n => n.question.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.doc.toLowerCase().includes(q));
  }
  const container = document.getElementById('notebookContent');
  if (!notes.length) {
    container.innerHTML = `<div class="feature-empty"><div class="feature-empty-icon">📒</div><p>${query ? 'No notes match your search.' : 'Notes are automatically saved from your chat answers.<br/>Ask questions to populate your notebook.'}</p></div>`;
    return;
  }
  container.innerHTML = notes.map(n => `
    <div class="note-card" id="note-${n.id}">
      <div class="note-header">
        <span class="note-type">${esc(n.type)}</span>
        <span class="note-time">${esc(n.time)}</span>
      </div>
      <div class="note-doc">📄 ${esc(n.doc)}</div>
      <div class="note-text"><strong>${esc(n.question)}</strong><br/>${esc(n.content)}</div>
      <button class="note-delete" onclick="deleteNote(${n.id})" title="Delete">✕</button>
    </div>`).join('');
}

function deleteNote(id) {
  const notes = loadNotes().filter(n => n.id !== id);
  saveNotes(notes);
  renderNotebook(document.getElementById('notebookSearch')?.value || '');
}

function searchNotebook() {
  const q = document.getElementById('notebookSearch')?.value || '';
  renderNotebook(q);
}

function clearNotebook() {
  if (!confirm('Clear all notes?')) return;
  saveNotes([]);
  renderNotebook();
}

function addNoteManually() {
  const text = prompt('Enter a note:');
  if (!text?.trim()) return;
  const notes = loadNotes();
  notes.unshift({ id: Date.now(), type: 'Manual', question: 'Manual note', content: text, doc: 'Manual', time: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) });
  saveNotes(notes);
  renderNotebook();
}

// Render notebook when tab is clicked
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-tab="notebook"]')?.addEventListener('click', () => renderNotebook());
});

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
