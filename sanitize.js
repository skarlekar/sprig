/* Sprig map checks, shared by the browser (window.SprigSanitize) and the server (require).
   Maps can come from imported files or from the network, so every field is coerced to a known-safe value. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SprigSanitize = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 1;
  const THEME_IDS = ['meadow', 'harbor', 'ember', 'ink', 'blueprint'];
  const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i, SAFE_ID = /^[a-z0-9]{1,32}$/i;
  const LIMITS = { depth: 64, nodes: 20000, text: 10000 };

  // Iterative walk, so a deeply nested document is refused without overflowing the stack.
  function validate(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'The map must be a JSON object.';
    if (!Array.isArray(d.roots)) return 'The map has no roots array.';
    if (d.title != null && String(d.title).length > LIMITS.text) return 'The title is too long.';
    const stack = d.roots.map(n => [n, 1]);
    let count = 0;
    while (stack.length) {
      const [n, depth] = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (++count > LIMITS.nodes) return `The map has more than ${LIMITS.nodes} nodes.`;
      if (depth > LIMITS.depth) return `The map is nested deeper than ${LIMITS.depth} levels.`;
      if (n.text != null && String(n.text).length > LIMITS.text) return 'A node text is too long.';
      if (typeof n.note === 'string' && n.note.length > LIMITS.text) return 'A note is too long.';
      if (Array.isArray(n.children)) for (const c of n.children) stack.push([c, depth + 1]);
    }
    return null;
  }

  function countNodes(d) {
    let count = 0; const stack = [...(d.roots || [])];
    while (stack.length) { const n = stack.pop(); count++; stack.push(...(n.children || [])); }
    return count;
  }

  function sanitizeDoc(d, opts) {
    const themeIds = (opts && opts.themeIds) || THEME_IDS;
    const makeId = opts && opts.makeId;
    if (typeof makeId !== 'function') throw new Error('sanitizeDoc needs a makeId function');
    d = d && typeof d === 'object' ? d : {};
    const ids = new Set();
    const clean = n => {
      if (!n || typeof n !== 'object') return null;
      const o = { id: typeof n.id === 'string' && SAFE_ID.test(n.id) && !ids.has(n.id) ? n.id : makeId(), text: String(n.text ?? '') };
      ids.add(o.id);
      if (typeof n.color === 'string' && HEX.test(n.color)) o.color = n.color;
      if (['box', 'pill', 'line'].includes(n.shape)) o.shape = n.shape;
      if (typeof n.task === 'boolean') o.task = n.task;
      if (typeof n.note === 'string' && n.note) o.note = n.note;
      if (typeof n.sticker === 'string' && n.sticker && [...n.sticker].length <= 4) o.sticker = n.sticker;
      if (n.collapsed === true) o.collapsed = true;
      if (n.bold === true) o.bold = true;
      if (n.italic === true) o.italic = true;
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) { o.x = n.x; o.y = n.y; }
      o.children = (Array.isArray(n.children) ? n.children : []).map(clean).filter(Boolean);
      return o;
    };
    const roots = (Array.isArray(d.roots) ? d.roots : []).map(clean).filter(Boolean);
    if (!roots.length) { const r = { id: makeId(), text: 'Central idea', children: [], x: 0, y: 0 }; ids.add(r.id); roots.push(r); }
    roots.forEach((r, i) => { if (r.x == null) { r.x = 0; r.y = i * 420; } });
    return {
      id: typeof d.id === 'string' && SAFE_ID.test(d.id) ? d.id : makeId(),
      format: FORMAT,
      title: String(d.title ?? ''), updated: Number.isFinite(d.updated) ? d.updated : Date.now(),
      theme: typeof d.theme === 'string' && themeIds.includes(d.theme) ? d.theme : 'meadow',
      layout: ['map', 'right', 'tree'].includes(d.layout) ? d.layout : 'map',
      branch: ['curve', 'elbow'].includes(d.branch) ? d.branch : 'curve',
      roots,
      connections: (Array.isArray(d.connections) ? d.connections : [])
        .filter(c => c && ids.has(c.from) && ids.has(c.to))
        .map(c => ({ id: typeof c.id === 'string' && SAFE_ID.test(c.id) ? c.id : makeId(), from: c.from, to: c.to }))
    };
  }

  return { FORMAT, THEME_IDS, SAFE_ID, LIMITS, validate, sanitizeDoc, countNodes };
});
