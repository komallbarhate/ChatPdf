/* ═══ Knowledge Graph — D3.js Force-Directed (improved) ═══ */

const TYPE_PALETTE = [
  '#e2574c','#3b82f6','#22c55e','#f59e0b','#a855f7','#0ea5e9','#ec4899','#14b8a6','#f97316','#84cc16'
];

function renderKnowledgeGraph(data) {
  const container = document.getElementById('graphContainer');
  container.innerHTML = '';

  if (!data.nodes || !data.nodes.length) {
    container.innerHTML = '<div class="feature-empty"><div class="feature-empty-icon">🕸️</div><p>No entities found. Try a richer document.</p></div>';
    return;
  }

  // ── Build dynamic type → color map from actual data ──
  const types = [...new Set(data.nodes.map(n => n.type || 'Other'))];
  const typeColor = {};
  types.forEach((t, i) => { typeColor[t] = TYPE_PALETTE[i % TYPE_PALETTE.length]; });

  // ── Render dynamic legend ──
  const legendEl = document.getElementById('graphLegend');
  if (legendEl) {
    legendEl.style.display = 'flex';
    legendEl.innerHTML = types.map(t =>
      `<span class="legend-item-dyn" style="background:${typeColor[t]}22;color:${typeColor[t]};border:1px solid ${typeColor[t]}44">
        <span style="width:8px;height:8px;border-radius:50%;background:${typeColor[t]};display:inline-block;margin-right:5px;"></span>${t}
       </span>`
    ).join('');
  }

  const W = container.clientWidth  || 860;
  const H = container.clientHeight || 520;

  const svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H)
    .style('background', '#fafafa');

  // Arrow marker
  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -5 10 10')
    .attr('refX', 28).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#ccc');

  const g = svg.append('g');

  // Zoom & pan
  svg.call(d3.zoom().scaleExtent([0.25, 3])
    .on('zoom', e => g.attr('transform', e.transform)));

  const nodeMap = {};
  data.nodes.forEach(n => { nodeMap[n.id] = n; });
  const edges = data.edges.filter(e => nodeMap[e.source] && nodeMap[e.target]);

  const sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(130).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-500))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(55));

  // ── Edges ──
  const link = g.append('g').selectAll('line').data(edges).join('line')
    .attr('stroke', '#e2e8f0').attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)');

  // ── Edge labels (only show on hover, kept light) ──
  const edgeLabel = g.append('g').selectAll('text').data(edges).join('text')
    .attr('text-anchor', 'middle').attr('dy', '-4')
    .attr('font-size', '9px').attr('fill', '#bbb')
    .attr('pointer-events', 'none')
    .text(d => (d.label || '').slice(0, 20));

  // ── Tooltip ──
  const tooltip = d3.select(container).append('div').attr('class', 'node-tooltip')
    .style('display', 'none').style('position', 'absolute').style('pointer-events', 'none');

  // ── Nodes (drawn AFTER edges so they appear on top) ──
  const nodeG = g.append('g').selectAll('g').data(data.nodes).join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',  (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
    .on('mouseover', (e, d) => {
      tooltip.style('display', 'block')
        .style('left', (e.offsetX + 16) + 'px')
        .style('top',  (e.offsetY - 12) + 'px')
        .html(`<strong style="color:${typeColor[d.type||'Other']}">${d.label}</strong>
               <div style="font-size:10px;color:#888;margin:2px 0">${d.type || 'Other'}</div>
               ${d.description ? `<div style="font-size:11px;color:#555;margin-top:4px">${d.description}</div>` : ''}`);
    })
    .on('mouseout', () => tooltip.style('display', 'none'))
    .on('click', (event, d) => {
      event.stopPropagation();
      const connected = new Set([d.id]);
      edges.forEach(e => {
        if (e.source.id === d.id || e.source === d.id) connected.add(e.target.id || e.target);
        if (e.target.id === d.id || e.target === d.id) connected.add(e.source.id || e.source);
      });
      nodeG.style('opacity', n => connected.has(n.id) ? 1 : 0.15);
      link.style('opacity', e => (connected.has(e.source.id||e.source) && connected.has(e.target.id||e.target)) ? 1 : 0.05);
    });

  // White shadow circle (for text readability behind circle)
  nodeG.append('circle').attr('r', 22)
    .attr('fill', 'white').attr('filter', 'url(#shadow)');

  // Main colored circle
  nodeG.append('circle').attr('r', 20)
    .attr('fill', d => typeColor[d.type || 'Other'] + '22')
    .attr('stroke', d => typeColor[d.type || 'Other'])
    .attr('stroke-width', 2.5);

  // Type initial inside circle
  nodeG.append('text')
    .attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('font-size', '11px').attr('font-weight', '700')
    .attr('fill', d => typeColor[d.type || 'Other'])
    .attr('pointer-events', 'none')
    .text(d => (d.type || 'O').charAt(0).toUpperCase());

  // Label BELOW circle (with white halo for readability over lines)
  nodeG.append('text')
    .attr('text-anchor', 'middle').attr('y', 34)
    .attr('font-size', '10px').attr('font-weight', '600')
    .attr('fill', '#1a1a1a').attr('stroke', 'white')
    .attr('stroke-width', 3).attr('paint-order', 'stroke')
    .attr('pointer-events', 'none')
    .text(d => {
      const label = d.label || '';
      return label.length > 18 ? label.slice(0, 16) + '…' : label;
    });

  // Shadow filter
  const defs = svg.select('defs');
  const filter = defs.append('filter').attr('id', 'shadow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
  filter.append('feDropShadow').attr('dx', '0').attr('dy', '1').attr('stdDeviation', '2').attr('flood-color', 'rgba(0,0,0,0.12)');

  // Reset highlight on bg click
  svg.on('click', () => {
    nodeG.style('opacity', 1);
    link.style('opacity', 1);
  });

  sim.on('tick', () => {
    // Keep nodes within bounds
    data.nodes.forEach(d => {
      d.x = Math.max(40, Math.min(W - 40, d.x));
      d.y = Math.max(40, Math.min(H - 40, d.y));
    });
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    edgeLabel.attr('x', d => (d.source.x + d.target.x) / 2)
              .attr('y', d => (d.source.y + d.target.y) / 2);
    nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}
