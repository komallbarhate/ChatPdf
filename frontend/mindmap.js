/* ═══ Mind Map — D3.js Horizontal Collapsible Tree ═══ */

const MM_COLORS = [
  { bg: '#fff0ef', stroke: '#e2574c', text: '#c43d32' },
  { bg: '#eff6ff', stroke: '#3b82f6', text: '#1d4ed8' },
  { bg: '#f0fdf4', stroke: '#22c55e', text: '#15803d' },
  { bg: '#fefce8', stroke: '#eab308', text: '#a16207' },
  { bg: '#faf5ff', stroke: '#a855f7', text: '#7e22ce' },
  { bg: '#ecfeff', stroke: '#06b6d4', text: '#0e7490' },
  { bg: '#fff7ed', stroke: '#f97316', text: '#c2410c' },
];

let _mapSvg = null;
let _mapZoom = null;

function resetMap() {
  if (_mapSvg && _mapZoom) {
    _mapSvg.transition().duration(600).call(_mapZoom.transform, d3.zoomIdentity.translate(60, 0).scale(1));
  }
}

function renderMindMap(data) {
  const container = document.getElementById('mapContainer');
  container.innerHTML = '';

  if (!data || !data.name) {
    container.innerHTML = '<div class="feature-empty"><div class="feature-empty-icon">🗺️</div><p>No structure found in document.</p></div>';
    return;
  }

  const W = container.clientWidth  || 860;
  const H = container.clientHeight || 520;

  const svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H)
    .style('background', '#fafafa');
  _mapSvg = svg;

  const g = svg.append('g').attr('transform', `translate(80, ${H / 2})`);

  _mapZoom = d3.zoom().scaleExtent([0.2, 2])
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(_mapZoom);

  // Tooltip
  const tooltip = d3.select(container).append('div')
    .attr('class', 'node-tooltip')
    .style('display', 'none')
    .style('position', 'absolute')
    .style('pointer-events', 'none');

  // Build hierarchy
  const root = d3.hierarchy(data);
  let uid = 0;
  root.each(d => {
    d._id = uid++;
    d._collapsed = false;
    if (d.depth > 1) { d._children = d.children; d.children = null; d._collapsed = true; }
  });

  // Assign branch color (based on first-level ancestor)
  root.each(d => {
    if (d.depth === 0) d._color = MM_COLORS[0];
    else {
      let anc = d;
      while (anc.parent && anc.parent.depth !== 0) anc = anc.parent;
      const idx = root.children ? root.children.indexOf(anc) : 0;
      d._color = MM_COLORS[(idx + 1) % MM_COLORS.length];
    }
  });

  function getNodeWidth(d) {
    const len = (d.data.name || '').length;
    return Math.max(80, Math.min(160, len * 7.5 + 20));
  }
  function getNodeHeight(d) { return d.depth === 0 ? 42 : 32; }

  const treeLayout = d3.tree().nodeSize([52, 200])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.3));

  function update() {
    treeLayout(root);
    g.selectAll('*').remove();

    const allNodes = root.descendants();
    const allLinks = root.links();

    // Links — curved bezier
    g.append('g').selectAll('path').data(allLinks).join('path')
      .attr('fill', 'none')
      .attr('stroke', d => d.target._color.stroke)
      .attr('stroke-width', d => Math.max(1, 3 - d.target.depth))
      .attr('stroke-opacity', 0.5)
      .attr('d', d => {
        const sx = d.source.y + getNodeWidth(d.source) / 2;
        const sy = d.source.x;
        const tx = d.target.y - getNodeWidth(d.target) / 2;
        const ty = d.target.x;
        const mx = (sx + tx) / 2;
        return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
      });

    // Node groups
    const nodeG = g.append('g').selectAll('g').data(allNodes).join('g')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', d => (d.children || d._children) ? 'pointer' : 'default')
      .on('click', (e, d) => {
        e.stopPropagation();
        if (d._collapsed) {
          d.children = d._children; d._children = null; d._collapsed = false;
        } else if (d.children && d.depth > 0) {
          d._children = d.children; d.children = null; d._collapsed = true;
        }
        update();
      })
      .on('mouseover', (e, d) => {
        if (d._collapsed && d._children) {
          tooltip.style('display', 'block')
            .style('left', (e.offsetX + 14) + 'px')
            .style('top',  (e.offsetY - 10) + 'px')
            .html(`<strong>${d.data.name}</strong><br><span style="font-size:10px;color:#888">${d._children.length} hidden node(s) — click to expand</span>`);
        }
      })
      .on('mouseout', () => tooltip.style('display', 'none'));

    // Rectangles
    nodeG.append('rect')
      .attr('x', d => -getNodeWidth(d) / 2)
      .attr('y', d => -getNodeHeight(d) / 2)
      .attr('width', d => getNodeWidth(d))
      .attr('height', d => getNodeHeight(d))
      .attr('rx', d => d.depth === 0 ? 20 : 10)
      .attr('fill', d => d.depth === 0 ? d._color.stroke : d._color.bg)
      .attr('stroke', d => d._color.stroke)
      .attr('stroke-width', d => d.depth === 0 ? 0 : 1.5)
      .style('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.08))');

    // Labels
    nodeG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', d => d.depth === 0 ? '13px' : d.depth === 1 ? '11px' : '10px')
      .attr('font-weight', d => d.depth <= 1 ? '600' : '400')
      .attr('fill', d => d.depth === 0 ? '#fff' : d._color.text)
      .attr('pointer-events', 'none')
      .text(d => {
        const max = d.depth === 0 ? 20 : 18;
        const name = d.data.name || '';
        return name.length > max ? name.slice(0, max - 1) + '…' : name;
      });

    // Collapse indicator dot
    nodeG.filter(d => d._collapsed).append('circle')
      .attr('cx', d => getNodeWidth(d) / 2 + 8)
      .attr('cy', 0)
      .attr('r', 6)
      .attr('fill', d => d._color.stroke)
      .attr('stroke', '#fff').attr('stroke-width', 1.5);

    nodeG.filter(d => d._collapsed).append('text')
      .attr('x', d => getNodeWidth(d) / 2 + 8)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px').attr('font-weight', '700').attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => d._children ? d._children.length : '');
  }

  update();
}
