"use strict";
/* ---------- utilities ---------- */
const $ = s => document.querySelector(s);
const uid = () => { let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(16))) s += (b % 36).toString(36); return s; };
// local: maps live in this browser. server: maps live on a Sprig server. viewer: a read-only shared map.
const MODE = (document.querySelector('meta[name="sprig-mode"]') || {}).content || 'local';
let readOnly = MODE === 'viewer';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); return true; } catch(e){ return false; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const mem = {}; // fallback when storage is unavailable
const FU = "Figtree, -apple-system, 'Segoe UI', system-ui, sans-serif";
const FD = "Jost, Futura, 'Avenir Next', -apple-system, sans-serif";
const FE = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
function hexRgb(h){ h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255]; }
function mix(a,b,t){ const A=hexRgb(a),B=hexRgb(b); return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); }
function lum(h){ const [r,g,b]=hexRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*r+.7152*g+.0722*b; }
const textOn = h => lum(h) > .42 ? '#222a29' : '#ffffff';
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,1800); }

/* ---------- themes ---------- */
const THEMES = {
  meadow:{name:'Meadow', l1:'fill', radius:9,
    light:{bg:'#f2f3f1',card:'#ffffff',rootFill:'#ffffff',rootText:'#2a2f2e',text:'#363c3b',conn:'#8d9896',palette:['#ec9fc0','#b3a6dc','#68bec6','#ef9363','#f4ca6c','#9dcf8f']},
    dark:{bg:'#1b1f1e',card:'#262b2a',rootFill:'#2e3433',rootText:'#f2f5f4',text:'#dde3e1',conn:'#7f8b89',palette:['#e88fb5','#a596d6','#5bb3bb','#e8875a','#e9bd5d','#8dc480']}},
  harbor:{name:'Harbor', l1:'outline', radius:20,
    light:{bg:'#edf1f5',card:'#ffffff',rootFill:'#1f3a5a',rootText:'#ffffff',text:'#24313f',conn:'#7b8a9b',palette:['#2f6f9f','#2a9384','#c4683f','#7b5ea7','#b08224','#4f8a3c']},
    dark:{bg:'#121a22',card:'#1a2530',rootFill:'#dbe7f3',rootText:'#14202c',text:'#d6e0ea',conn:'#6f8193',palette:['#6aaee0','#55c7b7','#e8936b','#ad93db','#e0b85a','#86c26f']}},
  ember:{name:'Ember', l1:'fill', radius:5,
    light:{bg:'#f4f1f2',card:'#ffffff',rootFill:'#2b1d2e',rootText:'#ffffff',text:'#33262f',conn:'#9b8a92',palette:['#e4572e','#ee9a1c','#2e86ab','#7a4fa3','#d6336c','#3f9d6a']},
    dark:{bg:'#1c1619',card:'#271e22',rootFill:'#f6e9ee',rootText:'#2b1d2e',text:'#eadfe3',conn:'#8f7f86',palette:['#ec6b45','#f1a93a','#4a9cc0','#9a72c2','#e2557f','#55b07f']}},
  ink:{name:'Ink', l1:'outline', radius:3,
    light:{bg:'#fafaf9',card:'#fafaf9',rootFill:'#1f1f1e',rootText:'#fafaf9',text:'#262625',conn:'#8a8a87',palette:['#3a3a38']},
    dark:{bg:'#151515',card:'#151515',rootFill:'#ededeb',rootText:'#151515',text:'#e4e4e2',conn:'#8a8a87',palette:['#cfcfcc']}},
  blueprint:{name:'Blueprint', l1:'outline', radius:2, grid:true,
    light:{bg:'#1f5591',card:'#1f5591',rootFill:'#f4f8fc',rootText:'#1f5591',text:'#eef4fb',conn:'#bcd3ec',palette:['#ffffff','#bfe0ff','#ffd8a3','#b9f0dc','#ffc9d6','#ddd3ff']},
    dark:{bg:'#0f2c4d',card:'#0f2c4d',rootFill:'#e6eef7',rootText:'#0f2c4d',text:'#e3ecf6',conn:'#9db8d6',palette:['#ffffff','#bfe0ff','#ffd8a3','#b9f0dc','#ffc9d6','#ddd3ff']}}
};
const COLORS = ['#e2557f','#ec9fc0','#ef9363','#f4ca6c','#9dcf8f','#3f9d6a','#68bec6','#2f6f9f','#b3a6dc','#7a4fa3','#8a6b52','#5e6766'];
const STICKERS = ['💡','⭐️','🎯','🚀','📌','✅','❗','❓','🔥','💬','📚','🧠','🎨','🛠️','📈','📉','💰','🗓️','⏰','🏁','🧪','🔍','📝','🎉','❤️','👍','👎','⚠️','🔒','🌱','🌍','🏠','✈️','🍽️','🎵','📷','💼','🤝','👥','🧩','⚙️','🔗','📣','🧭','🏆','📐','🛒','🌙'];
const uiMode = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const T = () => THEMES[doc.theme] || THEMES.meadow;
const TC = () => T()[uiMode()];

/* ---------- state ---------- */
let doc, byId = {}, parentOf = {}, vis = [];
let sel = null, selConn = null, editing = null, focusMode = false, connectFrom = null;
let view = {x:0, y:0, k:1};
let undoStack = [], redoStack = [];
let search = {hits:[], i:-1, q:''};
let drag = null, dropInfo = null, pan = null, lastDown = {t:0}, hoverId = null;
const pointers = new Map();
const svg = $('#svg'), vp = $('#vp'), stage = $('#stage'), ed = $('#editor');
const ser = o => JSON.stringify(o, (k,v) => k[0]==='_' ? undefined : v);
const N = (text, extra) => Object.assign({id:uid(), text, children:[]}, extra||{});

/* ---------- tree helpers ---------- */
function index(){
  byId = {}; parentOf = {};
  const walk = (n, p, d) => {
    byId[n.id] = n; parentOf[n.id] = p; n._d = d; n._tt = 0; n._td = 0;
    for (const c of n.children){ walk(c, n, d+1); n._tt += c._tt + (c.task!=null?1:0); n._td += c._td + (c.task===true?1:0); }
  };
  doc.roots.forEach(r => walk(r, null, 0));
}
const kids = n => n.collapsed ? [] : n.children;
const sibs = n => parentOf[n.id] ? parentOf[n.id].children : doc.roots;
const isAnc = (a, n) => { for (let p = n; p; p = parentOf[p.id]) if (p === a) return true; return false; };
const countDesc = n => n.children.reduce((a,c)=>a+1+countDesc(c),0);
const rootOf = n => { while (parentOf[n.id]) n = parentOf[n.id]; return n; };
function walkAll(fn){ const w = n => { fn(n); n.children.forEach(w); }; doc.roots.forEach(w); }
function cloneFresh(n){ const c = JSON.parse(ser(n)); const re = x => { x.id = uid(); x.children.forEach(re); }; re(c); delete c.x; delete c.y; return c; }

/* ---------- measuring ---------- */
const mctx = document.createElement('canvas').getContext('2d');
const wrapCache = new Map();
function wrap(text, font, maxW){
  const key = font + '|' + maxW + '|' + text;
  if (wrapCache.has(key)) return wrapCache.get(key);
  mctx.font = font; const out = [];
  for (const para of text.split('\n')){
    const words = para.split(' '); let line = '';
    for (let w of words){
      const t = line ? line + ' ' + w : w;
      if (mctx.measureText(t).width <= maxW || !line){
        if (!line && mctx.measureText(w).width > maxW){ // break a long word
          let chunk = '';
          for (const ch of w){ if (mctx.measureText(chunk+ch).width > maxW && chunk){ out.push(chunk); chunk = ''; } chunk += ch; }
          line = chunk;
        } else line = t;
      } else { out.push(line); line = w; }
    }
    out.push(line);
  }
  wrapCache.set(key, out); return out;
}
function nstyle(n){
  const d = n._d, th = T();
  let s;
  if (d === 0) s = {size:21, lh:27, w:600, fam:FD, px:20, py:14, max:260, mid:true, box:true, r:13};
  else if (d === 1) s = {size:15, lh:20, w:600, fam:FU, px:14, py:9, max:220, mid:true, box:true, r:th.radius};
  else s = {size:14, lh:19, w:400, fam:FU, px:5, py:4, max:240, mid:false, box:false, r:6};
  if (d > 0 && n.shape === 'line') Object.assign(s, {box:false, px:5, py:4, mid:false});
  if (d > 1 && (n.shape === 'box' || n.shape === 'pill')) Object.assign(s, {box:true, px:10, py:6, r:6});
  if (n.bold) s.w = 700;
  s.font = `${n.italic?'italic ':''}${s.w} ${s.size}px ${s.fam}`;
  return s;
}
function measure(n){
  const s = nstyle(n); n._s = s;
  const lines = wrap(n.text || '', s.font, s.max);
  mctx.font = s.font;
  let tw = Math.max(s.box ? 26 : 18, ...lines.map(l => mctx.measureText(l).width));
  const big = n.sticker && n._d <= 1, inl = n.sticker && !big;
  let left = 0, right = 0;
  if (n.task != null) left += 22;
  if (inl) left += s.size + 8;
  n._prog = (n._tt && n.task == null) ? {t:n._tt, d:n._td} : null;
  if (n._prog) right += 22;
  if (n.note) right += 18;
  const stH = big ? (n._d === 0 ? 40 : 32) : 0;
  n._lines = lines; n._tw = Math.ceil(tw); n._left = left; n._stH = stH;
  n._w = Math.ceil(tw + left + right + s.px * 2);
  n._h = Math.ceil(lines.length * s.lh + s.py * 2 + stH) + (s.box ? 0 : 2);
  if (n.shape === 'pill' && s.box) s.r = Math.min(n._h / 2, 22);
  n._tx = s.px + left; n._ty = s.py + stH;
}

/* ---------- layout ---------- */
const HG = d => d === 0 ? 56 : d === 1 ? 42 : 30;
const VG = d => d === 0 ? 20 : d === 1 ? 10 : 6;
function assignColors(n, color){
  const pal = TC().palette;
  n._color = n._d === 0 ? (n.color || null) : (n.color || color);
  kids(n).forEach((c, i) => assignColors(c, n._d === 0 ? (c.color || pal[i % pal.length]) : n._color));
}
function subH(n){
  const ks = kids(n); measure(n);
  if (!ks.length) return n._sh = n._h;
  const t = ks.reduce((a,c)=>a+subH(c),0) + VG(n._d) * (ks.length-1);
  return n._sh = Math.max(n._h, t);
}
function place(n, x, top, side){
  n._side = side; n._x = side > 0 ? x : x - n._w; n._y = top + (n._sh - n._h) / 2;
  const ks = kids(n); if (!ks.length) return;
  const tot = ks.reduce((a,c)=>a+c._sh,0) + VG(n._d)*(ks.length-1);
  let cy = top + (n._sh - tot) / 2;
  const cx = side > 0 ? n._x + n._w + HG(n._d) : n._x - HG(n._d);
  for (const c of ks){ place(c, cx, cy, side); cy += c._sh + VG(n._d); }
}
function shift(n, dx, dy){ n._x += dx; n._y += dy; kids(n).forEach(c => shift(c, dx, dy)); }
function listLay(n){ // indented list used under each column in tree layout
  measure(n); n._x = 0; n._y = 0; n._side = 0;
  let y = n._h + 8, w = n._w; const ks = kids(n);
  for (const c of ks){ const r = listLay(c); shift(c, 22, y); y += r.h + 4; w = Math.max(w, 22 + r.w); }
  return {w, h: ks.length ? y - 4 : n._h};
}
function layout(){
  vis = [];
  for (const r of doc.roots){
    r.x = r.x ?? 0; r.y = r.y ?? 0;
    assignColors(r, null); measure(r);
    r._x = r.x - r._w/2; r._y = r.y - r._h/2; r._side = 1;
    const ks = kids(r);
    if (doc.layout === 'tree'){
      const cols = ks.map(c => ({c, ...listLay(c)}));
      const total = cols.reduce((a,c)=>a+c.w,0) + 36*Math.max(0, cols.length-1);
      let x = r.x - total/2; const top = r._y + r._h + 54;
      for (const col of cols){ shift(col.c, x, top); x += col.w + 36; }
    } else {
      ks.forEach(subH);
      let right = ks, left = [];
      if (doc.layout === 'map' && ks.length > 1){
        const total = ks.reduce((a,c)=>a+c._sh,0); let acc = 0, i = 0;
        while (i < ks.length && (acc + ks[i]._sh/2) <= total/2 + 1){ acc += ks[i]._sh; i++; }
        i = Math.max(1, i); right = ks.slice(0, i); left = ks.slice(i).reverse();
      }
      const stack = (arr, side) => {
        const tot = arr.reduce((a,c)=>a+c._sh,0) + VG(0)*Math.max(0, arr.length-1);
        let y = r.y - tot/2; const x = side > 0 ? r._x + r._w + HG(0) : r._x - HG(0);
        for (const c of arr){ place(c, x, y, side); y += c._sh + VG(0); }
      };
      stack(right, 1); stack(left, -1);
    }
    const collect = n => { vis.push(n); kids(n).forEach(collect); };
    collect(r);
  }
}

/* ---------- scene ---------- */
const boxed = n => n._s.box;
function outA(p, s){
  if (p._d === 0) return [s > 0 ? p._x + p._w - 8 : p._x + 8, p._y + p._h/2];
  if (boxed(p)) return [s > 0 ? p._x + p._w - 2 : p._x + 2, p._y + p._h/2];
  return [s > 0 ? p._x + p._w : p._x, p._y + p._h - 1];
}
function inA(c){
  const s = c._side;
  if (boxed(c)) return [s > 0 ? c._x + 1 : c._x + c._w - 1, c._y + c._h/2];
  return [s > 0 ? c._x : c._x + c._w, c._y + c._h - 1];
}
function taper(a, b, w1, w2){
  const dx = b[0] - a[0], c1 = [a[0]+dx*.5, a[1]], c2 = [b[0]-dx*.5, b[1]], h1 = w1/2, h2 = w2/2;
  const f = v => +v.toFixed(1);
  return `M${f(a[0])} ${f(a[1]-h1)}C${f(c1[0])} ${f(c1[1]-h1)} ${f(c2[0])} ${f(c2[1]-h2)} ${f(b[0])} ${f(b[1]-h2)}L${f(b[0])} ${f(b[1]+h2)}C${f(c2[0])} ${f(c2[1]+h2)} ${f(c1[0])} ${f(c1[1]+h1)} ${f(a[0])} ${f(a[1]+h1)}Z`;
}
function elbow(a, b){
  const dx = b[0]-a[0], dy = b[1]-a[1], sx = Math.sign(dx)||1, sy = Math.sign(dy);
  const mx = a[0] + dx/2, r = Math.min(10, Math.abs(dy)/2, Math.abs(dx)/2);
  if (Math.abs(dy) < 1) return `M${a[0]} ${a[1]}H${b[0]}`;
  return `M${a[0]} ${a[1]}H${mx-sx*r}Q${mx} ${a[1]} ${mx} ${a[1]+sy*r}V${b[1]-sy*r}Q${mx} ${b[1]} ${mx+sx*r} ${b[1]}H${b[0]}`;
}
function branchItems(p, c, op){
  const col = c._color || TC().conn;
  if (doc.layout === 'tree'){
    if (p._d === 0){
      const rx = p._x + p._w/2, rb = p._y + p._h, cx = c._x + Math.min(c._w/2, 40), top = c._y, my = rb + (top - rb)/2;
      const s = Math.sign(cx - rx), r = Math.min(10, Math.abs(cx-rx)/2, (top-rb)/4);
      const d = Math.abs(cx - rx) < 1 ? `M${rx} ${rb}V${top}` :
        `M${rx} ${rb}V${my-r}Q${rx} ${my} ${rx+s*r} ${my}H${cx-s*r}Q${cx} ${my} ${cx} ${my+r}V${top}`;
      return [{t:'path', d, stroke:col, sw:3, op}];
    }
    const px = p._x + 10, py = p._y + p._h, cy = boxed(c) ? c._y + c._h/2 : c._y + c._h - 1, cx = c._x;
    return [{t:'path', d:`M${px} ${py}V${cy-7}Q${px} ${cy} ${px+7} ${cy}H${cx}`, stroke:col, sw:p._d===1?2.2:1.8, op}];
  }
  const a = outA(p, c._side), b = inA(c);
  if (doc.branch === 'elbow') return [{t:'path', d:elbow(a,b), stroke:col, sw:p._d===0?3.2:p._d===1?2.4:1.8, op}];
  const w1 = p._d===0?7:p._d===1?3.6:2.4, w2 = p._d===0?3.4:p._d===1?2.2:1.8;
  return [{t:'path', d:taper(a,b,w1,w2), fill:col, op}];
}
function badgePos(n){
  if (n._d === 0) return [n._w/2, n._h + 13];
  if (doc.layout === 'tree') return [10, n._h + 11];
  const y = boxed(n) ? n._h/2 : n._h - 1;
  return [n._side > 0 ? n._w + 11 : -11, y];
}
function nodeGroup(n, opts){
  const tc = TC(), th = T(), s = n._s, items = [], d = n._d, col = n._color || tc.conn;
  let fill, stroke, sw = 0, txt = tc.text;
  if (d === 0){ fill = n.color || tc.rootFill; txt = n.color ? textOn(n.color) : tc.rootText; if (th.grid) { stroke = tc.rootText; sw = 0; } }
  else if (s.box){
    if (d === 1 && th.l1 === 'fill' && n.shape !== 'outline'){ fill = col; txt = textOn(col); }
    else if (d === 1){ fill = tc.card; stroke = col; sw = 2; }
    else { fill = mix(col, tc.bg, uiMode()==='dark' ? .7 : .72); txt = tc.text; }
  }
  if (s.box){
    if (d === 0) items.push({t:'rect', x:0, y:3, w:n._w, h:n._h, r:s.r, fill:'#000000', op:uiMode()==='dark'?.35:.07});
    items.push({t:'rect', x:0, y:0, w:n._w, h:n._h, r:s.r, fill, stroke, sw});
  } else items.push({t:'rect', x:0, y:n._h-2.1, w:n._w, h:2.2, r:1.1, fill:col});
  const done = n.task === true;
  if (n.sticker){
    if (d <= 1) items.push({t:'text', x:n._w/2, y:s.py + (d===0?31:25), s:n.sticker, font:`${d===0?30:23}px ${FE}`, fill:txt, anchor:'middle'});
    else items.push({t:'text', x:s.px + (n.task!=null?22:0), y:n._ty + s.lh*.5 + s.size*.36, s:n.sticker, font:`${s.size}px ${FE}`, fill:txt});
  }
  if (n.task != null){
    const cy = n._ty + s.lh/2 - 7, cc = d===1 && fill===col ? txt : col;
    items.push({t:'g', x:s.px, y:cy, act:'task', items:[
      {t:'rect', x:-4, y:-4, w:22, h:22, fill:'#000000', op:0},
      {t:'rect', x:0, y:0, w:14, h:14, r:3.5, fill: done ? cc : (fill || tc.bg), stroke:cc, sw:1.6},
      ...(done ? [{t:'path', d:'M3.6 7.3l2.4 2.4 4.5-5', stroke: d===1&&fill===col ? fill : textOn(cc), sw:1.8}] : [])
    ]});
  }
  const ax = s.mid ? n._tx + n._tw/2 : n._tx;
  n._lines.forEach((l, i) => {
    const y = n._ty + i*s.lh + s.lh/2 + s.size*.36;
    items.push({t:'text', x:ax, y, s:l, font:s.font, fill:txt, anchor:s.mid?'middle':'start', op:done?.5:1});
    if (done && l){ mctx.font = s.font; const w = mctx.measureText(l).width, x0 = s.mid ? ax - w/2 : ax;
      items.push({t:'rect', x:x0, y:y - s.size*.32, w, h:1.4, fill:txt, op:.55}); }
  });
  let rx = n._tx + n._tw + 6;
  if (n._prog){
    const cx = rx + 8, cy = n._ty + s.lh/2, f = n._prog.d / n._prog.t, rc = d===1&&fill===col ? txt : col;
    items.push({t:'circle', cx, cy, r:6, stroke:rc, sw:2, op:.3});
    if (f >= 1) items.push({t:'circle', cx, cy, r:6, stroke:rc, sw:2});
    else if (f > 0){ const a = f*Math.PI*2 - Math.PI/2, x2 = cx + 6*Math.cos(a), y2 = cy + 6*Math.sin(a);
      items.push({t:'path', d:`M${cx} ${cy-6}A6 6 0 ${f>.5?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`, stroke:rc, sw:2}); }
    rx += 22;
  }
  if (n.note){
    const nx = rx + 2, ny = n._ty + s.lh/2 - 6, nc = d===1&&fill===col ? txt : tc.text;
    items.push({t:'g', x:nx, y:ny, items:[{t:'rect', x:0, y:0, w:10, h:12, r:2, stroke:nc, sw:1.2, op:.7},
      {t:'path', d:'M2.6 4h4.8M2.6 6.5h4.8M2.6 9h3', stroke:nc, sw:1.1, op:.7}]});
  }
  if (!opts.export){
    if (n.children.length && (n.collapsed || sel === n.id)){
      const [bx, by] = badgePos(n), lbl = n.collapsed ? String(countDesc(n)) : '–';
      items.push({t:'g', x:bx, y:by, act:'fold', items:[
        {t:'circle', cx:0, cy:0, r:n.collapsed ? 9 : 7.5, fill:tc.bg, stroke:d===0 ? tc.conn : col, sw:1.6},
        {t:'text', x:0, y:n.collapsed?3.6:4, s:lbl, font:`700 ${n.collapsed?10:12}px ${FU}`, fill:tc.text, anchor:'middle'}]});
    }
    if ((hoverId === n.id || sel === n.id) && !readOnly && !editing && !(drag && drag.moved) && !connectFrom){
      const badge = n.children.length && (n.collapsed || sel === n.id);
      let px, py;
      if (n._d === 0){ px = n._w/2 + (badge ? 24 : 0); py = n._h + 13; }
      else if (doc.layout === 'tree'){ px = n._w + 14; py = boxed(n) ? n._h/2 : n._h - 1; }
      else { const [bx, by] = badgePos(n); px = bx + n._side * (badge ? 22 : 6); py = by; }
      // invisible bridge so the pointer can travel from the node to the button without losing hover
      const x0 = Math.min(0, px-12), x1 = Math.max(n._w, px+12), y0 = Math.min(0, py-12), y1 = Math.max(n._h, py+12);
      items.unshift({t:'rect', x:x0, y:y0, w:x1-x0, h:y1-y0, fill:'#000000', op:0});
      const bc = d === 0 ? tc.conn : col;
      items.push({t:'g', x:px, y:py, act:'add', items:[
        {t:'circle', cx:0, cy:0, r:12, fill:'#000000', op:0},
        {t:'circle', cx:0, cy:0, r:9, fill:bc},
        {t:'path', d:'M-4 0H4M0 -4V4', stroke:textOn(bc), sw:1.8}]});
    }
    if (search.hits.includes(n.id)) items.push({t:'rect', x:-5, y:-5, w:n._w+10, h:n._h+10, r:s.r+5, stroke:'#f0a020', sw:2.5, dash:'5 4'});
    if (sel === n.id) items.push({t:'rect', x:-4, y:-4, w:n._w+8, h:n._h+8, r:s.box?s.r+4:7, stroke:getSel(), sw:2.2});
    if (connectFrom === n.id) items.push({t:'rect', x:-6, y:-6, w:n._w+12, h:n._h+12, r:s.r+6, stroke:getSel(), sw:1.5, dash:'4 4'});
    if (dropInfo && dropInfo.target === n){
      if (dropInfo.mode === 'child') items.push({t:'rect', x:-5, y:-5, w:n._w+10, h:n._h+10, r:s.r+5, stroke:getSel(), sw:2.5, dash:'6 4'});
      else items.push({t:'rect', x:-4, y:dropInfo.mode==='before'?-7:n._h+4, w:n._w+8, h:3, r:1.5, fill:getSel()});
    }
  } else if (n.collapsed && n.children.length){
    const [bx, by] = badgePos(n);
    items.push({t:'circle', cx:bx, cy:by, r:9, fill:tc.bg, stroke:d===0?tc.conn:col, sw:1.6},
      {t:'text', x:bx, y:by+3.6, s:String(countDesc(n)), font:`700 10px ${FU}`, fill:tc.text, anchor:'middle'});
  }
  return {t:'g', id:n.id, x:n._x, y:n._y, items, op:opts.op};
}
let selColor = null;
const getSel = () => selColor || (selColor = getComputedStyle(document.documentElement).getPropertyValue('--sel').trim() || '#2f86f6');
function edgePt(n, tx, ty){
  const cx = n._x + n._w/2, cy = n._y + n._h/2, dx = tx - cx, dy = ty - cy;
  const s = Math.min(dx ? (n._w/2+4)/Math.abs(dx) : 1e9, dy ? (n._h/2+4)/Math.abs(dy) : 1e9);
  return [cx + dx*s, cy + dy*s];
}
function connItems(c, opts){
  const a = byId[c.from], b = byId[c.to];
  if (!a || !b || !vis.includes(a) || !vis.includes(b)) return [];
  const ac = [a._x+a._w/2, a._y+a._h/2], bc = [b._x+b._w/2, b._y+b._h/2];
  const p1 = edgePt(a, ...bc), p2 = edgePt(b, ...ac);
  const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2, dx = p2[0]-p1[0], dy = p2[1]-p1[1], L = Math.hypot(dx,dy)||1;
  const k = Math.min(.25 * L, 80), q = [mx - dy/L*k, my + dx/L*k];
  const d = `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  const ang = Math.atan2(p2[1]-q[1], p2[0]-q[0]), al = 9;
  const h1 = [p2[0] - al*Math.cos(ang-.42), p2[1] - al*Math.sin(ang-.42)], h2 = [p2[0] - al*Math.cos(ang+.42), p2[1] - al*Math.sin(ang+.42)];
  const col = (!opts.export && selConn === c.id) ? getSel() : TC().conn;
  return [{t:'g', conn:c.id, op:opts.op, items:[
    {t:'path', d, stroke:col, sw:1.8, dash:'6 5'},
    {t:'path', d:`M${h1[0].toFixed(1)} ${h1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}L${h2[0].toFixed(1)} ${h2[1].toFixed(1)}`, stroke:col, sw:1.8},
    ...(opts.export ? [] : [{t:'path', d, stroke:'#000000', sw:14, op:0}])]}];
}
function focusSet(){
  if (!focusMode || !sel || !byId[sel]) return null;
  const set = new Set(), n = byId[sel];
  for (let p = n; p; p = parentOf[p.id]) set.add(p.id);
  const w = x => { set.add(x.id); x.children.forEach(w); }; w(n);
  return set;
}
function buildScene(opts = {}){
  const fs = opts.export ? null : focusSet();
  const dim = id => fs && !fs.has(id) ? .14 : (drag && drag.moved && drag.sub && drag.sub.has(id) ? .35 : 1);
  const br = [], cn = [], nd = [];
  for (const n of vis){
    for (const c of kids(n)) br.push(...branchItems(n, c, dim(c.id)));
    nd.push(nodeGroup(n, {export:opts.export, op:dim(n.id)}));
  }
  for (const c of (doc.connections||[])) cn.push(...connItems(c, {export:opts.export, op: fs && !(fs.has(c.from)&&fs.has(c.to)) ? .14 : 1}));
  return [...br, ...cn, ...nd];
}

/* ---------- renderers ---------- */
function svgOf(it){
  const a = (k, v) => v == null ? '' : ` ${k}="${esc(v)}"`;
  const op = it.op != null && it.op !== 1 ? a('opacity', it.op) : '';
  switch (it.t){
    case 'g': return `<g${a('data-id',it.id)}${a('data-act',it.act)}${a('data-conn',it.conn)} transform="translate(${(it.x||0).toFixed?(it.x||0).toFixed(1):0} ${(it.y||0).toFixed?(it.y||0).toFixed(1):0})"${op}>${it.items.map(svgOf).join('')}</g>`;
    case 'rect': return `<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"${a('rx',it.r)} fill="${esc(it.fill||'none')}"${a('stroke',it.stroke)}${a('stroke-width',it.stroke?it.sw:null)}${a('stroke-dasharray',it.dash)}${op}/>`;
    case 'circle': return `<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${esc(it.fill||'none')}"${a('stroke',it.stroke)}${a('stroke-width',it.sw)}${op}/>`;
    case 'path': return `<path d="${esc(it.d)}" fill="${esc(it.fill||'none')}"${a('stroke',it.stroke)}${a('stroke-width',it.stroke?it.sw:null)}${it.stroke?' stroke-linecap="round" stroke-linejoin="round"':''}${a('stroke-dasharray',it.dash)}${op}/>`;
    case 'text': return `<text x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" style="font:${esc(it.font)};white-space:pre" fill="${esc(it.fill)}"${a('text-anchor',it.anchor)}${op}>${esc(it.s)}</text>`;
  }
  return '';
}
function drawCanvas(ctx, it){
  ctx.save();
  if (it.op != null) ctx.globalAlpha *= it.op;
  const stroke = () => { if (it.stroke){ ctx.strokeStyle = it.stroke; ctx.lineWidth = it.sw || 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(it.dash ? it.dash.split(' ').map(Number) : []); ctx.stroke(); } };
  switch (it.t){
    case 'g': ctx.translate(it.x||0, it.y||0); it.items.forEach(i => drawCanvas(ctx, i)); break;
    case 'rect': ctx.beginPath(); ctx.roundRect ? ctx.roundRect(it.x, it.y, it.w, it.h, it.r||0) : ctx.rect(it.x, it.y, it.w, it.h);
      if (it.fill && it.fill !== 'none'){ ctx.fillStyle = it.fill; ctx.fill(); } stroke(); break;
    case 'circle': ctx.beginPath(); ctx.arc(it.cx, it.cy, it.r, 0, Math.PI*2); if (it.fill){ ctx.fillStyle = it.fill; ctx.fill(); } stroke(); break;
    case 'path': { const p = new Path2D(it.d); if (it.fill){ ctx.fillStyle = it.fill; ctx.fill(p); }
      if (it.stroke){ ctx.strokeStyle = it.stroke; ctx.lineWidth = it.sw||1; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.setLineDash(it.dash ? it.dash.split(' ').map(Number) : []); ctx.stroke(p); } break; }
    case 'text': ctx.font = it.font; ctx.fillStyle = it.fill; ctx.textAlign = it.anchor === 'middle' ? 'center' : 'left'; ctx.fillText(it.s, it.x, it.y); break;
  }
  ctx.restore();
}
function bounds(){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of vis){ x0 = Math.min(x0, n._x-14); y0 = Math.min(y0, n._y-14); x1 = Math.max(x1, n._x+n._w+14); y1 = Math.max(y1, n._y+n._h+24); }
  if (!isFinite(x0)) return {x:0, y:0, w:1, h:1};
  return {x:x0, y:y0, w:x1-x0, h:y1-y0};
}

/* ---------- render ---------- */
function applyView(){ vp.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); $('#zoomPct').textContent = Math.round(view.k*100) + '%'; positionEditor(); }
function render(){
  if (!doc) return;
  index(); layout();
  vp.innerHTML = buildScene().map(svgOf).join('');
  const tc = TC();
  stage.style.backgroundColor = tc.bg;
  stage.style.backgroundImage = T().grid ? `linear-gradient(${tc.conn}22 1px, transparent 1px), linear-gradient(90deg, ${tc.conn}22 1px, transparent 1px)` : 'none';
  stage.style.backgroundSize = `${24*view.k}px ${24*view.k}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
  svg.classList.toggle('connecting', !!connectFrom);
  applyView();
}

/* ---------- view ---------- */
function fit(animate){
  render();
  const b = bounds(), W = stage.clientWidth, H = stage.clientHeight;
  const k = clamp(Math.min((W-48)/b.w, (H-48)/b.h), .2, 1.15);
  setView({k, x: W/2 - (b.x + b.w/2)*k, y: H/2 - (b.y + b.h/2)*k}, animate);
}
function setView(v, animate){
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches){ Object.assign(view, v); render(); return; }
  const from = {...view}, t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0)/260), e = 1 - Math.pow(1-p, 3);
    view.x = from.x + (v.x-from.x)*e; view.y = from.y + (v.y-from.y)*e; view.k = from.k + (v.k-from.k)*e; render();
    if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function zoomAt(f, sx, sy){
  const k = clamp(view.k * f, .15, 3);
  if (sx == null){ sx = stage.clientWidth/2; sy = stage.clientHeight/2; }
  view.x = sx - (sx - view.x) * (k/view.k); view.y = sy - (sy - view.y) * (k/view.k); view.k = k; render();
}
function ensureVisible(n){
  if (!n || !vis.includes(n)) return;
  const W = stage.clientWidth, H = stage.clientHeight, m = 40;
  const x0 = n._x*view.k + view.x, y0 = n._y*view.k + view.y, x1 = x0 + n._w*view.k, y1 = y0 + n._h*view.k;
  let dx = 0, dy = 0;
  if (x0 < m) dx = m - x0; else if (x1 > W - m) dx = (W - m) - x1;
  if (y0 < m) dy = m - y0; else if (y1 > H - m) dy = (H - m) - y1;
  if (dx || dy) setView({x:view.x+dx, y:view.y+dy, k:view.k}, true);
}
const toMap = (sx, sy) => [(sx - view.x)/view.k, (sy - view.y)/view.k];
const stageXY = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

/* ---------- history & persistence ---------- */
function snapshot(){ undoStack.push(ser(doc)); if (undoStack.length > 300) undoStack.shift(); redoStack.length = 0; }
function change(fn, opts = {}){
  if (readOnly && !opts.viewOk) return toast(MODE === 'viewer' ? 'This map is read-only' : 'This map is open for editing in another tab');
  if (editing) endEdit();
  snapshot(); fn(); commit(opts);
}
function commit(opts = {}){ save(); render(); renderOutline(); renderInspector(true); if (opts.reveal && byId[sel]) ensureVisible(byId[sel]); }
function undo(){ if (readOnly) return; if (editing) endEdit(); if (!undoStack.length) return toast('Nothing to undo'); redoStack.push(ser(doc)); doc = JSON.parse(undoStack.pop()); fixSel(); commit(); }
function redo(){ if (readOnly) return; if (editing) endEdit(); if (!redoStack.length) return toast('Nothing to redo'); undoStack.push(ser(doc)); doc = JSON.parse(redoStack.pop()); fixSel(); commit(); }
function fixSel(){ index(); if (sel && !byId[sel]) sel = null; if (selConn && !(doc.connections||[]).some(c=>c.id===selConn)) selConn = null; }

const IDX = 'sprig.index', LAST = 'sprig.last';
// In server mode the map list and opened maps are held in memory (Remote) and written through the outbox.
function getIndex(){ if (MODE !== 'local') return Remote.index; try { return JSON.parse(store.get(IDX) || mem[IDX] || '[]'); } catch(e){ return []; } }
function putIndex(ix){ if (MODE !== 'local'){ Remote.index = ix; return; } const s = JSON.stringify(ix); mem[IDX] = s; store.set(IDX, s); }
function readDoc(id){ if (MODE !== 'local') return Remote.docs.get(id) || null; try { return JSON.parse(store.get('sprig.doc.'+id) || mem['sprig.doc.'+id]); } catch(e){ return null; } }
function writeDoc(d){ if (MODE === 'server'){ Remote.docs.set(d.id, d); Sync.kick(d.id); return; } if (MODE !== 'local') return; const s = ser(d); mem['sprig.doc.'+d.id] = s; store.set('sprig.doc.'+d.id, s); }
function removeDoc(id){ if (MODE === 'server'){ Remote.docs.delete(id); Sync.remove(id); return; } store.del('sprig.doc.'+id); delete mem['sprig.doc.'+id]; }
let saveT;
function save(){
  if (readOnly || !doc) return;
  if (MODE === 'server') Outbox.stash(doc); // every change reaches the outbox at once; only the network send waits
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    doc.updated = Date.now(); writeDoc(doc);
    let count = 0; walkAll(() => count++);
    const ix = getIndex().filter(e => e.id !== doc.id);
    ix.unshift({id:doc.id, title:doc.title || 'Untitled map', updated:doc.updated, count, theme:doc.theme});
    putIndex(ix); renderDocs();
  }, 250);
}
function flushSave(){ if (saveT && !readOnly){ clearTimeout(saveT); saveT = null; doc.updated = Date.now(); writeDoc(doc); let count=0; walkAll(()=>count++);
  const ix = getIndex().filter(e => e.id !== doc.id); ix.unshift({id:doc.id, title:doc.title||'Untitled map', updated:doc.updated, count, theme:doc.theme}); putIndex(ix); } }
function openDoc(d, opts = {}){
  if (editing) endEdit(); flushSave();
  doc = sanitizeDoc(d);
  undoStack = []; redoStack = []; sel = doc.roots[0] ? doc.roots[0].id : null; selConn = null; connectFrom = null; closeSearch();
  store.set(LAST, doc.id); mem[LAST] = doc.id;
  $('#title').value = doc.title || '';
  fit(false); renderOutline(); renderInspector(true); renderDocs();
  if (opts.save) save();
  if (MODE === 'server') Remote.opened(doc);
}
// Maps can come from imported files or the network, so every field is coerced to a known-safe value (sanitize.js).
const sanitizeDoc = d => SprigSanitize.sanitizeDoc(d, {themeIds:Object.keys(THEMES), makeId:uid});
function newDoc(roots, extra){
  const d = Object.assign({id:uid(), title:'', theme:'meadow', layout:'map', branch:'curve', roots, connections:[]}, extra||{});
  if (!d.title) d.title = (roots[0] && roots[0].text) || 'Untitled map';
  return d;
}

/* ---------- operations ---------- */
function addChild(target, edit = true){
  const n = target || byId[sel]; if (!n) return addRootAt(0, 0);
  const c = N('');
  change(() => { n.children.push(c); n.collapsed = false; sel = c.id; selConn = null; }, {reveal:true});
  if (edit) startEdit(c.id, null, true);
}
function addSibling(){
  const n = byId[sel]; if (!n) return;
  if (!parentOf[n.id]) return addChild(n);
  const c = N(''), arr = sibs(n);
  change(() => { arr.splice(arr.indexOf(n)+1, 0, c); sel = c.id; }, {reveal:true});
  startEdit(c.id, null, true);
}
function addRootAt(x, y){
  const r = N('', {x, y});
  change(() => { doc.roots.push(r); sel = r.id; });
  startEdit(r.id, null, true);
}
function deleteSel(){
  if (selConn){ change(() => { doc.connections = doc.connections.filter(c => c.id !== selConn); selConn = null; }); return; }
  const n = byId[sel]; if (!n) return;
  const arr = sibs(n), i = arr.indexOf(n), p = parentOf[n.id];
  if (!p && doc.roots.length === 1){ toast('A map needs at least one main node'); return; }
  change(() => {
    arr.splice(i, 1);
    const gone = new Set(); const w = x => { gone.add(x.id); x.children.forEach(w); }; w(n);
    doc.connections = doc.connections.filter(c => !gone.has(c.from) && !gone.has(c.to));
    sel = (arr[i] || arr[i-1] || p || doc.roots[0]).id;
  });
}
function moveSel(dir){
  const n = byId[sel]; if (!n || !parentOf[n.id]) return;
  const arr = sibs(n), i = arr.indexOf(n), j = i + dir;
  if (j < 0 || j >= arr.length) return;
  change(() => { arr.splice(i, 1); arr.splice(j, 0, n); });
}
function toggleFold(n){ n = n || byId[sel]; if (!n || !n.children.length) return; change(() => { n.collapsed = !n.collapsed; }, {viewOk:true}); }
function cycleTask(n){
  n = n || byId[sel]; if (!n) return;
  change(() => { if (n.task == null) n.task = false; else if (n.task === false) n.task = true; else delete n.task; });
}
function toggleDone(n){ change(() => { n.task = !n.task; }); }
function reparent(n, target, mode){
  change(() => {
    const from = sibs(n); from.splice(from.indexOf(n), 1);
    if (!parentOf[n.id]){ delete n.x; delete n.y; }
    if (mode === 'child'){ target.children.push(n); target.collapsed = false; }
    else { const arr = sibs(target); arr.splice(arr.indexOf(target) + (mode === 'after' ? 1 : 0), 0, n); }
    sel = n.id;
  });
}
function detach(n, x, y){
  change(() => { const from = sibs(n); from.splice(from.indexOf(n), 1); n.x = x; n.y = y; doc.roots.push(n); sel = n.id; });
}
function addConnection(a, b){
  if (a === b) return;
  if (doc.connections.some(c => (c.from===a&&c.to===b))) return toast('Those nodes are already connected');
  change(() => { const c = {id:uid(), from:a, to:b}; doc.connections.push(c); selConn = c.id; sel = null; });
  toast('Cross connection added');
}
function startConnect(){
  if (connectFrom){ cancelConnect(); return; }
  if (!sel) return toast('Select a node first, then connect it to another');
  connectFrom = sel; $('#bConnect').setAttribute('aria-pressed', 'true');
  showHint('Click another node to connect it · Esc cancels'); render();
}
function cancelConnect(){ connectFrom = null; $('#bConnect').setAttribute('aria-pressed', 'false'); hideHint(); render(); }
function showHint(t){ const h = $('#hint'); h.textContent = t; h.hidden = false; }
function hideHint(){ $('#hint').hidden = true; }
function select(id){ sel = id; selConn = null; render(); renderInspector(); highlightOutline(); }

/* ---------- editing ---------- */
function startEdit(id, replaceWith, fresh){
  const n = byId[id]; if (!n) return;
  if (readOnly) return;
  if (editing) endEdit();
  if (!fresh) snapshot();
  editing = {id, orig:n.text, fresh};
  if (replaceWith != null) n.text = replaceWith;
  sel = id; render();
  ed.hidden = false; ed.value = n.text;
  positionEditor(); ed.focus({preventScroll:true});
  if (replaceWith == null) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length);
  ensureVisible(n);
}
function positionEditor(){
  if (!editing) return;
  const n = byId[editing.id]; if (!n || !n._s) return;
  const s = n._s, k = view.k, tc = TC();
  const color = n._d === 0 ? (n.color ? textOn(n.color) : tc.rootText) : (n._d===1 && s.box && T().l1==='fill' && n.shape!=='outline') ? textOn(n._color) : tc.text;
  Object.assign(ed.style, {
    left: (view.x + (n._x + n._tx - 2)*k) + 'px', top: (view.y + (n._y + n._ty)*k) + 'px',
    width: ((n._tw + 6)*k) + 'px', height: (n._lines.length*s.lh*k + 2) + 'px',
    font: `${n.italic?'italic ':''}${s.w} ${s.size*k}px/${s.lh*k}px ${s.fam}`,
    textAlign: s.mid ? 'center' : 'left', color, paddingLeft: (2*k)+'px'
  });
  // hide the node's own text while editing
  const g = vp.querySelector(`[data-id="${n.id}"]`);
  if (g) g.querySelectorAll(':scope > text').forEach(t => { if (!t.style.font.includes('Emoji')) t.setAttribute('opacity', 0); });
}
function endEdit(cancel){
  if (!editing) return;
  const e = editing, n = byId[e.id]; editing = null; ed.hidden = true;
  if (n){
    if (cancel) n.text = e.orig;
    n.text = n.text.replace(/\s+$/,'');
    if (!e.fresh && n.text === e.orig) undoStack.pop();
    if (!parentOf[n.id] && doc.roots[0] === n && (!doc.title || doc.title === e.orig || doc.title === 'Untitled map') && n.text){ doc.title = n.text; $('#title').value = n.text; }
  }
  save(); render(); renderOutline(); renderInspector(true);
  svg.focus({preventScroll:true});
}
ed.addEventListener('input', () => { const n = byId[editing && editing.id]; if (!n) return; n.text = ed.value; render(); });
ed.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); endEdit(); }
  else if (e.key === 'Escape'){ e.preventDefault(); endEdit(); }
  else if (e.key === 'Tab'){ e.preventDefault(); const id = editing.id; endEdit(); if (e.shiftKey) return; addChild(byId[id]); }
  e.stopPropagation();
});
ed.addEventListener('blur', () => { setTimeout(() => { if (editing && document.activeElement !== ed) endEdit(); }, 0); });

/* ---------- pointer interaction ---------- */
svg.setAttribute('tabindex', '0');
function nodeAt(mx, my, exclude){
  for (let i = vis.length - 1; i >= 0; i--){
    const n = vis[i]; if (exclude && exclude.has(n.id)) continue;
    if (mx >= n._x-6 && mx <= n._x+n._w+6 && my >= n._y-6 && my <= n._y+n._h+6) return n;
  }
  return null;
}
svg.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, stageXY(e));
  if (pointers.size === 2){ // pinch
    drag = null; const [a, b] = [...pointers.values()];
    pan = {pinch:true, d:Math.hypot(a[0]-b[0], a[1]-b[1]), k:view.k, cx:(a[0]+b[0])/2, cy:(a[1]+b[1])/2, vx:view.x, vy:view.y}; return;
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (editing) endEdit();
  const [sx, sy] = stageXY(e), now = performance.now();
  const act = e.target.closest('[data-act]'), g = e.target.closest('[data-id]'), cg = e.target.closest('[data-conn]');
  const id = g ? g.dataset.id : null;
  const dbl = now - lastDown.t < 380 && lastDown.id === id && Math.hypot(sx-lastDown.x, sy-lastDown.y) < 6;
  lastDown = {t: dbl ? 0 : now, id, x:sx, y:sy};
  e.preventDefault(); // keep focus where we put it (e.g. the node editor)
  if (act && id){
    const n = byId[id];
    if (act.dataset.act === 'fold') toggleFold(n);
    else if (act.dataset.act === 'task') toggleDone(n);
    else if (act.dataset.act === 'add'){ hoverId = null; if (e.shiftKey && parentOf[id]){ sel = id; addSibling(); } else addChild(n); }
    return;
  }
  if (connectFrom){
    if (id && id !== connectFrom){ const f = connectFrom; cancelConnect(); addConnection(f, id); }
    else if (!id) cancelConnect();
    return;
  }
  if (id){
    if (dbl){ startEdit(id); return; }
    if (sel !== id) select(id);
    const n = byId[id], sub = new Set(); const w = x => { sub.add(x.id); x.children.forEach(w); }; w(n);
    if (!readOnly) drag = {n, sx, sy, moved:false, sub, root:!parentOf[id], ox:n.x, oy:n.y};
  } else if (cg){
    selConn = cg.dataset.conn; sel = null; render(); renderInspector(true);
  } else {
    if (dbl){ const [mx, my] = toMap(sx, sy); addRootAt(Math.round(mx), Math.round(my)); return; }
    pan = {sx, sy, vx:view.x, vy:view.y, moved:false};
  }
  svg.focus({preventScroll:true});
});
svg.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || drag || pan) return;
  const g = e.target.closest('[data-id]'), id = g ? g.dataset.id : null;
  if (id !== hoverId){ hoverId = id; render(); }
});
svg.addEventListener('pointerleave', () => { if (hoverId){ hoverId = null; render(); } });
window.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, stageXY(e));
  if (pan && pan.pinch && pointers.size === 2){
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]);
    const k = clamp(pan.k * d / pan.d, .15, 3);
    view.k = k; view.x = pan.cx - (pan.cx - pan.vx) * (k/pan.k); view.y = pan.cy - (pan.cy - pan.vy) * (k/pan.k); render(); return;
  }
  const [sx, sy] = stageXY(e);
  if (pan && !pan.pinch){
    if (!pan.moved && Math.hypot(sx-pan.sx, sy-pan.sy) > 3){ pan.moved = true; svg.classList.add('panning'); }
    if (pan.moved){ view.x = pan.vx + sx - pan.sx; view.y = pan.vy + sy - pan.sy; render(); }
    return;
  }
  if (!drag) return;
  if (!drag.moved && Math.hypot(sx-drag.sx, sy-drag.sy) > 5){ drag.moved = true; if (!drag.root) snapshotDrag(); else snapshot(); }
  if (!drag.moved) return;
  if (drag.root){
    drag.n.x = Math.round(drag.ox + (sx - drag.sx)/view.k); drag.n.y = Math.round(drag.oy + (sy - drag.sy)/view.k); render(); return;
  }
  const gh = $('#ghost'); gh.hidden = false; gh.textContent = drag.n.text || 'Empty node';
  gh.style.left = (sx + 12) + 'px'; gh.style.top = (sy + 10) + 'px';
  const [mx, my] = toMap(sx, sy), t = nodeAt(mx, my, drag.sub);
  let info = null;
  if (t){
    const rel = (my - t._y) / t._h;
    info = {target:t, mode: !parentOf[t.id] ? 'child' : rel < .28 ? 'before' : rel > .72 ? 'after' : 'child'};
  }
  if ((info && (!dropInfo || info.target !== dropInfo.target || info.mode !== dropInfo.mode)) || (!info && dropInfo)){ dropInfo = info; render(); }
  else if (!drag.rendered){ drag.rendered = true; render(); }
});
function snapshotDrag(){ /* snapshot taken by reparent/detach */ }
window.addEventListener('pointerup', e => {
  pointers.delete(e.pointerId);
  if (pan){ if (pan.pinch && pointers.size) return; svg.classList.remove('panning');
    if (!pan.pinch && !pan.moved && (sel || selConn)){ sel = null; selConn = null; render(); renderInspector(true); highlightOutline(); }
    pan = null; return; }
  if (!drag) return;
  const d = drag; drag = null; $('#ghost').hidden = true;
  if (!d.moved) return;
  if (d.root){ save(); render(); return; }
  const info = dropInfo; dropInfo = null;
  if (info) reparent(d.n, info.target, info.mode);
  else { const [sx, sy] = stageXY(e), [mx, my] = toMap(sx, sy); detach(d.n, Math.round(mx), Math.round(my)); }
});
window.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pan = null; drag = null; dropInfo = null; $('#ghost').hidden = true; render(); });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [sx, sy] = stageXY(e);
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), sx, sy);
  else { view.x -= e.deltaX; view.y -= e.deltaY; render(); }
}, {passive:false});

/* ---------- keyboard ---------- */
function nav(dir){
  const n = byId[sel];
  if (!n || !vis.includes(n)){ if (doc.roots[0]) select(doc.roots[0].id); return; }
  let t = null;
  const cy = x => x._y + x._h/2, cx = x => x._x + x._w/2;
  const closestY = arr => arr.reduce((b, c) => !b || Math.abs(cy(c)-cy(n)) < Math.abs(cy(b)-cy(n)) ? c : b, null);
  if (doc.layout !== 'tree' && (dir === 'left' || dir === 'right')){
    const s = dir === 'right' ? 1 : -1;
    if (n._d === 0) t = closestY(kids(n).filter(c => c._side === s));
    else if (n._side === s){
      if (n.collapsed && n.children.length){ change(() => { n.collapsed = false; }); }
      t = closestY(kids(n));
    } else t = parentOf[n.id];
  } else if (doc.layout === 'tree' && dir === 'left' && n._d > 1) t = parentOf[n.id];
  else if (doc.layout === 'tree' && dir === 'up' && n._d === 1) t = parentOf[n.id];
  else {
    const v = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]}[dir];
    let best = Infinity;
    for (const c of vis){
      if (c === n) continue;
      const dx = cx(c) - cx(n), dy = cy(c) - cy(n), along = dx*v[0] + dy*v[1];
      if (along <= 2) continue;
      const across = Math.abs(dx*v[1] + dy*v[0]), score = along + across * 2.5;
      if (score < best){ best = score; t = c; }
    }
  }
  if (t){ select(t.id); ensureVisible(t); }
}
const typingTarget = e => e.target.closest && e.target.closest('input, textarea, [contenteditable], select');
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey, k = e.key;
  if (document.querySelector('.modal:not([hidden])')){
    if (k === 'Escape') closeModals();
    if (mod && k === 'Enter' && !$('#mQuick').hidden) quickGo();
    return;
  }
  if (mod && k.toLowerCase() === 'z'){ if (typingTarget(e) && !e.target.closest('#olist')) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === 'f'){ e.preventDefault(); e.shiftKey ? toggleFocus() : openSearch(); return; }
  if (mod && k.toLowerCase() === 'e'){ e.preventDefault(); openQuick(); return; }
  if (mod && k === '2'){ e.preventDefault(); togglePanel('outline'); return; }
  if (mod && k.toLowerCase() === 'i' && !typingTarget(e)){ e.preventDefault(); togglePanel('inspector'); return; }
  if (typingTarget(e)) return;
  if (k === 'Escape'){ if (connectFrom) cancelConnect(); else if (focusMode) toggleFocus(); else if (!$('#search').hidden) closeSearch(); return; }
  if (mod){
    switch (k.toLowerCase()){
      case 'arrowup': e.preventDefault(); moveSel(-1); return;
      case 'arrowdown': e.preventDefault(); moveSel(1); return;
      case '/': case '.': e.preventDefault(); toggleFold(); return;
      case 'd': e.preventDefault(); cycleTask(); return;
      case 'l': e.preventDefault(); startConnect(); return;
      case '0': e.preventDefault(); fit(true); return;
      case '=': case '+': e.preventDefault(); zoomAt(1.2); return;
      case '-': e.preventDefault(); zoomAt(1/1.2); return;
      case 'b': if (sel){ e.preventDefault(); change(() => { byId[sel].bold = !byId[sel].bold; }); } return;
      case 'a': e.preventDefault(); return;
    }
    return;
  }
  switch (k){
    case 'Tab': e.preventDefault(); if (sel) addChild(); else if (doc.roots[0]) select(doc.roots[0].id); return;
    case 'Enter': e.preventDefault(); if (sel) addSibling(); return;
    case 'Backspace': case 'Delete': e.preventDefault(); deleteSel(); return;
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': e.preventDefault(); nav(k.slice(5).toLowerCase()); return;
    case ' ': case 'F2': e.preventDefault(); if (sel) startEdit(sel); return;
    case '?': e.preventDefault(); openModal('mHelp'); return;
  }
  if (k.length === 1 && sel && !e.altKey){ e.preventDefault(); startEdit(sel, k); }
});

/* ---------- clipboard ---------- */
let clip = null;
function toIndented(n, d = 0){ return '\t'.repeat(d) + (n.task!=null ? (n.task ? '[x] ' : '[ ] ') : '') + n.text.replace(/\n/g,' ') + '\n' + n.children.map(c => toIndented(c, d+1)).join(''); }
document.addEventListener('copy', e => {
  if (typingTarget(e) || !sel || !byId[sel]) return;
  const txt = toIndented(byId[sel]); clip = {txt, json:ser(byId[sel])};
  e.clipboardData.setData('text/plain', txt); e.preventDefault(); toast('Branch copied');
});
document.addEventListener('cut', e => {
  if (typingTarget(e) || !sel || !byId[sel]) return;
  const txt = toIndented(byId[sel]); clip = {txt, json:ser(byId[sel])};
  e.clipboardData.setData('text/plain', txt); e.preventDefault(); deleteSel();
});
document.addEventListener('paste', e => {
  if (typingTarget(e)) return;
  const txt = e.clipboardData.getData('text/plain'); if (!txt || !txt.trim()) return;
  e.preventDefault();
  const nodes = clip && clip.txt === txt ? [cloneFresh(JSON.parse(clip.json))] : parseOutline(txt);
  const target = byId[sel];
  change(() => {
    if (target){ target.children.push(...nodes); target.collapsed = false; }
    else { const b = bounds(); nodes.forEach((n, i) => { n.x = b.x + b.w + 160; n.y = b.y + 60 + i*80; doc.roots.push(n); }); }
    sel = nodes[0].id;
  }, {reveal:true});
});

/* ---------- parsing & export formats ---------- */
function parseOutline(text, rich){
  const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim());
  const out = [], stack = []; let base = 0;
  for (const raw of lines){
    const m = raw.match(/^(\s*)(.*)$/); let ind = m[1].replace(/\t/g, '    ').length, t = m[2].trim();
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h){ ind = (h[1].length-1)*1000; base = h[1].length*1000; t = h[2]; } else ind += base;
    t = t.replace(/^([-*+•]|\d+[.)])\s+/, '');
    const node = N('');
    const tk = t.match(/^\[([ xX])\]\s*/); if (tk){ node.task = tk[1] !== ' '; t = t.slice(tk[0].length); }
    if (rich){
      const st = t.match(/^\{(.+?)\}\s*/); if (st){ node.sticker = st[1]; t = t.slice(st[0].length); }
      const nt = t.split(' :: '); if (nt.length > 1){ t = nt[0]; node.note = nt.slice(1).join(' :: '); }
    }
    node.text = t;
    while (stack.length && stack[stack.length-1].ind >= ind) stack.pop();
    if (stack.length) stack[stack.length-1].node.children.push(node); else out.push(node);
    stack.push({ind, node});
  }
  return out;
}
function parseOPML(xml){
  const dom = new DOMParser().parseFromString(xml, 'text/xml');
  if (dom.querySelector('parsererror')) throw new Error('This OPML file is not valid XML.');
  const conv = el => { const n = N(el.getAttribute('text') || el.getAttribute('title') || ''); const note = el.getAttribute('_note'); if (note) n.note = note;
    const st = el.getAttribute('_status'); if (st === 'checked') n.task = true; else if (st === 'unchecked') n.task = false;
    n.children = [...el.children].filter(c => c.tagName === 'outline').map(conv); return n; };
  const body = dom.querySelector('body'); if (!body) throw new Error('This OPML file has no body.');
  const roots = [...body.children].filter(c => c.tagName === 'outline').map(conv);
  const title = (dom.querySelector('head > title') || {}).textContent;
  return {roots, title};
}
function toMarkdown(){
  let s = '';
  const w = (n, d) => {
    const t = (n.task!=null ? (n.task ? '[x] ' : '[ ] ') : '') + (n.sticker ? n.sticker + ' ' : '') + n.text.replace(/\n/g, ' ');
    if (d === 0) s += `# ${t}\n\n`; else s += '  '.repeat(d-1) + `- ${t}\n`;
    if (n.note) s += '  '.repeat(d) + `> ${n.note.replace(/\n/g, ' ')}\n`;
    n.children.forEach(c => w(c, d+1));
    if (d === 0) s += '\n';
  };
  doc.roots.forEach(r => w(r, 0)); return s.trim() + '\n';
}
function toOPML(){
  const x = s => esc(s).replace(/\n/g, '&#10;');
  const w = (n, d) => { const a = `text="${x(n.text)}"` + (n.note ? ` _note="${x(n.note)}"` : '') + (n.task!=null ? ` _status="${n.task?'checked':'unchecked'}"` : '');
    const pad = '  '.repeat(d+2);
    return n.children.length ? `${pad}<outline ${a}>\n${n.children.map(c=>w(c,d+1)).join('')}${pad}</outline>\n` : `${pad}<outline ${a}/>\n`; };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${x(doc.title||'')}</title></head>\n  <body>\n${doc.roots.map(r=>w(r,0)).join('')}  </body>\n</opml>\n`;
}
function exportScene(){
  // lay out with every branch as shown, without selection chrome
  index(); layout();
  const b = bounds(), pad = 40, tc = TC();
  return {b, pad, items:buildScene({export:true}), bg:tc.bg};
}
function toSVG(){
  const {b, pad, items, bg} = exportScene(), W = Math.ceil(b.w + pad*2), H = Math.ceil(b.h + pad*2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<rect width="100%" height="100%" fill="${bg}"/>\n<g transform="translate(${pad-b.x} ${pad-b.y})">${items.map(svgOf).join('')}</g>\n</svg>\n`;
}
function toPNG(){
  const {b, pad, items, bg} = exportScene(), scale = 2;
  const W = Math.ceil(b.w + pad*2), H = Math.ceil(b.h + pad*2);
  const max = 12000, sc = Math.min(scale, max / Math.max(W, H));
  const c = document.createElement('canvas'); c.width = Math.ceil(W*sc); c.height = Math.ceil(H*sc);
  const ctx = c.getContext('2d'); ctx.scale(sc, sc); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.translate(pad - b.x, pad - b.y); items.forEach(i => drawCanvas(ctx, i));
  return c;
}
const fileBase = () => (doc.title || 'Mind map').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Mind map';
function download(name, blob){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- export modal ---------- */
let exFmt = 'png', exCanvas = null;
function openExport(){ if (editing) endEdit(); openModal('mExport'); showExport(exFmt); }
function showExport(f){
  exFmt = f; document.querySelectorAll('#exFmt .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === f));
  const img = $('#exImg'), out = $('#exOut'), note = $('#exNote');
  if (f === 'png'){
    exCanvas = toPNG(); img.src = exCanvas.toDataURL('image/png'); img.hidden = false; out.hidden = true;
    note.textContent = `${exCanvas.width} × ${exCanvas.height} px at 2× resolution. If Download is blocked here, right-click the preview to save it.`;
  } else {
    img.hidden = true; out.hidden = false;
    out.value = f === 'svg' ? toSVG() : f === 'md' ? toMarkdown() : f === 'opml' ? toOPML() : f === 'txt' ? doc.roots.map(r => toIndented(r)).join('\n') : JSON.stringify(JSON.parse(ser(doc)), null, 2);
    note.textContent = {svg:'Vector image. Text uses the fonts installed on the viewing computer.', md:'Headings for main nodes, nested bullets for the rest. Tasks and notes are kept.', opml:'Opens in OmniOutliner, Logseq, Workflowy and most outliners. Notes and tasks are kept.', txt:'Tab-indented outline. Paste it into Quick Entry to rebuild the map.', json:'Complete map with styles, stickers and cross connections. Import it to restore everything.'}[f];
  }
  render();
}
$('#exFmt').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) showExport(b.dataset.v); });
$('#exCopy').addEventListener('click', () => {
  if (exFmt === 'png'){
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write){
      exCanvas.toBlob(bl => navigator.clipboard.write([new ClipboardItem({'image/png': bl})]).then(() => toast('Image copied'), () => toast('Copying images is blocked here. Right-click the preview instead.')));
    } else toast('Copying images is blocked here. Right-click the preview instead.');
    return;
  }
  const out = $('#exOut');
  (navigator.clipboard ? navigator.clipboard.writeText(out.value) : Promise.reject()).then(() => toast('Copied'), () => { out.focus(); out.select(); toast('Press ⌘C to copy the selected text'); });
});
$('#exSave').addEventListener('click', () => {
  const base = fileBase();
  if (exFmt === 'png') exCanvas.toBlob(bl => download(base + '.png', bl));
  else { const ext = {svg:'svg', md:'md', opml:'opml', txt:'txt', json:'sprig.json'}[exFmt], type = {svg:'image/svg+xml', opml:'text/x-opml', json:'application/json'}[exFmt] || 'text/plain';
    download(`${base}.${ext}`, new Blob([$('#exOut').value], {type})); }
});

/* ---------- import ---------- */
function importText(name, text){
  if (readOnly) return toast('This map is read-only');
  try {
    let d;
    if (/\.json$|\.sprig$/i.test(name) || /^\s*\{/.test(text)){
      const j = JSON.parse(text); if (!j.roots) throw new Error('This JSON file is not a Sprig map.');
      d = newDoc(j.roots, {title:j.title, theme:j.theme, layout:j.layout, branch:j.branch, connections:j.connections||[]});
      const re = new Map(); walkIds(d.roots, re); d.connections = d.connections.map(c => ({id:uid(), from:re.get(c.from), to:re.get(c.to)})).filter(c => c.from && c.to);
    } else if (/\.(opml|xml)$/i.test(name) || /^\s*<\?xml|<opml/i.test(text)){
      const o = parseOPML(text); if (!o.roots.length) throw new Error('This OPML file has no outline items.');
      d = newDoc(o.roots, {title:o.title});
    } else {
      const roots = parseOutline(text); if (!roots.length) throw new Error('The file is empty.');
      d = newDoc(roots, {title:name.replace(/\.[^.]+$/, '')});
    }
    spreadRoots(d.roots);
    openDoc(d, {save:true}); toast(`Imported “${d.title}”`);
  } catch(err){ toast(err.message || 'That file could not be read.'); }
}
function walkIds(arr, map){ for (const n of arr){ const old = n.id; n.id = uid(); map.set(old, n.id); walkIds(n.children || (n.children = []), map); } }
function spreadRoots(roots){ roots.forEach((r, i) => { if (r.x == null){ r.x = 0; r.y = i * 420; } }); }
$('#bImport').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => importText(f.name, t)); e.target.value = ''; });
stage.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
stage.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); f.text().then(t => importText(f.name, t)); });

/* ---------- quick entry ---------- */
let qeMode = 'new';
function openQuick(){
  if (readOnly) return;
  if (editing) endEdit();
  openModal('mQuick'); const t = $('#qeText');
  if (!t.value) t.value = 'Trip to Lisbon\n\tBefore we go\n\t\t[ ] Book flights\n\t\t[ ] Reserve the Alfama apartment\n\tDays\n\t\tBelém and the tower\n\t\tSintra day trip\n\tFood\n\t\tPastéis de nata\n\t\tTime Out Market';
  setQeMode(sel ? qeMode : 'new'); t.focus();
}
function setQeMode(m){ qeMode = m; document.querySelectorAll('#qeMode .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === m)); $('#qeGo').textContent = m === 'new' ? 'Create map' : 'Add nodes'; }
$('#qeMode').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; if (b.dataset.v === 'sel' && !sel) return toast('Select a node on the map first'); setQeMode(b.dataset.v); });
$('#qeText').addEventListener('keydown', e => {
  if (e.key === 'Tab'){ e.preventDefault(); const t = e.target, s = t.selectionStart, en = t.selectionEnd;
    const ls = t.value.lastIndexOf('\n', s-1) + 1;
    if (e.shiftKey){ if (t.value[ls] === '\t'){ t.value = t.value.slice(0, ls) + t.value.slice(ls+1); t.selectionStart = t.selectionEnd = Math.max(ls, s-1); } }
    else { t.value = t.value.slice(0, ls) + '\t' + t.value.slice(ls); t.selectionStart = s + 1; t.selectionEnd = en + 1; } }
  if (e.key === 'Escape'){ closeModals(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ e.preventDefault(); quickGo(); }
  e.stopPropagation();
});
function quickGo(){
  const nodes = parseOutline($('#qeText').value);
  if (!nodes.length) return toast('Type at least one line');
  if (qeMode === 'sel' && byId[sel]){ const t = byId[sel]; closeModals(); change(() => { t.children.push(...nodes); t.collapsed = false; sel = nodes[0].id; }, {reveal:true}); }
  else { spreadRoots(nodes); closeModals(); openDoc(newDoc(nodes), {save:true}); }
  $('#qeText').value = '';
}
$('#qeGo').addEventListener('click', quickGo);

/* ---------- modals ---------- */
function openModal(id){ document.querySelectorAll('.modal').forEach(m => m.hidden = true); $('#'+id).hidden = false; }
function closeModals(){ document.querySelectorAll('.modal').forEach(m => m.hidden = true); svg.focus({preventScroll:true}); }
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));

/* ---------- search ---------- */
function openSearch(){ $('#search').hidden = false; $('#q').focus(); $('#q').select(); runSearch(); }
function closeSearch(){ $('#search').hidden = true; search = {hits:[], i:-1, q:''}; if (doc) render(); }
function runSearch(){
  const q = $('#q').value.trim().toLowerCase(); search.q = q; search.hits = []; search.i = -1;
  if (q) walkAll(n => { if ((n.text + ' ' + (n.note||'')).toLowerCase().includes(q)) search.hits.push(n.id); });
  $('#qCount').textContent = q ? (search.hits.length ? `${search.hits.length} found` : 'No match') : '';
  render();
}
function stepSearch(d){
  if (!search.hits.length) return;
  search.i = (search.i + d + search.hits.length) % search.hits.length;
  const n = byId[search.hits[search.i]];
  let unfolded = false; for (let p = parentOf[n.id]; p; p = parentOf[p.id]) if (p.collapsed){ p.collapsed = false; unfolded = true; }
  if (unfolded) save();
  sel = n.id; render(); renderInspector(); highlightOutline();
  $('#qCount').textContent = `${search.i+1} of ${search.hits.length}`;
  const W = stage.clientWidth, H = stage.clientHeight;
  setView({k:view.k, x:W/2 - (n._x + n._w/2)*view.k, y:H/2 - (n._y + n._h/2)*view.k}, true);
}
$('#q').addEventListener('input', runSearch);
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); stepSearch(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape'){ closeSearch(); svg.focus(); } e.stopPropagation(); });
$('#qNext').addEventListener('click', () => stepSearch(1));
$('#qPrev').addEventListener('click', () => stepSearch(-1));
$('#qClose').addEventListener('click', closeSearch);

/* ---------- focus mode & panels ---------- */
function toggleFocus(){
  if (!focusMode && !sel) return toast('Select a branch to focus on');
  focusMode = !focusMode; $('#bFocus').setAttribute('aria-pressed', focusMode);
  if (focusMode){ showHint('Focus mode · Esc to leave'); const n = byId[sel]; if (n){ index(); layout(); } } else hideHint();
  render();
}
const panels = {docs:'#docs', outline:'#outline', inspector:'#inspector'};
const panelBtn = {docs:'#bDocs', outline:'#bOutline', inspector:'#bInspector'};
function togglePanel(name, force){
  const el = $(panels[name]), open = force != null ? force : el.hidden;
  const before = stage.getBoundingClientRect();
  if (open && name !== 'inspector'){ for (const o of ['docs','outline']) if (o !== name){ $(panels[o]).hidden = true; $(panelBtn[o]).setAttribute('aria-pressed', false); } }
  if (open && innerWidth <= 760){ for (const o in panels) if (o !== name){ $(panels[o]).hidden = true; $(panelBtn[o]).setAttribute('aria-pressed', false); } }
  el.hidden = !open; $(panelBtn[name]).setAttribute('aria-pressed', open);
  store.set('sprig.panel.'+name, open ? '1' : '0');
  if (name === 'outline' && open) renderOutline();
  if (name === 'inspector' && open) renderInspector(true);
  // keep the map where it was on screen while the stage resizes
  const after = stage.getBoundingClientRect();
  view.x += (before.left + before.width/2) - (after.left + after.width/2);
  render();
}

/* ---------- documents panel ---------- */
let pendingDelete = null;
function renderDocs(){
  if ($('#docs').hidden) return;
  const ix = getIndex();
  $('#docList').innerHTML = ix.map(e => {
    const th = (Object.hasOwn(THEMES, e.theme) && THEMES[e.theme]) || THEMES.meadow, pal = th.light.palette;
    const date = new Date(e.updated || Date.now()).toLocaleDateString(undefined, {month:'short', day:'numeric'});
    return `<div class="doc${doc && e.id === doc.id ? ' on' : ''}" data-doc="${esc(e.id)}" role="button" tabindex="0">
      <span class="dot" style="background:${pal[0]}"></span>
      <div class="dt"><div class="dn">${esc(e.title || 'Untitled map')}${e.shared ? ' <span class="shr" title="Shared by link">🔗</span>' : ''}</div><div class="dm">${e.count || 0} nodes · ${date}</div></div>
      ${pendingDelete === e.id ? `<span class="confirm"><button class="btn danger" data-del="${esc(e.id)}" style="padding:3px 8px">Delete</button><button class="btn" data-keep style="padding:3px 8px">Keep</button></span>`
        : `<button class="dx" data-ask="${esc(e.id)}" aria-label="Delete ${esc(e.title||'map')}" title="Delete">✕</button>`}
    </div>`;
  }).join('') || '<p class="muted" style="padding:8px">No maps yet.</p>';
}
$('#docList').addEventListener('click', e => {
  const ask = e.target.closest('[data-ask]'), del = e.target.closest('[data-del]'), keep = e.target.closest('[data-keep]');
  if (ask){ pendingDelete = ask.dataset.ask; renderDocs(); return; }
  if (keep){ pendingDelete = null; renderDocs(); return; }
  if (del){
    const id = del.dataset.del; pendingDelete = null;
    removeDoc(id);
    const ix = getIndex().filter(x => x.id !== id); putIndex(ix);
    if (doc.id === id){ clearTimeout(saveT); saveT = null; doc = null; if (ix[0]) openById(ix[0].id); else openDoc(newDoc([N('Central idea', {x:0, y:0})]), {save:true}); }
    renderDocs(); toast('Map deleted'); return;
  }
  const d = e.target.closest('[data-doc]');
  if (d && d.dataset.doc !== doc.id){ openById(d.dataset.doc).then(ok => { if (ok && innerWidth <= 760) togglePanel('docs', false); }); }
});
$('#docList').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.doc) e.target.click(); });
$('#bNew').addEventListener('click', () => { const r = N('Central idea', {x:0, y:0}); openDoc(newDoc([r], {title:'Untitled map'}), {save:true}); startEdit(r.id); });

/* ---------- outline panel ---------- */
let outlineTyping = false;
function renderOutline(){
  if ($('#outline').hidden || !doc) return;
  if (outlineTyping) return;
  const rows = [];
  const w = (n, d) => {
    const done = n.task === true;
    rows.push(`<div class="orow d${Math.min(d,2)}${sel===n.id?' sel':''}${done?' done':''}" data-oid="${n.id}" style="--d:${d}">
      ${n.children.length ? `<button class="of${n.collapsed?' closed':''}" data-ofold tabindex="-1" aria-label="${n.collapsed?'Expand':'Collapse'}"><svg viewBox="0 0 12 12"><path d="M2 4h8L6 9z"/></svg></button>` : `<span class="of"><span class="ob" style="background:${esc(n._color || TC().conn)}"></span></span>`}
      ${n.task != null ? `<input type="checkbox" class="ock" data-ock ${done?'checked':''} ${readOnly?'disabled':''} aria-label="Done">` : ''}
      <div class="ot" contenteditable="${readOnly ? 'false' : 'plaintext-only'}" tabindex="0" spellcheck="false">${esc(n.text)}</div>
      ${n.note ? '<span class="on" title="Has a note">✎</span>' : ''}
    </div>`);
    if (!n.collapsed) n.children.forEach(c => w(c, d+1));
  };
  doc.roots.forEach(r => w(r, 0));
  $('#olist').innerHTML = rows.join('');
}
function highlightOutline(){
  document.querySelectorAll('#olist .orow').forEach(r => r.classList.toggle('sel', r.dataset.oid === sel));
  const r = document.querySelector(`#olist .orow[data-oid="${sel}"]`); if (r && !$('#outline').hidden) r.scrollIntoView({block:'nearest'});
}
function focusRow(id, atEnd = true){
  const el = document.querySelector(`#olist .orow[data-oid="${id}"] .ot`); if (!el) return;
  el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd ? true : false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
const olist = $('#olist');
olist.addEventListener('focusin', e => { const row = e.target.closest('.orow'); if (row && e.target.classList.contains('ot')){ sel = row.dataset.oid; render(); renderInspector(); highlightOutline(); row._snap = false; } });
olist.addEventListener('focusout', e => { if (e.target.classList.contains('ot')){ outlineTyping = false; } });
olist.addEventListener('input', e => {
  const row = e.target.closest('.orow'); if (!row || !e.target.classList.contains('ot')) return;
  const n = byId[row.dataset.oid]; if (!n || readOnly) return;
  if (!row._snap){ snapshot(); row._snap = true; }
  outlineTyping = true; n.text = e.target.innerText.replace(/\n$/, ''); save(); render();
  if (!parentOf[n.id] && doc.roots[0] === n){ doc.title = n.text; $('#title').value = n.text; }
  outlineTyping = false;
});
olist.addEventListener('click', e => {
  const row = e.target.closest('.orow'); if (!row) return; const n = byId[row.dataset.oid];
  if (e.target.closest('[data-ofold]')){ change(() => { n.collapsed = !n.collapsed; }, {viewOk:true}); }
  else if (e.target.closest('[data-ock]')){ toggleDone(n); }
});
olist.addEventListener('keydown', e => {
  const row = e.target.closest('.orow'); if (!row || !e.target.classList.contains('ot')) return;
  if (readOnly && !['ArrowUp','ArrowDown','Escape'].includes(e.key)){ e.stopPropagation(); return; }
  const n = byId[row.dataset.oid], p = parentOf[n.id], arr = sibs(n), i = arr.indexOf(n);
  const rows = [...olist.querySelectorAll('.orow')], ri = rows.indexOf(row);
  if (e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    const c = N('');
    change(() => { if (!p && !n.collapsed) n.children.unshift(c); else if (n.children.length && !n.collapsed) n.children.unshift(c); else arr.splice(i+1, 0, c); sel = c.id; });
    focusRow(c.id);
  } else if (e.key === 'Tab' && !e.shiftKey){
    e.preventDefault(); if (i < 1 && p) return;
    if (i < 1 && !p) return;
    const prev = arr[i-1];
    change(() => { arr.splice(i, 1); delete n.x; delete n.y; prev.children.push(n); prev.collapsed = false; });
    focusRow(n.id);
  } else if (e.key === 'Tab' && e.shiftKey){
    e.preventDefault(); if (!p) return;
    const gp = parentOf[p.id], garr = gp ? gp.children : doc.roots;
    change(() => { arr.splice(i, 1); garr.splice(garr.indexOf(p)+1, 0, n); if (!gp){ const b = bounds(); n.x = b.x + b.w + 200; n.y = p.y || 0; } });
    focusRow(n.id);
  } else if (e.key === 'Backspace' && !e.target.textContent && !n.children.length && (p || doc.roots.length > 1)){
    e.preventDefault();
    const prevId = ri > 0 ? rows[ri-1].dataset.oid : null;
    change(() => { arr.splice(i, 1); doc.connections = doc.connections.filter(c => c.from !== n.id && c.to !== n.id); sel = prevId; });
    if (prevId) focusRow(prevId);
  } else if (e.key === 'ArrowUp' && ri > 0 && !e.shiftKey){ e.preventDefault(); focusRow(rows[ri-1].dataset.oid); }
  else if (e.key === 'ArrowDown' && ri < rows.length-1 && !e.shiftKey){ e.preventDefault(); focusRow(rows[ri+1].dataset.oid); }
  else if (e.key === 'Escape'){ e.target.blur(); svg.focus(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); outlineTyping = false; return; }
  e.stopPropagation();
});

/* ---------- inspector ---------- */
let inspFor = undefined;
function renderInspector(force){
  if ($('#inspector').hidden || !doc) return;
  if (!force && inspFor === sel) return;
  if (document.activeElement && document.activeElement.id === 'noteField' && inspFor === sel) return;
  inspFor = sel;
  const n = byId[sel], th = T(), parts = [];
  const pressed = b => `aria-pressed="${!!b}"`;
  if (readOnly){
    parts.push(n ? `<div class="sec"><h3>Note</h3>${n.note ? `<div class="rnote">${esc(n.note)}</div>` : '<p class="muted" style="margin:0">This node has no note.</p>'}</div>`
      : `<div class="sec"><p class="muted" style="margin:0">Select a node to read its note.</p></div>`);
    $('#insp').innerHTML = parts.join(''); return;
  }
  if (n){
    const d = n._d ?? 0;
    parts.push(`<div class="sec"><h3>Node</h3>
      <div class="row"><button class="chip" data-cmd="bold" ${pressed(n.bold)}><b>Bold</b></button><button class="chip" data-cmd="italic" ${pressed(n.italic)}><i>Italic</i></button>
      <button class="chip" data-cmd="task" ${pressed(n.task!=null)}>${n.task!=null ? 'Task ✓' : 'Make task'}</button></div>
      ${d > 0 ? `<div class="seg" role="group" aria-label="Shape">${[['','Auto'],['box','Box'],['pill','Pill'],['line','Line']].map(([v,l]) => `<button class="chip" data-shape="${v}" ${pressed((n.shape||'')===v)}>${l}</button>`).join('')}</div>` : ''}
    </div>`);
    parts.push(`<div class="sec"><h3>${d === 0 ? 'Main node color' : 'Branch color'}</h3><div class="row">
      <button class="sw auto" data-color="" ${pressed(!n.color)} aria-label="Theme color" title="Theme color"></button>
      ${COLORS.map(c => `<button class="sw" data-color="${c}" style="background:${c}" ${pressed(n.color===c)} aria-label="Color ${c}"></button>`).join('')}
    </div></div>`);
    parts.push(`<div class="sec"><h3>Sticker</h3><div class="stk">${STICKERS.map(s => `<button data-sticker="${s}" ${pressed(n.sticker===s)} aria-label="Sticker ${s}">${s}</button>`).join('')}</div>
      ${n.sticker ? '<div><button class="chip" data-sticker="">Remove sticker</button></div>' : ''}</div>`);
    parts.push(`<div class="sec"><h3>Note</h3><textarea class="field" id="noteField" placeholder="Add details, links or context. Notes show a small page icon on the map.">${esc(n.note||'')}</textarea></div>`);
  } else if (selConn){
    parts.push(`<div class="sec"><h3>Cross connection</h3><p class="muted" style="margin:0">Links two ideas from different branches.</p><div><button class="btn danger" data-cmd="delconn">Remove connection</button></div></div>`);
  } else parts.push(`<div class="sec"><p class="muted" style="margin:0">Select a node to style it, add a sticker or write a note.</p></div>`);
  parts.push(`<div class="sec"><h3>Theme</h3><div class="themes">${Object.entries(THEMES).map(([k, t]) => { const c = t[uiMode()];
      return `<button class="th" data-theme-k="${k}" ${pressed(doc.theme===k)}><div class="tp" style="background:${c.bg}">${c.palette.slice(0,5).map(p => `<i style="background:${p}"></i>`).join('')}</div><span>${t.name}</span></button>`; }).join('')}</div></div>`);
  parts.push(`<div class="sec"><h3>Layout</h3><div class="seg" role="group" aria-label="Layout">${[['map','Mind map'],['right','Right'],['tree','Tree']].map(([v,l]) => `<button class="chip" data-layout="${v}" ${pressed(doc.layout===v)}>${l}</button>`).join('')}</div>
    ${doc.layout !== 'tree' ? `<div class="seg" role="group" aria-label="Branch style">${[['curve','Curved'],['elbow','Angled']].map(([v,l]) => `<button class="chip" data-branch="${v}" ${pressed(doc.branch===v)}>${l}</button>`).join('')}</div>` : ''}
    <div><button class="chip" data-cmd="fold-all">Fold all</button> <button class="chip" data-cmd="unfold-all">Unfold all</button></div></div>`);
  let nodes = 0, tasks = 0, done = 0; walkAll(x => { nodes++; if (x.task != null){ tasks++; if (x.task) done++; } });
  parts.push(`<div class="sec"><h3>Map</h3><div class="stats"><div><b>${nodes}</b>nodes</div><div><b>${tasks ? Math.round(done/tasks*100)+'%' : '–'}</b>${tasks ? `${done} of ${tasks} tasks done` : 'no tasks yet'}</div><div><b>${doc.roots.length}</b>main ${doc.roots.length===1?'node':'nodes'}</div><div><b>${doc.connections.length}</b>cross connections</div></div></div>`);
  $('#insp').innerHTML = parts.join('');
}
$('#insp').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; const n = byId[sel];
  if (b.dataset.cmd === 'bold' && n) change(() => { n.bold = !n.bold; });
  else if (b.dataset.cmd === 'italic' && n) change(() => { n.italic = !n.italic; });
  else if (b.dataset.cmd === 'task' && n) change(() => { if (n.task == null) n.task = false; else delete n.task; });
  else if (b.dataset.cmd === 'delconn') deleteSel();
  else if (b.dataset.cmd === 'fold-all') change(() => walkAll(x => { if (x.children.length && parentOf[x.id]) x.collapsed = true; }));
  else if (b.dataset.cmd === 'unfold-all') change(() => walkAll(x => { delete x.collapsed; }));
  else if (b.dataset.shape != null && n) change(() => { if (b.dataset.shape) n.shape = b.dataset.shape; else delete n.shape; });
  else if (b.dataset.color != null && n) change(() => { if (b.dataset.color) n.color = b.dataset.color; else delete n.color; });
  else if (b.dataset.sticker != null && n) change(() => { if (b.dataset.sticker && n.sticker !== b.dataset.sticker) n.sticker = b.dataset.sticker; else delete n.sticker; });
  else if (b.dataset.themeK) { change(() => { doc.theme = b.dataset.themeK; }); renderDocs(); }
  else if (b.dataset.layout) { change(() => { doc.layout = b.dataset.layout; }); fit(true); }
  else if (b.dataset.branch) change(() => { doc.branch = b.dataset.branch; });
});
let noteSnap = false;
$('#insp').addEventListener('focusin', e => { if (e.target.id === 'noteField') noteSnap = false; });
$('#insp').addEventListener('input', e => {
  if (e.target.id !== 'noteField') return; const n = byId[sel]; if (!n || readOnly) return;
  if (!noteSnap){ snapshot(); noteSnap = true; }
  const had = !!n.note; n.note = e.target.value; if (!n.note) delete n.note;
  save(); if (had !== !!n.note) render();
});
$('#insp').addEventListener('focusout', e => { if (e.target.id === 'noteField'){ render(); renderOutline(); } });

/* ---------- toolbar ---------- */
$('#bDocs').addEventListener('click', () => { togglePanel('docs'); renderDocs(); });
$('#bOutline').addEventListener('click', () => togglePanel('outline'));
$('#bInspector').addEventListener('click', () => togglePanel('inspector'));
$('#bUndo').addEventListener('click', undo);
$('#bRedo').addEventListener('click', redo);
$('#bChild').addEventListener('click', () => sel ? addChild() : toast('Select a node first'));
$('#bSib').addEventListener('click', () => sel ? addSibling() : toast('Select a node first'));
$('#bConnect').addEventListener('click', startConnect);
$('#bFocus').addEventListener('click', toggleFocus);
$('#bQuick').addEventListener('click', openQuick);
$('#bSearch').addEventListener('click', openSearch);
$('#bExport').addEventListener('click', openExport);
$('#bHelp').addEventListener('click', () => openModal('mHelp'));
$('#bZoomIn').addEventListener('click', () => zoomAt(1.2));
$('#bZoomOut').addEventListener('click', () => zoomAt(1/1.2));
$('#zoomPct').addEventListener('click', () => fit(true));
$('#title').addEventListener('input', e => { if (readOnly){ e.target.value = doc.title || ''; return; } doc.title = e.target.value; save(); });
$('#title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape'){ e.preventDefault(); svg.focus(); } e.stopPropagation(); });
window.addEventListener('resize', () => render());
window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
const themeChanged = () => { selColor = null; if (doc){ render(); renderOutline(); renderInspector(true); } };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
new MutationObserver(themeChanged).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

/* ---------- samples ---------- */
const SAMPLES = [
{title:'Launch: Field Notes 2.0', theme:'meadow', layout:'map', text:`{🚀} Launch Field Notes 2.0
  {🎯} Goals
    Grow weekly active users 25%
    Convert 4% of free users to Pro
    Earn an App Store feature
  {🧭} Strategy
    Position as notes that survive the field
      Offline-first sync
      Export to PDF and CSV
    Audiences
      Field researchers
      Site inspectors
      Hikers and naturalists
  {🛠️} Build
    [x] Freeze feature scope
    [x] Offline map tiles
    [ ] Voice memo transcription :: Beta testers flagged poor accuracy in wind. Retest with the new noise filter before launch week.
    [ ] Accessibility audit
  {📣} Marketing
    Channels
      Newsletter, 38k subscribers
      Podcast sponsorships
      Trail-community forums
    [x] Landing page copy
    [ ] 60-second launch video
    [ ] Press kit
  {🗓️} Timeline
    Beta: May 6
    Press preview: May 20
    Launch day: June 3
    Retrospective: June 17
  {📈} Metrics
    Day-7 retention
    Pro trial starts
    Crash-free sessions above 99.5%`, connect:[['Offline map tiles','Hikers and naturalists']]},
{title:'Creativity', theme:'meadow', layout:'tree', text:`{💡} Creativity
  {❗} Definition
    Producing ideas that are both new and useful
  {⚙️} Process
    Preparation
    Incubation
    Illumination
    Verification :: Graham Wallas, The Art of Thought (1926)
  {📐} Measure
    Four C model :: Kaufman and Beghetto, 2009
      Mini-c: personal insight
      Little-c: everyday creativity
      Pro-c: professional work
      Big-C: field-changing work
    Divergent thinking
      Fluency
      Flexibility
      Originality
      Elaboration
  {🌱} Foster
    Set a clear purpose
    Reward curiosity
    Make room for failure
    Build domain knowledge
    Mix people with different backgrounds
  {📚} Books
    The Art of Thought, Graham Wallas
    Creativity, Mihaly Csikszentmihalyi
    Steal Like an Artist, Austin Kleon`},
{title:'Dinner Party', theme:'harbor', layout:'right', text:`{🍽️} Dinner Party, Saturday
  {👥} Guests
    Maya and Tom
    Priya
    Jonas
    The Alvarez family
  {🛒} Shopping
    [x] Lemons and fresh herbs
    [ ] Sea bass for 8
    [ ] Sparkling water
    [ ] Flowers for the table
  {📝} Menu
    Starter: burrata with grilled peaches
    Main: roasted sea bass, salsa verde
    Dessert: olive oil cake
  {🎵} Evening
    Bossa nova playlist
    Board games after dessert
  {✅} To do
    [x] Send invitations
    [ ] Borrow two chairs from Jonas
    [ ] Set the table by 6 pm`}
];
function buildSample(s){
  const roots = parseOutline(s.text, true); roots[0].x = 0; roots[0].y = 0;
  const d = newDoc(roots, {title:s.title, theme:s.theme, layout:s.layout});
  const find = t => { let f = null; const w = n => { if (n.text === t) f = n; n.children.forEach(w); }; roots.forEach(w); return f; };
  (s.connect||[]).forEach(([a, b]) => { const A = find(a), B = find(b); if (A && B) d.connections.push({id:uid(), from:A.id, to:B.id}); });
  return d;
}

/* ---------- server mode: talking to the Sprig server ---------- */
const FORMAT = SprigSanitize.FORMAT;
const Remote = {
  index: [], docs: new Map(), ver: new Map(), conflicts: new Map(), me: null,
  entry(m){ return {id:m.id, title:m.title || 'Untitled map', updated:Date.parse(m.updated_at) || Date.now(), count:m.node_count || 0, theme:m.theme, shared:!!m.shared}; },
  opened(d){ store.set(LAST, d.id); Tabs.lock(d.id); if (this.conflicts.has(d.id)) Conflict.show(d.id); }
};
async function api(method, url, body, headers = {}){
  const opts = {method, headers:Object.assign({}, headers), credentials:'same-origin'};
  if (body !== undefined){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (method !== 'GET') opts.headers['X-Sprig-Format'] = String(FORMAT);
  const r = await fetch(url, opts);
  if (r.status === 401){ location.href = '/login'; throw new Error('signed out'); }
  return r;
}
const mapUrl = id => '/api/maps/' + encodeURIComponent(id);

// One pending entry per map, kept in localStorage so it survives a closed tab or a lost connection.
const Outbox = {
  pre: 'sprig.outbox.',
  get(id){ try { return JSON.parse(store.get(this.pre+id) || mem[this.pre+id] || 'null'); } catch(e){ return null; } },
  put(e){ const s = JSON.stringify(e); mem[this.pre+e.id] = s; store.set(this.pre+e.id, s); },
  del(id){ delete mem[this.pre+id]; store.del(this.pre+id); },
  ids(){
    const out = new Set(Object.keys(mem).filter(k => k.startsWith(this.pre)).map(k => k.slice(this.pre.length)));
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.startsWith(this.pre)) out.add(k.slice(this.pre.length)); } } catch(e){}
    return [...out];
  },
  stash(d){
    const prev = this.get(d.id);
    const base = prev ? prev.base : (Remote.ver.has(d.id) ? Remote.ver.get(d.id) : null);
    this.put({id:d.id, op:'upsert', doc:JSON.parse(ser(d)), base, seq:(prev ? prev.seq : 0) + 1, reason:prev ? prev.reason : undefined});
    Sync.status();
  }
};

const Sync = {
  timers: new Map(), busy: new Set(), again: new Set(), offline: false, backoff: 0, retryT: null, error: null,
  kick(id){ clearTimeout(this.timers.get(id)); this.timers.set(id, setTimeout(() => { this.timers.delete(id); this.send(id); }, 1000)); this.status(); },
  remove(id){
    const prev = Outbox.get(id), base = prev ? prev.base : (Remote.ver.has(id) ? Remote.ver.get(id) : null);
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
    if (base == null){ Outbox.del(id); this.status(); return; } // never reached the server
    Outbox.put({id, op:'delete', base, seq:(prev ? prev.seq : 0) + 1}); this.send(id);
  },
  flushAll(){ Outbox.ids().forEach(id => { if (!this.timers.has(id)) this.send(id); }); this.status(); },
  async send(id){
    if (this.busy.has(id)){ this.again.add(id); return; }
    const e = Outbox.get(id); if (!e || Remote.conflicts.has(id)) return this.status();
    this.busy.add(id); this.status();
    try {
      let r;
      if (e.op === 'delete') r = await api('DELETE', mapUrl(id), undefined, {'If-Match': String(e.base)});
      else r = await api('PUT', mapUrl(id), e.doc, e.base == null ? {'If-None-Match':'*'} : Object.assign({'If-Match': String(e.base)}, e.reason ? {'X-Sprig-Reason': e.reason} : {}));
      this.offline = false; this.backoff = 0;
      if (r.ok){
        const j = r.status === 204 ? {} : await r.json(), cur = Outbox.get(id);
        if (e.op === 'delete'){ if (cur && cur.seq === e.seq) Outbox.del(id); Remote.ver.delete(id); }
        else {
          Remote.ver.set(id, j.version);
          if (cur && cur.seq === e.seq) Outbox.del(id);
          else if (cur){ cur.base = j.version; delete cur.reason; Outbox.put(cur); this.again.add(id); }
        }
        this.error = null;
      } else if (r.status === 412){ // a retried create already landed: carry on from the server's version
        const g = await api('GET', mapUrl(id));
        if (g.ok){ const j = await g.json(), cur = Outbox.get(id); Remote.ver.set(id, j.version); if (cur){ cur.base = j.version; Outbox.put(cur); this.again.add(id); } }
      } else if (r.status === 409 && e.op === 'delete'){
        Outbox.del(id); toast('That map changed on another device, so it was not deleted'); reloadList().then(renderDocs).catch(() => {});
      } else if (r.status === 409){
        Remote.conflicts.set(id, await r.json());
        if (doc && doc.id === id) Conflict.show(id);
      } else if (r.status === 404 && e.op === 'delete'){ Outbox.del(id); }
      else if (r.status === 426){ this.error = 'Sprig was updated. Reload the page to keep saving.'; toast(this.error); }
      else if (r.status === 429 || r.status >= 500){ this.retry(); }
      else { const j = await r.json().catch(() => ({})); this.error = (j.error && j.error.message) || `Saving failed (${r.status})`; toast(this.error); }
    } catch(err){
      if (err.message !== 'signed out'){ this.offline = true; this.retry(); }
    } finally {
      this.busy.delete(id); this.status();
      if (this.again.has(id)){ this.again.delete(id); this.send(id); }
    }
  },
  retry(){ if (this.retryT) return; this.backoff = Math.min(30000, (this.backoff || 1000) * 2); this.retryT = setTimeout(() => { this.retryT = null; this.flushAll(); }, this.backoff); },
  status(){
    const el = $('#saveState'); if (!el || MODE !== 'server') return;
    const pending = Outbox.ids().length || this.busy.size || this.timers.size;
    let t, c = '';
    if (doc && Remote.conflicts.has(doc.id)){ t = 'Conflict'; c = 'bad'; }
    else if (this.error){ t = 'Not saved'; c = 'bad'; }
    else if (this.offline){ t = 'Offline'; c = 'warn'; }
    else if (pending){ t = 'Saving…'; }
    else { t = 'Saved'; c = 'ok'; }
    el.textContent = t; el.className = 'save srv ' + c;
    el.title = this.offline ? 'Changes are kept on this device and will be saved when the connection returns.' : (this.error || '');
  }
};
window.addEventListener('online', () => { if (MODE === 'server'){ Sync.offline = false; Sync.flushAll(); } });

const Conflict = {
  show(id){
    const c = Remote.conflicts.get(id); if (!c || !doc || doc.id !== id) return;
    $('#cfMsg').textContent = c.deleted ? 'This map was deleted on another device while you were editing it here.'
      : 'This map was saved from another device or tab while you were editing it here.';
    $('#mConflict').querySelector('[data-cf="mine"]').hidden = !!c.deleted;
    $('#mConflict').querySelector('[data-cf="server"]').textContent = c.deleted ? 'Discard my changes' : 'Use the saved version';
    openModal('mConflict'); Sync.status();
  },
  resolve(choice){
    const id = doc.id, c = Remote.conflicts.get(id), local = Outbox.get(id);
    closeModals(); if (!c) return;
    Remote.conflicts.delete(id);
    if (choice === 'mine'){ if (local){ local.base = c.version; local.reason = 'conflict-overwrite'; Outbox.put(local); } Sync.send(id); return; }
    let copy = null;
    if (choice === 'both' && local && local.doc){
      copy = sanitizeDoc(Object.assign({}, local.doc, {id:uid(), title:(local.doc.title || 'Untitled map') + ' (conflicted copy)'}));
      Remote.docs.set(copy.id, copy); Outbox.stash(copy); Sync.send(copy.id);
      getIndex().unshift({id:copy.id, title:copy.title, updated:Date.now(), count:SprigSanitize.countNodes(copy), theme:copy.theme});
    }
    Outbox.del(id); clearTimeout(saveT); saveT = null; doc = null;
    if (c.deleted){ Remote.docs.delete(id); putIndex(getIndex().filter(x => x.id !== id)); }
    else {
      Remote.ver.set(id, c.version); const server = sanitizeDoc(c.doc); Remote.docs.set(id, server);
      return finishResolve(server, copy ? `Your version was saved as “${copy.title}”` : 'Loaded the saved version');
    }
    const next = copy || readDoc((getIndex()[0] || {}).id);
    if (next) finishResolve(next, copy ? 'Kept both versions' : 'Changes discarded');
    else openDoc(newDoc([N('Central idea', {x:0, y:0})], {title:'Untitled map'}), {save:true});
  }
};
function finishResolve(d, msg){ openDoc(d); renderDocs(); Sync.status(); toast(msg); }
$('#mConflict').addEventListener('click', e => { const b = e.target.closest('[data-cf]'); if (b) Conflict.resolve(b.dataset.cf); });
$('#saveState').addEventListener('click', () => { if (doc && Remote.conflicts.has(doc.id)) Conflict.show(doc.id); });

// A map can be edited in one tab at a time; other tabs get a view-only bar.
const Tabs = {
  release: null, id: null,
  hold(id, opts){
    let rel; const held = new Promise(r => rel = r);
    return navigator.locks.request('sprig-map-' + id, opts, lock => {
      if (this.id !== id) return;
      if (!lock){ setTabReadOnly(true, 'busy'); return; }
      this.release = rel; setTabReadOnly(false); return held;
    }).catch(() => { if (this.id === id){ this.release = null; setTabReadOnly(true, 'taken'); } });
  },
  lock(id){
    if (!navigator.locks || this.id === id) return;
    if (this.release){ this.release(); this.release = null; }
    this.id = id; this.hold(id, {ifAvailable:true});
  },
  async takeOver(){
    const id = this.id; this.hold(id, {steal:true});
    Remote.docs.delete(id); clearTimeout(saveT); saveT = null;
    await openById(id); toast('You can edit this map here now');
  }
};
function setTabReadOnly(on, why){
  if (MODE !== 'server' || readOnly === on && !on) return;
  readOnly = on; document.body.classList.toggle('ro', on); $('#title').readOnly = on;
  if (on){ if (editing) endEdit(true); Notice.show('tab', why === 'taken' ? 'This map is now being edited in another tab. This tab is view only.' : 'This map is open in another tab. This tab is view only.', [['Edit here instead', () => Tabs.takeOver()]]); }
  else Notice.hide('tab');
  if (doc){ render(); renderOutline(); renderInspector(true); }
}

const Notice = {
  key: null,
  show(key, text, actions){
    const el = $('#notice'); this.key = key;
    el.innerHTML = `<span>${esc(text)}</span>` + actions.map((a, i) => `<button class="btn${i === 0 ? ' pri' : ''}" data-n="${i}">${esc(a[0])}</button>`).join('');
    el.onclick = e => { const b = e.target.closest('[data-n]'); if (b) actions[+b.dataset.n][1](); };
    el.hidden = false;
  },
  hide(key){ if (!key || this.key === key){ $('#notice').hidden = true; this.key = null; } }
};

async function reloadList(){
  const r = await api('GET', '/api/maps'), j = await r.json();
  let ix = j.maps.map(m => { Remote.ver.set(m.id, m.version); return Remote.entry(m); });
  for (const id of Outbox.ids()){
    const e = Outbox.get(id); if (!e) continue;
    if (e.op === 'delete') ix = ix.filter(x => x.id !== id);
    else if (!ix.some(x => x.id === id)) ix.unshift({id, title:e.doc.title || 'Untitled map', updated:e.doc.updated || Date.now(), count:SprigSanitize.countNodes(e.doc), theme:e.doc.theme});
  }
  putIndex(ix);
}
async function openById(id){
  let d = null;
  if (MODE === 'server'){
    const pend = Outbox.get(id);
    if (pend && pend.op === 'upsert') d = pend.doc;
    else {
      try {
        const r = await api('GET', mapUrl(id));
        if (r.ok){ const j = await r.json(); Remote.ver.set(id, j.version); d = j.doc; }
        else { toast('That map could not be opened'); return false; }
      } catch(e){ d = readDoc(id); if (!d){ toast('You are offline, and this map is not on this device'); return false; } }
    }
    d = sanitizeDoc(d); Remote.docs.set(id, d);
  } else d = readDoc(id);
  if (!d) return false;
  openDoc(d); return true;
}

/* ---------- share links ---------- */
async function openShare(){
  if (!doc) return; if (editing) endEdit();
  openModal('mShare'); $('#shState').textContent = 'Checking…'; $('#shBox').hidden = true; $('#shOn').disabled = true;
  try {
    clearTimeout(Sync.timers.get(doc.id)); Sync.timers.delete(doc.id);
    if (Outbox.get(doc.id)) await Sync.send(doc.id); // the map must exist on the server before it can be shared
    const r = await api('GET', mapUrl(doc.id) + '/share');
    if (r.status === 404){ $('#shState').textContent = 'Save this map first, then share it.'; return; }
    showShare(await r.json());
  } catch(e){ $('#shState').textContent = 'You are offline. Sharing needs a connection.'; }
}
function showShare(j){
  const on = !!(j && j.url);
  $('#shOn').disabled = false; $('#shOn').checked = on; $('#shBox').hidden = !on;
  $('#shState').textContent = on ? 'Anyone with this link can view the map. They cannot edit it.' : 'Only you can see this map.';
  if (on){ $('#shUrl').value = j.url; $('#shMeta').textContent = 'Link created ' + new Date(j.created_at).toLocaleString(); }
  const e = getIndex().find(x => doc && x.id === doc.id); if (e){ e.shared = on; renderDocs(); }
}
async function shareCall(method){
  try {
    const r = await api(method, mapUrl(doc.id) + '/share');
    if (!r.ok) return toast('That did not work. Try again.');
    showShare(method === 'DELETE' ? null : await r.json());
    if (method === 'POST') toast('New link ready');
  } catch(e){ toast('You are offline. Sharing needs a connection.'); }
}
$('#bShare').addEventListener('click', openShare);
$('#shOn').addEventListener('change', e => shareCall(e.target.checked ? 'POST' : 'DELETE'));
$('#shReset').addEventListener('click', () => shareCall('POST'));
$('#shCopy').addEventListener('click', () => {
  const f = $('#shUrl');
  (navigator.clipboard ? navigator.clipboard.writeText(f.value) : Promise.reject()).then(() => toast('Link copied'), () => { f.focus(); f.select(); toast('Press ⌘C to copy the link'); });
});

/* ---------- account ---------- */
function setupAccount(){
  const me = Remote.me, name = me.name || me.email;
  $('#bAccount').textContent = (name || '?').trim().charAt(0).toUpperCase();
  $('#bAccount').title = me.email; $('#acWho').textContent = `Signed in as ${me.email}`;
}
function renderIdentities(){
  const me = Remote.me, mine = new Map((me.identities || []).map(i => [i.provider, i]));
  $('#acIds').innerHTML = (me.providers || []).map(p => {
    const i = mine.get(p.id);
    return `<div class="trow"><span>${esc(p.name)}</span><span class="muted">${i ? esc(i.email || 'Connected') : 'Not connected'}</span>${
      i ? (mine.size > 1 ? `<button class="btn" data-unlink="${esc(p.id)}">Disconnect</button>` : '<span class="muted">In use</span>')
        : `<button class="btn" data-link="${esc(p.id)}">Connect</button>`}</div>`;
  }).join('') || '<p class="muted" style="margin:0">No sign-in providers are set up on this server.</p>';
}
async function openAccount(){
  openModal('mAccount'); renderIdentities();
  api('GET', '/api/me').then(r => r.json()).then(me => { Remote.me = me; renderIdentities(); }).catch(() => {});
  const box = $('#acTrash'); box.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const r = await api('GET', '/api/maps?trash=1'), j = await r.json();
    box.innerHTML = j.maps.length ? j.maps.map(m => `<div class="trow"><span>${esc(m.title || 'Untitled map')}</span><span class="muted">${new Date(m.deleted_at).toLocaleDateString()}</span><button class="btn" data-restore="${esc(m.id)}">Restore</button></div>`).join('')
      : '<p class="muted" style="margin:0">Nothing deleted in the last 30 days.</p>';
  } catch(e){ box.innerHTML = '<p class="muted" style="margin:0">You are offline.</p>'; }
}
$('#bAccount').addEventListener('click', openAccount);
$('#acIds').addEventListener('click', async e => {
  const link = e.target.closest('[data-link]'), unlink = e.target.closest('[data-unlink]');
  if (link){
    if (Outbox.ids().length){ Sync.flushAll(); await new Promise(r => setTimeout(r, 1200)); }
    const r = await api('POST', '/api/me/identities/' + encodeURIComponent(link.dataset.link)).catch(() => null);
    if (!r || !r.ok) return toast('That sign-in method could not be connected');
    location.href = (await r.json()).url;
  } else if (unlink){
    const r = await api('DELETE', '/api/me/identities/' + encodeURIComponent(unlink.dataset.unlink)).catch(() => null);
    if (!r || !r.ok){ const j = r ? await r.json().catch(() => ({})) : {}; return toast((j.error && j.error.message) || 'That did not work'); }
    Remote.me.identities = Remote.me.identities.filter(i => i.provider !== unlink.dataset.unlink); renderIdentities(); toast('Sign-in method removed');
  }
});
$('#acTrash').addEventListener('click', async e => {
  const b = e.target.closest('[data-restore]'); if (!b) return;
  const r = await api('POST', mapUrl(b.dataset.restore) + '/restore').catch(() => null);
  if (!r || !r.ok) return toast('That map could not be restored');
  await reloadList(); renderDocs(); openAccount(); toast('Map restored');
});
$('#acSignOut').addEventListener('click', async () => {
  if (Outbox.ids().length){ Sync.flushAll(); toast('Saving your last changes first…'); await new Promise(r => setTimeout(r, 1500)); }
  await fetch('/auth/logout', {method:'POST', credentials:'same-origin'}).catch(() => {});
  location.href = '/login';
});

/* ---------- moving maps from this browser to the server ---------- */
function localMapIds(){
  let ix; try { ix = JSON.parse(store.get(IDX) || '[]'); } catch(e){ ix = []; }
  return ix.map(e => e.id).filter(id => store.get('sprig.doc.' + id));
}
function offerUpload(){
  if (store.get('sprig.uploaded')) return;
  const ids = localMapIds(); if (!ids.length) return;
  Notice.show('upload', `This browser has ${ids.length} ${ids.length === 1 ? 'map' : 'maps'} saved only on this device.`,
    [[`Upload ${ids.length === 1 ? 'it' : 'them'}`, () => uploadLocal(ids)], ['Not now', () => Notice.hide('upload')]]);
}
async function uploadLocal(ids){
  Notice.show('upload', 'Uploading…', []);
  let done = 0;
  for (const id of ids){
    let d; try { d = sanitizeDoc(JSON.parse(store.get('sprig.doc.' + id))); } catch(e){ continue; }
    const r = await api('PUT', mapUrl(d.id), d, {'If-None-Match':'*'}).catch(() => null);
    if (r && (r.status === 201 || r.status === 412)) done++; // 412: this map is already on the server
  }
  store.set('sprig.uploaded', '1');
  await reloadList().catch(() => {}); renderDocs();
  Notice.show('upload', `Uploaded ${done} of ${ids.length} maps.`, [['Remove the copies on this device', () => {
    localMapIds().forEach(id => store.del('sprig.doc.' + id)); store.del(IDX); Notice.hide('upload'); toast('Local copies removed');
  }], ['Keep them', () => Notice.hide('upload')]]);
}

/* ---------- boot ---------- */
function restorePanels(){
  if (store.get('sprig.panel.outline') === '1' && innerWidth > 760) togglePanel('outline', true);
  if (store.get('sprig.panel.inspector') === '1' && innerWidth > 760) togglePanel('inspector', true);
}
function fatal(msg){ const f = $('#fatal'); f.querySelector('p').textContent = msg; f.hidden = false; }
function bootLocal(){
  let ix = getIndex(), first = null;
  if (!ix.length){
    const docs = SAMPLES.map(buildSample);
    docs.slice().reverse().forEach((d, i) => { d.updated = Date.now() - i*1000; writeDoc(d); });
    ix = docs.map(d => { let c = 0; const w = n => { c++; n.children.forEach(w); }; d.roots.forEach(w); return {id:d.id, title:d.title, updated:d.updated, count:c, theme:d.theme}; });
    putIndex(ix); first = docs[0];
  }
  const last = store.get(LAST) || mem[LAST];
  doc = (last && readDoc(last)) || first || readDoc(ix[0].id) || buildSample(SAMPLES[0]);
  restorePanels(); openDoc(doc);
}
async function bootServer(){
  document.body.classList.add('server');
  restorePanels();
  try {
    const r = await api('GET', '/api/me'); Remote.me = await r.json();
    setupAccount(); await reloadList();
  } catch(e){ if (e.message !== 'signed out') fatal('Sprig can’t reach its server. Check your connection, then reload the page.'); return; }
  if (!Remote.me.seeded){ // sample maps are created once per account, never once per device
    const docs = SAMPLES.map(buildSample);
    docs.forEach((d, i) => { d.updated = Date.now() - i*1000; Remote.docs.set(d.id, d); Outbox.stash(d); });
    putIndex(docs.map(d => ({id:d.id, title:d.title, updated:d.updated, count:SprigSanitize.countNodes(d), theme:d.theme})).concat(getIndex()));
    api('POST', '/api/me/seeded').catch(() => {});
  }
  const ix = getIndex(), last = store.get(LAST);
  const target = last && ix.some(e => e.id === last) ? last : ix[0] && ix[0].id;
  if (!(target && await openById(target))) openDoc(newDoc([N('Central idea', {x:0, y:0})], {title:'Untitled map'}), {save:true});
  Sync.flushAll(); offerUpload();
  const connected = new URLSearchParams(location.search).get('connected');
  if (connected){
    history.replaceState(null, '', '/');
    const p = (Remote.me.providers || []).find(x => x.id === connected);
    toast(p ? `${p.name} is connected. You can now sign in with it.` : 'That sign-in method was not connected. Please try again.');
  }
  setInterval(() => { if (Outbox.ids().length && !Sync.busy.size) Sync.flushAll(); }, 15000);
}
async function bootViewer(){
  document.body.classList.add('ro', 'viewer'); $('#title').readOnly = true;
  const token = location.pathname.split('/')[2] || '';
  try {
    const r = await fetch('/api/shared/' + encodeURIComponent(decodeURIComponent(token)), {credentials:'omit'});
    if (!r.ok) throw new Error('gone');
    const j = await r.json();
    openDoc(j.doc); document.title = (j.title || 'Shared map') + ' · Sprig';
  } catch(e){ fatal('This link is no longer active.'); }
}
if (MODE === 'server') bootServer(); else if (MODE === 'viewer') bootViewer(); else bootLocal();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { wrapCache.clear(); if (doc) fit(false); });
