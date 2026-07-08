/* ═══ Mind Map — D3.js Collapsible Tree ═══ */

const PALETTE = ['#e2574c','#3b82f6','#22c55e','#f59e0b','#a855f7','#0ea5e9','#ec4899'];
let mapZoom = null;

function resetMap() {
  const svg = d3.select('#mapContainer svg');
  if (mapZoom) svg.transition().duration(500).call(mapZoom.transform, d3.zoomIdentity);
}

function renderMindMap(data) {
  const container = document.getElementById('mapContainer');
  container.innerHTML = '';
  if (!data || !data.name) {
    container.innerHTML = '<div class="feature-empty"><div class="feature-empty-icon">🗺️</div><p>No structure found.</p></div>';
    return;
  }

  const W = container.clientWidth || 800;
  const H = container.clientHeight || 500;
  const cx = W / 2, cy = H / 2;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

  mapZoom = d3.zoom().scaleExtent([0.3, 2.5]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(mapZoom);

  const root = d3.hierarchy(data);
  let nodeId = 0;
  root.descendants().forEach(d => {
    d._id = nodeId++;
    d._children = null;
    d._collapsed = false;
  });

  const layout = d3.tree().size([360, Math.min(W, H) * 0.38]);
  const radial = d3.linkRadial().angle(d => d.x * Math.PI / 180).radius(d => d.y);

  function update() {
    layout(root);
    g.selectAll('*').remove();

    // Links
    g.append('g').selectAll('path').data(root.links()).join('path')
      .attr('d', radial).attr('fill', 'none').attr('stroke', '#e5e7eb').attr('stroke-width', 1.5);

    // Nodes
    const node = g.append('g').selectAll('g').data(root.descendants()).join('g')
      .attr('transform', d => `rotate(${d.x - 90}) translate(${d.y},0)`)
      .style('cursor', d => d.children || d._children ? 'pointer' : 'default')
      .on('click', (e, d) => {
        if (d._collapsed) { d.children = d._children; d._children = null; d._collapsed = false; }
        else if (d.children && d.depth > 0) { d._children = d.children; d.children = null; d._collapsed = true; }
        update();
      });

    // Circles
    node.append('circle').attr('r', d => d.depth === 0 ? 18 : d.depth === 1 ? 12 : 7)
      .attr('fill', d => {
        if (d.depth === 0) return '#e2574c';
        const parent = d.parent;
        const idx = parent ? parent.children ? parent.children.indexOf(d) : 0 : 0;
        return PALETTE[(d.depth === 1 ? d.parent?.children?.indexOf(d) || 0 : d.parent?.parent?.children?.indexOf(d.parent) || 0) % PALETTE.length];
      })
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .attr('opacity', d => (d._collapsed) ? 0.6 : 1);

    // Collapse indicator
    node.filter(d => d._collapsed).append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', '10px').attr('fill', '#fff').text('+');

    // Labels
    node.append('text')
      .attr('dy', '0.32em')
      .attr('x', d => d.x < 180 ? (d.depth === 0 ? 0 : d.depth === 1 ? 18 : 12) : -(d.depth === 0 ? 0 : d.depth === 1 ? 18 : 12))
      .attr('text-anchor', d => d.depth === 0 ? 'middle' : d.x < 180 ? 'start' : 'end')
      .attr('transform', d => d.x >= 180 ? 'rotate(180)' : '')
      .attr('font-size', d => d.depth === 0 ? '13px' : d.depth === 1 ? '11px' : '10px')
      .attr('font-weight', d => d.depth <= 1 ? '600' : '400')
      .attr('fill', d => d.depth === 0 ? '#fff' : '#1a1a1a')
      .text(d => d.data.name.length > 22 ? d.data.name.slice(0, 20) + '…' : d.data.name);
  }

  update();
}
