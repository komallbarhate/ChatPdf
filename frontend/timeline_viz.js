/* ═══ Timeline Visualization ═══ */

const CATEGORY_COLORS = {
  Historical:  { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  Scientific:  { bg: '#dcfce7', text: '#166534', dot: '#22c55e' },
  Political:   { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' },
  Personal:    { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  Technical:   { bg: '#f3e8ff', text: '#6b21a8', dot: '#a855f7' },
  Other:       { bg: '#f1f5f9', text: '#334155', dot: '#94a3b8' },
};

function renderTimeline(data) {
  const container = document.getElementById('timelineContainer');
  if (!data.events || !data.events.length) {
    container.innerHTML = '<div class="feature-empty"><div class="feature-empty-icon">📅</div><p>No datable events found in this document.</p></div>';
    return;
  }

  const events = data.events.sort((a, b) => {
    const da = new Date(a.date + (a.date.length <= 4 ? '-01-01' : '')).getTime();
    const db = new Date(b.date + (b.date.length <= 4 ? '-01-01' : '')).getTime();
    return da - db;
  });

  container.innerHTML = `
    <h2 class="timeline-title">${esc(data.title || 'Document Timeline')}</h2>
    <div class="timeline-track">
      ${events.map(ev => {
        const c = CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.Other;
        return `
          <div class="timeline-event">
            <div class="timeline-card">
              <div class="timeline-date">📅 ${esc(ev.date)}</div>
              <div class="timeline-etitle">${esc(ev.title)}</div>
              <div class="timeline-desc">${esc(ev.description)}</div>
              <span class="timeline-cat" style="background:${c.bg};color:${c.text}">${esc(ev.category)}</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
