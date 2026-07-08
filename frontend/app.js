/* ═══════════════════════════════════════════
   ChatPDF — Frontend Application Logic
   ═══════════════════════════════════════════ */

const API = '';   // same origin

// ─── State ───────────────────────────────────
let state = {
  activeDocId: null,
  documents: {},          // docId → meta
  chatHistories: {},      // docId → [{role, content, sources}]
  isTyping: false,
};

// ─── DOM Refs ─────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  uploadZone:       $('uploadZone'),
  fileInput:        $('fileInput'),
  uploadProgress:   $('uploadProgress'),
  progressFill:     $('progressFill'),
  progressLabel:    $('progressLabel'),
  docList:          $('docList'),
  docCount:         $('docCount'),
  welcomeScreen:    $('welcomeScreen'),
  chatScreen:       $('chatScreen'),
  messages:         $('messages'),
  messagesContainer:$('messagesContainer'),
  chatDocName:      $('chatDocName'),
  chatDocMeta:      $('chatDocMeta'),
  chatInput:        $('chatInput'),
  sendBtn:          $('sendBtn'),
  quickPrompts:     $('quickPrompts'),
  toastContainer:   $('toastContainer'),
  btnNewChat:       $('btnNewChat'),
};


// ═══════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════

async function init() {
  await checkApiStatus();
  await loadDocuments();
  bindEvents();
}

async function checkApiStatus() {
  try {
    const res = await fetch(`${API}/api/status`);
    const data = await res.json();
    if (!data.llm_ready) {
      showToast('Add GROQ_API_KEY to .env file', 'error', 6000);
    }
  } catch {
    console.warn('Server offline or starting up');
  }
}

async function loadDocuments() {
  try {
    const res = await fetch(`${API}/api/documents`);
    const data = await res.json();
    state.documents = {};
    data.documents.forEach(doc => { state.documents[doc.doc_id] = doc; });
    renderDocList();
  } catch {
    console.error('Failed to load documents');
  }
}


// ═══════════════════════════════════════
//  Event Bindings
// ═══════════════════════════════════════

function bindEvents() {
  // Upload zone
  DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
  DOM.fileInput.addEventListener('change', e => handleFileSelect(e.target.files[0]));

  // Drag-and-drop
  DOM.uploadZone.addEventListener('dragover', e => { e.preventDefault(); DOM.uploadZone.classList.add('dragover'); });
  DOM.uploadZone.addEventListener('dragleave', () => DOM.uploadZone.classList.remove('dragover'));
  DOM.uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    DOM.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  // Chat input
  DOM.chatInput.addEventListener('input', () => {
    autoResize(DOM.chatInput);
    DOM.sendBtn.disabled = !DOM.chatInput.value.trim();
  });

  DOM.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  DOM.sendBtn.addEventListener('click', sendMessage);

  // Quick prompts
  DOM.quickPrompts.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.chatInput.value = chip.dataset.prompt;
      DOM.sendBtn.disabled = false;
      sendMessage();
    });
  });

  // New chat
  DOM.btnNewChat.addEventListener('click', () => {
    if (state.activeDocId) {
      state.chatHistories[state.activeDocId] = [];
      DOM.messages.innerHTML = '';
      showWelcomeInChat();
    }
  });
}


// ═══════════════════════════════════════
//  File Upload
// ═══════════════════════════════════════

async function handleFileSelect(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Only PDF files are supported', 'error');
    return;
  }

  showProgress(true, 'Reading file…');
  animateProgress(15, 200);

  const formData = new FormData();
  formData.append('file', file);

  try {
    animateProgress(35, 300);
    showProgress(true, 'Extracting text…');

    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    animateProgress(80, 200);
    showProgress(true, 'Building index…');

    if (!res.ok) throw new Error(data.detail || 'Upload failed');

    animateProgress(100, 300);
    setTimeout(() => showProgress(false), 800);

    // Store and render
    state.documents[data.doc_id] = data;
    renderDocList();
    openDocument(data.doc_id);
    showToast(`✅ ${data.message}`, 'success');

    // Reset file input
    DOM.fileInput.value = '';

  } catch (err) {
    showProgress(false);
    showToast(`❌ ${err.message}`, 'error', 5000);
    console.error(err);
  }
}

function showProgress(visible, label = '') {
  DOM.uploadProgress.style.display = visible ? 'block' : 'none';
  if (label) DOM.progressLabel.textContent = label;
  if (!visible) DOM.progressFill.style.width = '0%';
}

function animateProgress(target, delay) {
  setTimeout(() => { DOM.progressFill.style.width = `${target}%`; }, delay);
}


// ═══════════════════════════════════════
//  Document List
// ═══════════════════════════════════════

function renderDocList() {
  const docs = Object.values(state.documents);
  DOM.docCount.textContent = docs.length;

  if (docs.length === 0) {
    DOM.docList.innerHTML = `
      <div class="empty-docs">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity="0.3">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <p>No documents yet</p>
      </div>`;
    return;
  }

  DOM.docList.innerHTML = docs.map(doc => `
    <div class="doc-item ${doc.doc_id === state.activeDocId ? 'active' : ''}"
         id="docitem-${doc.doc_id}"
         onclick="openDocument('${doc.doc_id}')">
      <div class="doc-thumb">${getDocEmoji(doc.filename)}</div>
      <div class="doc-info">
        <div class="doc-name" title="${escHtml(doc.filename)}">${escHtml(trimName(doc.filename))}</div>
        <div class="doc-meta">${doc.num_pages} pages · ${doc.file_size_kb} KB</div>
      </div>
      <button class="doc-delete" title="Remove" onclick="deleteDocument(event, '${doc.doc_id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M19,6l-1,14H6L5,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M10,11v6M14,11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `).join('');
}

function getDocEmoji(filename) {
  const name = filename.toLowerCase();
  if (name.includes('paper') || name.includes('research') || name.includes('journal')) return '🔬';
  if (name.includes('note') || name.includes('lecture') || name.includes('class')) return '📓';
  if (name.includes('sop') || name.includes('policy') || name.includes('manual')) return '📊';
  if (name.includes('book') || name.includes('chapter')) return '📕';
  return '📄';
}

function trimName(filename) {
  const noExt = filename.replace(/\.pdf$/i, '');
  return noExt.length > 28 ? noExt.slice(0, 26) + '…' : noExt;
}


// ═══════════════════════════════════════
//  Open / Close Documents
// ═══════════════════════════════════════

function openDocument(docId) {
  const doc = state.documents[docId];
  if (!doc) return;

  state.activeDocId = docId;

  // Update sidebar active state
  document.querySelectorAll('.doc-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`docitem-${docId}`);
  if (el) el.classList.add('active');

  // Show chat screen
  DOM.welcomeScreen.style.display = 'none';
  DOM.chatScreen.style.display = 'flex';

  // Set header info
  DOM.chatDocName.textContent = doc.filename.replace(/\.pdf$/i, '');
  DOM.chatDocMeta.textContent = `${doc.num_pages} pages`;

  // Restore or init chat history
  if (!state.chatHistories[docId]) state.chatHistories[docId] = [];
  renderMessages(state.chatHistories[docId]);

  if (state.chatHistories[docId].length === 0) {
    showWelcomeInChat(doc);
  }

  // Focus input
  DOM.chatInput.focus();
}

function showWelcomeInChat(doc) {
  const welcomeMsg = {
    role: 'ai',
    content: doc
      ? `👋 I've processed **${doc.filename}** (${doc.num_pages} pages, ${doc.num_chunks} indexed chunks).\n\nYou can ask me anything about this document. Try:\n- **Summarize this document**\n- **Generate 5 MCQs**\n- **Explain Chapter 1**\n- Or any specific question!`
      : `👋 Start a new conversation! Use the quick prompts below or type your own question.`,
    sources: [],
  };
  appendMessageToDOM(welcomeMsg);
}

async function deleteDocument(event, docId) {
  event.stopPropagation();
  try {
    const res = await fetch(`${API}/api/documents/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    delete state.documents[docId];
    delete state.chatHistories[docId];
    if (state.activeDocId === docId) {
      state.activeDocId = null;
      DOM.welcomeScreen.style.display = '';
      DOM.chatScreen.style.display = 'none';
    }
    renderDocList();
    showToast('Document removed', 'info');
  } catch (err) {
    showToast('Failed to remove document', 'error');
  }
}


// ═══════════════════════════════════════
//  Chat / Messaging
// ═══════════════════════════════════════

async function sendMessage() {
  const question = DOM.chatInput.value.trim();
  if (!question || state.isTyping || !state.activeDocId) return;

  // Add user message
  const userMsg = { role: 'user', content: question, sources: [] };
  pushMessage(state.activeDocId, userMsg);
  appendMessageToDOM(userMsg);

  // Clear input
  DOM.chatInput.value = '';
  DOM.sendBtn.disabled = true;
  autoResize(DOM.chatInput);

  // Show typing indicator
  state.isTyping = true;
  const typingEl = showTypingIndicator();

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: state.activeDocId, question }),
    });

    const data = await res.json();
    typingEl.remove();
    state.isTyping = false;

    if (!res.ok) throw new Error(data.detail || 'Chat failed');

    const aiMsg = { role: 'ai', content: data.answer, sources: data.sources };
    pushMessage(state.activeDocId, aiMsg);
    appendMessageToDOM(aiMsg);

  } catch (err) {
    typingEl.remove();
    state.isTyping = false;
    const errMsg = { role: 'ai', content: `⚠️ Error: ${err.message}`, sources: [] };
    pushMessage(state.activeDocId, errMsg);
    appendMessageToDOM(errMsg);
  }

  scrollToBottom();
}

function pushMessage(docId, msg) {
  if (!state.chatHistories[docId]) state.chatHistories[docId] = [];
  state.chatHistories[docId].push(msg);
}

function renderMessages(history) {
  DOM.messages.innerHTML = '';
  history.forEach(msg => appendMessageToDOM(msg));
}

function appendMessageToDOM(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role === 'user' ? 'user-msg' : 'ai-msg'}`;

  const avatarHtml = msg.role === 'user'
    ? `<div class="avatar user-avatar">U</div>`
    : `<div class="avatar ai-avatar">✦</div>`;

  const sourcesHtml = (msg.sources && msg.sources.length > 0)
    ? `<div class="sources-bar">
        <span class="sources-label">Sources</span>
        ${msg.sources.map(p => `<span class="source-chip">Page ${p}</span>`).join('')}
       </div>`
    : '';

  div.innerHTML = `
    ${avatarHtml}
    <div class="bubble md-content">
      ${renderMarkdown(msg.content)}
      ${sourcesHtml}
    </div>
  `;

  DOM.messages.appendChild(div);
  scrollToBottom();
}

function showTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message ai-msg typing-indicator';
  div.innerHTML = `
    <div class="avatar ai-avatar">✦</div>
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>`;
  DOM.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  setTimeout(() => {
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
  }, 50);
}


// ═══════════════════════════════════════
//  Markdown Renderer (lightweight)
// ═══════════════════════════════════════

function renderMarkdown(text) {
  if (!text) return '';

  let html = escHtml(text);

  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*?)$/gm,  '<h3>$1</h3>');
  html = html.replace(/^# (.*?)$/gm,   '<h2>$1</h2>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^(\s*[-*+] .+(?:\n\s*[-*+] .+)*)/gm, match => {
    const items = match.split('\n').filter(l => l.trim()).map(l =>
      `<li>${l.replace(/^\s*[-*+] /, '').trim()}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/^(\s*\d+\. .+(?:\n\s*\d+\. .+)*)/gm, match => {
    const items = match.split('\n').filter(l => l.trim()).map(l =>
      `<li>${l.replace(/^\s*\d+\. /, '').trim()}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs — double newlines
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[234]>)/g, '$1');
  html = html.replace(/(<\/h[234]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>|<ol>|<hr>)/g, '$1');
  html = html.replace(/(<\/ul>|<\/ol>|<hr>)<\/p>/g, '$1');

  return html;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ═══════════════════════════════════════
//  Toast Notifications
// ═══════════════════════════════════════

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


// ═══════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}


// ─── Boot ──────────────────────────────
document.addEventListener('DOMContentLoaded', init);
