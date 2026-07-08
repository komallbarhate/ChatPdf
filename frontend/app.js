/* ═══ ChatPDF Advanced — Core App Logic ═══ */
const API = '';
let state = {
  activeDocId: null,
  activeTab: 'chat',
  documents: {},
  chatHistories: {},
  crossHistory: [],
  isTyping: false,
  currentStudyTab: 'flashcards',
};
window._appState = state; // expose for cross-module access

const $ = id => document.getElementById(id);
const DOM = {
  uploadZone:        $('uploadZone'),
  fileInput:         $('fileInput'),
  uploadProgress:    $('uploadProgress'),
  progressFill:      $('progressFill'),
  progressLabel:     $('progressLabel'),
  docList:           $('docList'),
  docCount:          $('docCount'),
  crossDocBar:       $('crossDocBar'),
  welcomeScreen:     $('welcomeScreen'),
  docPanel:          $('docPanel'),
  crossDocPanel:     $('crossDocPanel'),
  messages:          $('messages'),
  messagesContainer: $('messagesContainer'),
  docHeaderName:     $('docHeaderName'),
  docHeaderMeta:     $('docHeaderMeta'),
  chatInput:         $('chatInput'),
  sendBtn:           $('sendBtn'),
  toastContainer:    $('toastContainer'),
  btnNewChat:        $('btnNewChat'),
  crossInput:        $('crossInput'),
  crossMsgList:      $('crossMsgList'),
  featureLoader:     $('featureLoader'),
  loaderText:        $('loaderText'),
};

// ── Init ──────────────────────────────────
async function init() {
  await loadDocuments();
  bindEvents();
}

async function loadDocuments() {
  try {
    const res = await fetch(`${API}/api/documents`);
    const data = await res.json();
    state.documents = {};
    data.documents.forEach(d => { state.documents[d.doc_id] = d; });
    renderDocList();
  } catch { console.error('Failed to load documents'); }
}

// ── Events ────────────────────────────────
function bindEvents() {
  DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
  DOM.fileInput.addEventListener('change', e => {
    [...e.target.files].forEach(f => handleFileSelect(f));
  });
  DOM.uploadZone.addEventListener('dragover', e => { e.preventDefault(); DOM.uploadZone.classList.add('dragover'); });
  DOM.uploadZone.addEventListener('dragleave', () => DOM.uploadZone.classList.remove('dragover'));
  DOM.uploadZone.addEventListener('drop', e => {
    e.preventDefault(); DOM.uploadZone.classList.remove('dragover');
    [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.pdf')).forEach(handleFileSelect);
  });
  DOM.chatInput.addEventListener('input', () => { autoResize(DOM.chatInput); DOM.sendBtn.disabled = !DOM.chatInput.value.trim(); });
  DOM.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  DOM.sendBtn.addEventListener('click', sendMessage);
  DOM.crossInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCrossChat(); } });
  DOM.btnNewChat.addEventListener('click', () => {
    if (state.activeDocId) { state.chatHistories[state.activeDocId] = []; DOM.messages.innerHTML = ''; showWelcomeMsg(); }
  });
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => { DOM.chatInput.value = chip.dataset.prompt; DOM.sendBtn.disabled = false; sendMessage(); });
  });
}

// ── Upload ────────────────────────────────
async function handleFileSelect(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
  showProgress(true, 'Extracting text...');
  animateProg(20, 100);
  const fd = new FormData(); fd.append('file', file);
  try {
    animateProg(50, 400);
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    animateProg(100, 200);
    setTimeout(() => showProgress(false), 600);
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    state.documents[data.doc_id] = data;
    renderDocList();
    openDocument(data.doc_id);
    showToast(`Indexed ${data.num_chunks} chunks from ${data.num_pages} pages`, 'success');
    DOM.fileInput.value = '';
  } catch (err) { showProgress(false); showToast(err.message, 'error', 5000); }
}

function showProgress(v, lbl='') {
  DOM.uploadProgress.style.display = v ? 'block' : 'none';
  if (lbl) DOM.progressLabel.textContent = lbl;
  if (!v) DOM.progressFill.style.width = '0%';
}
function animateProg(t, d) { setTimeout(() => { DOM.progressFill.style.width = `${t}%`; }, d); }

// ── Document List ─────────────────────────
function renderDocList() {
  const docs = Object.values(state.documents);
  DOM.docCount.textContent = docs.length;
  DOM.crossDocBar.style.display = docs.length > 1 ? 'block' : 'none';
  if (!docs.length) {
    DOM.docList.innerHTML = `<div class="empty-docs"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity="0.25"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/></svg><p>No documents yet</p></div>`;
    return;
  }
  DOM.docList.innerHTML = docs.map(doc => `
    <div class="doc-item ${doc.doc_id === state.activeDocId ? 'active' : ''}" id="di-${doc.doc_id}" onclick="openDocument('${doc.doc_id}')">
      <div class="doc-thumb">${docEmoji(doc.filename)}</div>
      <div class="doc-info">
        <div class="doc-name" title="${esc(doc.filename)}">${esc(trimName(doc.filename))}</div>
        <div class="doc-meta">${doc.num_pages} pages · ${doc.file_size_kb} KB</div>
      </div>
      <button class="doc-delete" title="Remove" onclick="deleteDoc(event,'${doc.doc_id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19,6l-1,14H6L5,6" stroke="currentColor" stroke-width="2"/><path d="M10,11v6M14,11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

function docEmoji(fn) {
  const n = fn.toLowerCase();
  if (n.includes('research')||n.includes('paper')||n.includes('journal')) return '🔬';
  if (n.includes('note')||n.includes('lecture')) return '📓';
  if (n.includes('sop')||n.includes('policy')||n.includes('manual')) return '📊';
  if (n.includes('book')) return '📕';
  return '📄';
}
function trimName(fn) { const n = fn.replace(/\.pdf$/i,''); return n.length > 26 ? n.slice(0,24)+'…' : n; }

// ── Open Document ─────────────────────────
function openDocument(docId) {
  const doc = state.documents[docId];
  if (!doc) return;
  state.activeDocId = docId;
  document.querySelectorAll('.doc-item').forEach(e => e.classList.remove('active'));
  const el = $(`di-${docId}`); if (el) el.classList.add('active');
  DOM.welcomeScreen.style.display = 'none';
  DOM.crossDocPanel.style.display = 'none';
  DOM.docPanel.style.display = 'flex';
  DOM.docHeaderName.textContent = doc.filename.replace(/\.pdf$/i,'');
  DOM.docHeaderMeta.textContent = `${doc.num_pages} pages`;
  if (!state.chatHistories[docId]) state.chatHistories[docId] = [];
  renderMessages(state.chatHistories[docId]);
  if (!state.chatHistories[docId].length) showWelcomeMsg(doc);
  switchTab('chat', document.querySelector('.tab-btn[data-tab="chat"]'));
  DOM.chatInput.focus();
}

async function deleteDoc(e, docId) {
  e.stopPropagation();
  const res = await fetch(`${API}/api/documents/${docId}`, { method: 'DELETE' });
  if (!res.ok) return showToast('Failed to remove', 'error');
  delete state.documents[docId];
  delete state.chatHistories[docId];
  if (state.activeDocId === docId) {
    state.activeDocId = null;
    DOM.welcomeScreen.style.display = '';
    DOM.docPanel.style.display = 'none';
  }
  renderDocList();
  showToast('Document removed', 'info');
}

// ── Tabs ──────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = $(`tab-${tab}`); if (el) el.classList.add('active');
  state.activeTab = tab;
}

// ── Chat ──────────────────────────────────
async function sendMessage() {
  const q = DOM.chatInput.value.trim();
  if (!q || state.isTyping || !state.activeDocId) return;
  const msg = { role: 'user', content: q, sources: [], citations: [] };
  pushMsg(state.activeDocId, msg); appendMsg(msg);
  DOM.chatInput.value = ''; DOM.sendBtn.disabled = true; autoResize(DOM.chatInput);
  state.isTyping = true;
  const typing = showTyping(DOM.messages);
  try {
    const res = await fetch(`${API}/api/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({doc_id:state.activeDocId, question:q}) });
    const data = await res.json();
    typing.remove(); state.isTyping = false;
    if (!res.ok) throw new Error(data.detail||'Error');
    const ai = { role:'ai', content:data.answer, sources:data.sources||[], citations:data.citations||[] };
    pushMsg(state.activeDocId, ai); appendMsg(ai);
    // Auto-save to notebook
    saveToNotebook(q, data.answer, state.documents[state.activeDocId]?.filename || '');
  } catch(err) {
    typing.remove(); state.isTyping = false;
    const em = { role:'ai', content:`Error: ${err.message}`, sources:[], citations:[] };
    pushMsg(state.activeDocId, em); appendMsg(em);
  }
  scrollBottom();
}

function showWelcomeMsg(doc) {
  const m = { role:'ai', citations:[], sources:[],
    content: doc
      ? `Hi! I've processed **${doc.filename}** (${doc.num_pages} pages).\n\nUse the tabs above to:\n- 💬 **Chat** — Ask any question\n- 🎓 **Study** — Flashcards, MCQs, Viva\n- 🕸️ **Graph** — Knowledge graph\n- 🗺️ **Mind Map** — Visual mind map\n- 📅 **Timeline** — Extract events\n- 📒 **Notebook** — Auto-saved notes`
      : 'Start a new conversation!' };
  appendMsg(m);
}

function pushMsg(docId, msg) {
  if (!state.chatHistories[docId]) state.chatHistories[docId] = [];
  state.chatHistories[docId].push(msg);
}

function renderMessages(hist) { DOM.messages.innerHTML = ''; hist.forEach(m => appendMsg(m)); }

function appendMsg(msg, container) {
  const wrap = container || DOM.messages;
  const div = document.createElement('div');
  div.className = `message ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`;
  const citHtml = (msg.citations && msg.citations.length)
    ? `<div class="citations-bar">
        <div class="citations-label">📚 Sources from document</div>
        ${msg.citations.slice(0,5).map(c=>`
          <div class="citation-item">
            <div class="citation-header">
              <span class="citation-file">📄 ${esc(c.filename ? c.filename.replace(/\.pdf$/i,'') : 'Document')}</span>
              <span class="citation-page">Page ${c.page}</span>
            </div>
            <div class="citation-snippet">"${esc((c.snippet||'').slice(0,280).replace(/\n/g,' '))}…"</div>
          </div>`).join('')}
       </div>` : '';
  div.innerHTML = `
    ${msg.role==='user' ? `<div class="avatar user-avatar">U</div>` : `<div class="avatar ai-avatar">✦</div>`}
    <div class="bubble md-content">${renderMD(msg.content)}${citHtml}</div>`;
  wrap.appendChild(div);
  scrollBottom();
}

function showTyping(container) {
  const div = document.createElement('div');
  div.className = 'message ai-msg';
  div.innerHTML = `<div class="avatar ai-avatar">✦</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
  container.appendChild(div); scrollBottom(); return div;
}
function scrollBottom() { setTimeout(() => { DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight; }, 50); }

// ── Cross-Document Chat ───────────────────
function openCrossDoc() {
  state.activeDocId = null;
  DOM.welcomeScreen.style.display = 'none';
  DOM.docPanel.style.display = 'none';
  DOM.crossDocPanel.style.display = 'flex';
  $('crossDocCount').textContent = Object.keys(state.documents).length;
  document.querySelectorAll('.doc-item').forEach(e => e.classList.remove('active'));
  renderMessages(state.crossHistory);
  DOM.crossInput.focus();
}

function closeCrossDoc() {
  DOM.crossDocPanel.style.display = 'none';
  if (state.activeDocId) openDocument(state.activeDocId);
  else DOM.welcomeScreen.style.display = '';
}

async function sendCrossChat() {
  const q = DOM.crossInput.value.trim(); if (!q) return;
  const msg = { role:'user', content:q, sources:[], citations:[] };
  state.crossHistory.push(msg); appendMsg(msg, DOM.crossMsgList);
  DOM.crossInput.value = '';
  const typing = showTyping(DOM.crossMsgList);
  try {
    const res = await fetch(`${API}/api/chat-multi`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:q}) });
    const data = await res.json();
    typing.remove();
    const ai = { role:'ai', content:data.answer, sources:data.sources||[], citations:data.citations||[] };
    state.crossHistory.push(ai); appendMsg(ai, DOM.crossMsgList);
  } catch(err) {
    typing.remove();
    appendMsg({ role:'ai', content:`Error: ${err.message}`, sources:[], citations:[] }, DOM.crossMsgList);
  }
}

function sendCrossQuery(btn) { DOM.crossInput.value = btn.dataset.prompt; sendCrossChat(); }

// ── Feature generators (called from HTML) ─
async function generateGraph() {
  if (!state.activeDocId) return;
  showLoader('Extracting entities and relationships...');
  try {
    const res = await fetch(`${API}/api/knowledge-graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({doc_id:state.activeDocId}) });
    const data = await res.json();
    hideLoader();
    if (data.error) return showToast('Graph generation failed: '+data.error, 'error');
    renderKnowledgeGraph(data);
    $('graphLegend').style.display = 'flex';
    $('graphHint').style.display = 'inline';
  } catch(e) { hideLoader(); showToast('Error: '+e.message,'error'); }
}

async function generateMap() {
  if (!state.activeDocId) return;
  showLoader('Generating mind map...');
  try {
    const res = await fetch(`${API}/api/mind-map`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({doc_id:state.activeDocId}) });
    const data = await res.json();
    hideLoader();
    if (data.error) return showToast('Mind map failed: '+data.error, 'error');
    renderMindMap(data);
    $('mapHint').style.display = 'inline';
    $('btnResetMap').style.display = 'inline-flex';
  } catch(e) { hideLoader(); showToast('Error: '+e.message,'error'); }
}

async function generateTimeline() {
  if (!state.activeDocId) return;
  showLoader('Extracting events and dates...');
  try {
    const res = await fetch(`${API}/api/timeline`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({doc_id:state.activeDocId}) });
    const data = await res.json();
    hideLoader();
    if (data.error) return showToast('Timeline failed: '+data.error, 'error');
    renderTimeline(data);
  } catch(e) { hideLoader(); showToast('Error: '+e.message,'error'); }
}

async function generateStudy() {
  if (!state.activeDocId) return;
  showLoader('Generating study materials — this may take ~30s...');
  try {
    const res = await fetch(`${API}/api/study-mode`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({doc_id:state.activeDocId}) });
    const data = await res.json();
    hideLoader();
    if (data.error) return showToast('Study gen failed: '+data.error, 'error');
    window._appState.studyData = data;
    renderStudyMode(data, state.currentStudyTab);
    showToast('Study materials ready!', 'success');
  } catch(e) { hideLoader(); showToast('Error: '+e.message,'error'); }
}

function switchStudyTab(tab, btn) {
  document.querySelectorAll('.study-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  state.currentStudyTab = tab;
  window._appState.currentStudyTab = tab;
  if (window._appState.studyData) renderStudyMode(window._appState.studyData, tab);
}

function filterByDifficulty() {
  if (window._appState?.studyData) renderStudyMode(window._appState.studyData, window._appState.currentStudyTab || 'flashcards');
}

// ── Loader helpers ────────────────────────
function showLoader(txt) { DOM.loaderText.textContent = txt; DOM.featureLoader.style.display = 'grid'; }
function hideLoader() { DOM.featureLoader.style.display = 'none'; }

// ── Markdown ──────────────────────────────
function renderMD(text) {
  if (!text) return '';
  let h = esc(text);
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.*?)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
  h = h.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
  h = h.replace(/^# (.*?)$/gm, '<h2>$1</h2>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/^(\s*[-*+] .+(?:\n\s*[-*+] .+)*)/gm, m => {
    const items = m.split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^\s*[-*+] /, '').trim()}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  h = h.replace(/^(\s*\d+\. .+(?:\n\s*\d+\. .+)*)/gm, m => {
    const items = m.split('\n').filter(l=>l.trim()).map(l=>`<li>${l.replace(/^\s*\d+\. /, '').trim()}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  h = h.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  h = `<p>${h}</p>`;
  h = h.replace(/<p><\/p>/g,'').replace(/<p>(<h[234]>)/g,'$1').replace(/(<\/h[234]>)<\/p>/g,'$1');
  h = h.replace(/<p>(<ul>|<ol>|<hr>)/g,'$1').replace(/(<\/ul>|<\/ol>|<hr>)<\/p>/g,'$1');
  return h;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function autoResize(ta) { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,140)+'px'; }

// ── Toast ─────────────────────────────────
function showToast(msg, type='info', dur=3500) {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300); }, dur);
}

document.addEventListener('DOMContentLoaded', init);
