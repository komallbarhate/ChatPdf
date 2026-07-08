/* ═══ Knowledge Graph — D3.js Force-Directed ═══ */

const NODE_COLORS = {
  Person:       { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a8a' },
  Organization: { fill: '#dcfce7', stroke: '#22c55e', text: '#14532d' },
  Technology:   { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
  Concept:      { fill: '#f3e8ff', stroke: '#a855f7', text: '#581c87' },
  Date:         { fill: '#fce7f3', stroke: '#ec4899', text: '#831843' },
  Location:     { fill: '#e0f2fe', stroke: '#0ea5e9', text: '#075985' },
  Other:        { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
};

let graphSvg = null;

function renderKnowledgeGraph(data) {
  const container = document.getElementById('graphContainer');
  container.innerHTML = '';
  if (!data.nodes || !data.nodes.length) {
    container.innerHTML = '<div class="feature-empty"><div class="feature-empty-icon">🕸️</div><p>No entities found. Try a document with more named entities.</p></div>';
    return;
  }

  const W = container.clientWidth || 800;
  const H = container.clientHeight || 500;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  graphSvg = svg;

  const g = svg.append('g');

  // Zoom
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', e => g.attr('transform', e.transform)));

  // Build node map
  const nodeMap = {};
  data.nodes.forEach(n => { nodeMap[n.id] = n; });

  // Filter valid edges
  const validEdges = data.edges.filter(e => nodeMap[e.source] && nodeMap[e.target]);

  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(validEdges).id(d => d.id).distance(100).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(50));

  // Edges
  const link = g.append('g').selectAll('line').data(validEdges).join('line')
    .attr('class', 'link').attr('stroke', '#ddd').attr('stroke-width', 1.5);

  // Edge labels
  const edgeLabel = g.append('g').selectAll('text').data(validEdges).join('text')
    .attr('class', 'link-label').attr('text-anchor', 'middle').attr('dy', '-3')
    .text(d => d.label || '');

  // Tooltip
  const tooltip = d3.select(container).append('div').attr('class', 'node-tooltip').style('display', 'none');

  // Nodes
  const node = g.append('g').selectAll('g').data(data.nodes).join('g')
    .attr('class', 'node').call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
    .on('mouseover', (e, d) => {
      tooltip.style('display', 'block').style('left', (e.offsetX + 14) + 'px').style('top', (e.offsetY - 10) + 'px')
        .html(`<strong>${d.label}</strong><br><em style="color:#999">${d.type}</em>${d.description ? '<br>'+d.description : ''}`);
    })
    .on('mouseout', () => tooltip.style('display', 'none'))
    .on('click', (e, d) => {
      // Highlight connected nodes
      const connected = new Set([d.id]);
      validEdges.forEach(edge => {
        if (edge.source.id === d.id) connected.add(edge.target.id);
        if (edge.target.id === d.id) connected.add(edge.source.id);
      });
      node.selectAll('circle').style('opacity', n => connected.has(n.id) ? 1 : 0.2);
      link.style('opacity', e => connected.has(e.source.id) && connected.has(e.target.id) ? 1 : 0.1);
    });

  node.append('circle').attr('r', d => 14 + Math.min(d.label.length, 10))
    .attr('fill', d => (NODE_COLORS[d.type] || NODE_COLORS.Other).fill)
    .attr('stroke', d => (NODE_COLORS[d.type] || NODE_COLORS.Other).stroke)
    .attr('stroke-width', 2);

  node.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('fill', d => (NODE_COLORS[d.type] || NODE_COLORS.Other).text)
    .attr('font-size', '10px').attr('font-weight', '600')
    .text(d => d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label);

  // Click background to reset highlight
  svg.on('click', () => {
    node.selectAll('circle').style('opacity', 1);
    link.style('opacity', 1);
  });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    edgeLabel.attr('x', d => (d.source.x + d.target.x) / 2)
              .attr('y', d => (d.source.y + d.target.y) / 2);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}
