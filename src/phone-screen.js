// The phone's screen (build 0.15, the owner: "the screen and messages displayed on it should look AAA"): everything on
// it drawn into one canvas, from a plain description of what it shows (phone.js screenState), so it can be previewed
// and checked without the game (tools/phone/preview.mjs). A modern phone's look without anyone's brand: a dark
// wallpaper (made here: soft light through a rainy window), frosted cards, a status bar with signal and battery, the
// lock screen's date and big clock, the camera app (its clips with thumbnails, LIVE), the emergency call (the
// dispatcher's words in a bubble, the player's answers as buttons, the call's controls), the boot and the dead battery.
// VIDEO is where the video quad sits over the screen (phone.js places it from this rectangle).

export const W = 660, H = 1430;                         // 9:19.5
export const VIDEO = { x: 0, y: 236, w: 660, h: 371 };   // 16:9, under the camera app's title
const FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const f = (weight, size) => `${weight} ${size}px ${FONT}`;
const WHITE = '#f4f6fa', DIM = 'rgba(235,240,248,0.62)', FAINT = 'rgba(235,240,248,0.4)', RED = '#ff453a', GREEN = '#30d158';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const canvas = (w, h, doc) => Object.assign((doc ?? globalThis.document).createElement('canvas'), { width: w, height: h });
const clock = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// The wallpaper: night through a wet window: a deep blue-violet dusk, the blurred glow of a few distant lights, beads of
// rain catching them, a fine grain. And its blurred copy, under the frosted cards.
export function makeWallpaper(doc) {
  const c = canvas(W, H, doc), g = c.getContext('2d'), r = seeded(0x3071);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b1230'); sky.addColorStop(0.45, '#1a1840'); sky.addColorStop(0.75, '#2a1838'); sky.addColorStop(1, '#0a0a14');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // The city's lights, far and out of focus.
  const glows = [[0.18, 0.62, 260, '255,150,80', 0.35], [0.72, 0.56, 300, '120,150,255', 0.3], [0.5, 0.78, 380, '255,90,120', 0.22],
    [0.88, 0.82, 220, '255,200,120', 0.28], [0.1, 0.9, 260, '90,180,255', 0.2]];
  for (const [x, y, rad, col, a] of glows) {
    const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, rad);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // Bokeh: soft discs of the lights behind the rain.
  for (let i = 0; i < 46; i++) {
    const x = r() * W, y = H * (0.42 + r() * 0.55), rad = 8 + r() * 34, warm = r() < 0.55;
    const gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    const col = warm ? '255,190,130' : '150,180,255', a = 0.05 + r() * 0.12;
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.8, `rgba(${col},${a * 0.8})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // Raindrops on the glass: a dark body, a bright rim on the lit side.
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = r() * H, rad = 1.5 + r() * r() * 9;
    g.fillStyle = 'rgba(5,6,14,0.35)'; g.beginPath(); g.ellipse(x, y, rad, rad * 1.15, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(210,220,255,${0.12 + r() * 0.2})`; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y + rad * 0.15, rad * 0.85, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  }
  // A darker top for the clock, and the corners.
  const top = g.createLinearGradient(0, 0, 0, H * 0.4);
  top.addColorStop(0, 'rgba(0,0,0,0.35)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, H * 0.4);
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  // Grain.
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return { image: c, blurred: blur(c, 22, doc) };
}

// A cheap, portable blur (no canvas filter): down to a small copy and back up, twice.
function blur(src, k, doc) {
  const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
  const a = canvas(w, h, doc), b = canvas(src.width, src.height, doc);
  const ga = a.getContext('2d'), gb = b.getContext('2d');
  ga.imageSmoothingQuality = 'high'; gb.imageSmoothingQuality = 'high';
  ga.drawImage(src, 0, 0, w, h);
  const m = canvas(w * 3, h * 3, doc), gm = m.getContext('2d'); gm.imageSmoothingQuality = 'high';
  gm.drawImage(a, 0, 0, m.width, m.height);
  gb.drawImage(m, 0, 0, b.width, b.height);
  gb.fillStyle = 'rgba(14,16,28,0.28)'; gb.fillRect(0, 0, b.width, b.height);
  return b;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
}

// A frosted card: the blurred wallpaper under it, a light tint, a hairline rim.
function frost(g, wp, x, y, w, h, r, { tint = 'rgba(255,255,255,0.13)', selected = false } = {}) {
  g.save(); rr(g, x, y, w, h, r); g.clip();
  if (wp?.blurred) g.drawImage(wp.blurred, x, y, w, h, x, y, w, h);
  g.fillStyle = selected ? 'rgba(255,255,255,0.86)' : tint; g.fillRect(x, y, w, h);
  g.restore();
  g.strokeStyle = selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; rr(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r); g.stroke();
}

function text(g, s, x, y, { font, color = WHITE, align = 'left', base = 'alphabetic' } = {}) {
  g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y);
}

function wrap(g, s, width) {
  const words = String(s).split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

// --- icons (drawn, no font) --------------------------------------------------------------------------------------
function signal(g, x, y, bars, color = WHITE) {
  for (let i = 0; i < 4; i++) { g.fillStyle = i < bars ? color : 'rgba(255,255,255,0.28)'; rr(g, x + i * 9, y - 7 - i * 5, 6, 9 + i * 5, 2); g.fill(); }
}
function battery(g, x, y, pct, charging) {
  const low = pct < 20;
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; rr(g, x, y - 20, 44, 21, 6); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.55)'; rr(g, x + 46, y - 13, 3.5, 8, 1.5); g.fill();
  g.fillStyle = charging ? GREEN : low ? RED : WHITE; rr(g, x + 3, y - 17, Math.max(3, 38 * Math.min(1, pct / 100)), 15, 3.5); g.fill();
  if (charging) bolt(g, x + 22, y - 10, 0.55, '#0b0b0b');
}
function bolt(g, x, y, s, color) {
  g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = color;
  g.beginPath(); g.moveTo(4, -22); g.lineTo(-12, 3); g.lineTo(-1, 3); g.lineTo(-5, 22); g.lineTo(12, -4); g.lineTo(1, -4); g.closePath(); g.fill();
  g.restore();
}
function padlock(g, x, y, color = WHITE) {
  g.strokeStyle = color; g.lineWidth = 4.5; g.beginPath(); g.arc(x, y - 10, 11, Math.PI, 0); g.lineTo(x + 11, y - 2); g.moveTo(x - 11, y - 10); g.lineTo(x - 11, y - 2); g.stroke();
  g.fillStyle = color; rr(g, x - 17, y - 3, 34, 26, 6); g.fill();
}
function camIcon(g, x, y, s) {
  // An app icon: a dark rounded square with a lens and a red recording dot.
  const grad = g.createLinearGradient(x, y, x, y + s); grad.addColorStop(0, '#3a3f4b'); grad.addColorStop(1, '#16181e');
  g.fillStyle = grad; rr(g, x, y, s, s, s * 0.23); g.fill();
  g.fillStyle = '#0b0c10'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.3, 0, Math.PI * 2); g.fill();
  const lens = g.createRadialGradient(x + s * 0.45, y + s * 0.45, 1, x + s / 2, y + s / 2, s * 0.22);
  lens.addColorStop(0, '#7aa8ff'); lens.addColorStop(0.4, '#23355e'); lens.addColorStop(1, '#05070c');
  g.fillStyle = lens; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.21, 0, Math.PI * 2); g.fill();
  g.fillStyle = RED; g.beginPath(); g.arc(x + s * 0.8, y + s * 0.2, s * 0.08, 0, Math.PI * 2); g.fill();
}
function handset(g, x, y, s, color, down = false) {
  // A receiver: the handle's arc and the ear and mouth pieces; turned down to hang up.
  g.save(); g.translate(x, y); g.rotate(down ? Math.PI * 0.78 : -Math.PI * 0.08); g.scale(s, s);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 12, 17, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
  for (const a of [Math.PI * 1.13, Math.PI * 1.87]) {
    const px = Math.cos(a) * 17, py = 12 + Math.sin(a) * 17;
    g.beginPath(); g.ellipse(px, py + 3, 7.5, 5, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
  }
  g.lineCap = 'butt'; g.restore();
}
function chevron(g, x, y, color = WHITE, dir = -1) { g.strokeStyle = color; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x - dir * 9, y - 15); g.lineTo(x + dir * 5, y); g.lineTo(x - dir * 9, y + 15); g.stroke(); g.lineCap = 'butt'; }
function circleButton(g, x, y, r, fill, draw) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); draw?.(); }

function statusBar(g, s) {
  text(g, clock(s.time), 72, 66, { font: f(600, 32) });
  // (The camera's island is the model's own, in front of the screen.)
  if (s.silenced) { text(g, '🔕', W / 2 + 128, 66, { font: f(400, 22) }); }
  signal(g, W - 222, 64, s.bars ?? 2);
  text(g, s.network ?? '4G', W - 178, 64, { font: f(600, 22) });
  battery(g, W - 106, 66, s.charge ?? 0, s.charging);
}
function homeBar(g) { g.fillStyle = 'rgba(255,255,255,0.75)'; rr(g, W / 2 - 92, H - 26, 184, 9, 4.5); g.fill(); }

// --- screens -------------------------------------------------------------------------------------------------------
// s: { mode, time (Date), charge, charging, silenced, held (in the hand, not lying on the nightstand), options [[label]],
//      sel, notifications [{ time, title, unread }], thumbs { id: image }, clip { id, time, t, duration }, live { status },
//      call { line, title, incoming, choices, t, answers [text] }, boot (seconds) }
export function drawScreen(g, s, wp) {
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const m = s.mode;
  if (m === 'off') { g.restore(); return; }
  if (m === 'dead') { if (s.charging) deadCharging(g); g.restore(); return; }
  if (m === 'boot') { boot(g, s); g.restore(); return; }
  if (m === 'lock') lock(g, s, wp);
  else if (m === 'cam' || m === 'clip' || m === 'live') camApp(g, s, wp);
  else if (m === 'call') call(g, s, wp);
  g.restore();
}

function deadCharging(g) {
  // The empty battery and the charging bolt, as a flat phone shows on a charger.
  const x = W / 2 - 90, y = H / 2 - 50;
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6; rr(g, x, y, 180, 100, 20); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)'; rr(g, x + 186, y + 32, 12, 36, 5); g.fill();
  g.fillStyle = RED; rr(g, x + 10, y + 10, 18, 80, 9); g.fill();
  bolt(g, W / 2, y + 170, 1.5, RED);
}

function boot(g, s) {
  // Its maker's mark: two interlocking rings, no brand; a thin bar fills under it.
  const cx = W / 2, cy = H / 2 - 60, k = Math.min(1, (s.boot ?? 0) / 3);
  const grad = g.createLinearGradient(cx - 90, cy - 90, cx + 90, cy + 90);
  grad.addColorStop(0, '#e8ecf4'); grad.addColorStop(1, '#8e97aa');
  g.strokeStyle = grad; g.lineWidth = 12;
  g.beginPath(); g.arc(cx - 26, cy, 62, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx + 26, cy, 62, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, cx - 110, cy + 190, 220, 7, 3.5); g.fill();
  g.fillStyle = '#e8ecf4'; rr(g, cx - 110, cy + 190, 220 * (0.08 + 0.92 * k), 7, 3.5); g.fill();
}

function lock(g, s, wp) {
  if (wp) g.drawImage(wp.image, 0, 0);
  statusBar(g, s);
  padlock(g, W / 2, 158, 'rgba(255,255,255,0.9)');
  const d = s.time;
  text(g, `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`, W / 2, 252, { font: f(600, 34), color: 'rgba(240,244,252,0.88)', align: 'center' });
  text(g, clock(d), W / 2, 448, { font: f(700, 196), color: 'rgba(244,247,252,0.95)', align: 'center' });
  let y = 520;
  const unread = (s.notifications || []).filter(n => n.unread);
  if (unread.length > 1) text(g, 'Notification Centre', 48, y + 30, { font: f(600, 26), color: DIM });
  if (unread.length > 1) y += 50;
  for (const n of unread.slice(0, 3)) { notification(g, s, wp, n, y); y += 172; }
  if (s.held && s.options?.length) {
    const opts = s.options, h = 104, gap = 18, y0 = H - 92 - opts.length * (h + gap);
    opts.forEach(([label], i) => {
      const sel = i === s.sel, yy = y0 + i * (h + gap), red = /^Emergency/.test(label);
      frost(g, wp, 48, yy, W - 96, h, 30, { selected: sel });
      if (red) { circleButton(g, 112, yy + h / 2, 30, sel ? RED : 'rgba(255,69,58,0.9)', () => handset(g, 112, yy + h / 2 + 2, 0.95, '#fff')); }
      else camIcon(g, 82, yy + h / 2 - 30, 60);
      text(g, label, 166, yy + h / 2 + 12, { font: f(600, 34), color: sel ? '#0d0f14' : WHITE });
      chevron(g, W - 88, yy + h / 2, sel ? 'rgba(13,15,20,0.5)' : 'rgba(255,255,255,0.45)', 1);
    });
    text(g, 'Scroll to choose · Click to open', W / 2, H - 58, { font: f(500, 22), color: FAINT, align: 'center' });
  } else {
    // Lying face up: the lock screen's two round buttons and the bar.
    circleButton(g, 104, H - 140, 46, 'rgba(30,32,44,0.7)', () => { g.fillStyle = WHITE; rr(g, 96, H - 166, 16, 34, 4); g.fill(); rr(g, 92, H - 130, 24, 10, 3); g.fill(); });
    circleButton(g, W - 104, H - 140, 46, 'rgba(30,32,44,0.7)', () => { g.strokeStyle = WHITE; g.lineWidth = 4; rr(g, W - 132, H - 158, 56, 38, 8); g.stroke(); g.beginPath(); g.arc(W - 104, H - 139, 10, 0, Math.PI * 2); g.stroke(); });
  }
  homeBar(g);
}

function notification(g, s, wp, n, y) {
  frost(g, wp, 32, y, W - 64, 156, 34);
  camIcon(g, 56, y + 24, 54);
  text(g, 'HOME CAM', 126, y + 48, { font: f(600, 24), color: DIM });
  text(g, n.ago ?? n.time, W - 64, y + 48, { font: f(400, 24), color: FAINT, align: 'right' });
  text(g, 'Motion detected', 56, y + 98, { font: f(600, 30) });
  text(g, `${n.place ?? 'Bedroom'} · ${n.time}`, 56, y + 134, { font: f(400, 28), color: 'rgba(235,240,248,0.78)' });
  const th = s.thumbs?.[n.id];
  if (th) { g.save(); rr(g, W - 64 - 130, y + 66, 130, 74, 12); g.clip(); g.drawImage(th, W - 64 - 130, y + 66, 130, 74); g.restore(); }
}

function camApp(g, s, wp) {
  g.fillStyle = '#0c0d12'; g.fillRect(0, 0, W, H);
  statusBar(g, s);
  chevron(g, 52, 160, '#6ea8ff');
  text(g, 'Home', 72, 172, { font: f(400, 32), color: '#6ea8ff' });
  text(g, 'Bedroom', W / 2, 172, { font: f(700, 34), align: 'center' });
  const live = s.mode === 'live', clip = s.mode === 'clip';
  // The video area: the video quad covers it while a clip or LIVE plays; otherwise the last still and a play mark.
  g.fillStyle = '#000'; g.fillRect(VIDEO.x, VIDEO.y, VIDEO.w, VIDEO.h);
  if (!live && !clip) {
    const th = s.thumbs?.['0258'];
    if (th) { g.globalAlpha = 0.55; g.drawImage(th, VIDEO.x, VIDEO.y, VIDEO.w, VIDEO.h); g.globalAlpha = 1; }
    circleButton(g, W / 2, VIDEO.y + VIDEO.h / 2, 44, 'rgba(0,0,0,0.45)', () => { g.fillStyle = WHITE; g.beginPath(); g.moveTo(W / 2 - 13, VIDEO.y + VIDEO.h / 2 - 22); g.lineTo(W / 2 + 22, VIDEO.y + VIDEO.h / 2); g.lineTo(W / 2 - 13, VIDEO.y + VIDEO.h / 2 + 22); g.fill(); });
    text(g, 'Cam 1 · Night vision', 24, VIDEO.y + VIDEO.h - 22, { font: f(600, 22), color: 'rgba(255,255,255,0.8)' });
  }
  let y = VIDEO.y + VIDEO.h + 28;
  if (live || clip) {
    // Under the picture: what it is, a timeline (a clip) or the live status, the controls.
    if (live) {
      g.fillStyle = RED; rr(g, 32, y, 92, 40, 10); g.fill();
      text(g, 'LIVE', 78, y + 29, { font: f(700, 24), align: 'center' });
      text(g, s.live?.status || '8 s delay', 140, y + 30, { font: f(500, 26), color: DIM });
    } else {
      const c = s.clip, k = Math.min(1, (c.t ?? 0) / (c.duration || 4));
      text(g, `Motion · ${c.time}`, 32, y + 30, { font: f(600, 28) });
      text(g, 'Bedroom · Cam 1', W - 32, y + 30, { font: f(400, 24), color: FAINT, align: 'right' });
      y += 62;
      g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, 32, y, W - 64, 8, 4); g.fill();
      g.fillStyle = WHITE; rr(g, 32, y, (W - 64) * k, 8, 4); g.fill();
      g.beginPath(); g.arc(32 + (W - 64) * k, y + 4, 12, 0, Math.PI * 2); g.fill();
      text(g, mmss((c.t ?? 0)), 32, y + 46, { font: f(500, 22), color: FAINT });
      text(g, `-${mmss(Math.max(0, (c.duration || 4) - (c.t ?? 0)))}`, W - 32, y + 46, { font: f(500, 22), color: FAINT, align: 'right' });
    }
    y += 120;
    // Transport controls.
    const cy = y + 40;
    for (const [dx, kind] of [[-150, 'back'], [0, 'pause'], [150, 'fwd']]) {
      const x = W / 2 + dx; g.fillStyle = WHITE;
      if (kind === 'pause') { rr(g, x - 20, cy - 30, 14, 60, 4); g.fill(); rr(g, x + 6, cy - 30, 14, 60, 4); g.fill(); }
      else { const d = kind === 'back' ? -1 : 1; for (const o of [0, 26]) { g.beginPath(); g.moveTo(x + d * (-20 + o), cy - 22); g.lineTo(x + d * (6 + o), cy); g.lineTo(x + d * (-20 + o), cy + 22); g.fill(); } }
    }
    text(g, live ? 'Right click · back' : 'Right click · back to the clips', W / 2, H - 60, { font: f(500, 22), color: FAINT, align: 'center' });
    homeBar(g);
    return;
  }
  text(g, 'Today', 32, y + 34, { font: f(700, 34) });
  y += 60;
  (s.options || []).forEach(([label, , meta], i) => {
    const sel = i === s.sel, h = 132;
    g.fillStyle = sel ? 'rgba(110,168,255,0.22)' : 'rgba(255,255,255,0.06)'; rr(g, 20, y, W - 40, h, 22); g.fill();
    if (sel) { g.strokeStyle = 'rgba(110,168,255,0.85)'; g.lineWidth = 3; rr(g, 21.5, y + 1.5, W - 43, h - 3, 21); g.stroke(); }
    const th = meta?.id && s.thumbs?.[meta.id];
    g.fillStyle = '#000'; rr(g, 38, y + 18, 170, 96, 12); g.fill();
    if (th) { g.save(); rr(g, 38, y + 18, 170, 96, 12); g.clip(); g.drawImage(th, 38, y + 18, 170, 96); g.restore(); }
    if (meta?.live) {
      g.fillStyle = RED; rr(g, 48, y + 28, 64, 28, 7); g.fill(); text(g, 'LIVE', 80, y + 49, { font: f(700, 18), align: 'center' });
      text(g, 'Bedroom', 232, y + 60, { font: f(600, 32) });
      text(g, 'Watch now · 8 s delay', 232, y + 100, { font: f(400, 26), color: DIM });
    } else {
      text(g, meta?.time ?? label, 232, y + 60, { font: f(600, 32) });
      text(g, 'Motion · Bedroom', 232, y + 100, { font: f(400, 26), color: DIM });
      if (meta?.duration) text(g, mmss(meta.duration), W - 52, y + 60, { font: f(400, 24), color: FAINT, align: 'right' });
      if (meta?.unread) { g.fillStyle = '#6ea8ff'; g.beginPath(); g.arc(W - 64, y + 96, 9, 0, Math.PI * 2); g.fill(); }
    }
    y += h + 16;
  });
  text(g, 'Scroll · click to play · right click · back', W / 2, H - 60, { font: f(500, 22), color: FAINT, align: 'center' });
  homeBar(g);
}

function call(g, s, wp) {
  const c = s.call || {};
  if (wp) { g.drawImage(wp.blurred, 0, 0); g.fillStyle = 'rgba(6,8,14,0.55)'; g.fillRect(0, 0, W, H); }
  statusBar(g, { ...s, network: s.network ?? 'SOS' });
  text(g, c.incoming ? 'incoming call' : (c.connected ? mmss(c.t ?? 0) : 'calling…'), W / 2, 196, { font: f(400, 30), color: DIM, align: 'center' });
  text(g, c.incoming ? 'Emergency services' : '112', W / 2, 270, { font: f(500, c.incoming ? 52 : 72), align: 'center' });
  text(g, 'Emergency call', W / 2, 318, { font: f(400, 28), color: DIM, align: 'center' });
  // What the dispatcher last said, in a bubble.
  let y = 380;
  if (c.line && !c.incoming && c.connected !== false && !/^Calling/.test(c.line)) {
    g.font = f(500, 32);
    const lines = wrap(g, c.line, W - 160);
    const h = 70 + lines.length * 42;
    frost(g, wp, 40, y, W - 80, h, 30, { tint: 'rgba(255,255,255,0.12)' });
    text(g, 'Dispatcher', 72, y + 44, { font: f(600, 22), color: DIM });
    lines.forEach((l, i) => text(g, l, 72, y + 88 + i * 42, { font: f(500, 32) }));
    y += h + 26;
  }
  const opts = s.options || [];
  if (c.incoming) {
    // Decline and accept.
    const sel = s.sel ?? 0;
    circleButton(g, 170, H - 250, 72, RED, () => handset(g, 170, H - 246, 1.9, '#fff', true));
    circleButton(g, W - 170, H - 250, 72, GREEN, () => handset(g, W - 170, H - 250, 1.9, '#fff'));
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(sel === 0 ? W - 170 : 170, H - 250, 84, 0, Math.PI * 2); g.stroke();
    text(g, 'Decline', 170, H - 140, { font: f(500, 26), color: DIM, align: 'center' });
    text(g, 'Accept', W - 170, H - 140, { font: f(500, 26), color: DIM, align: 'center' });
    homeBar(g);
    return;
  }
  const answers = opts.filter(([l]) => l !== 'Hang up');
  answers.forEach(([label], i) => {
    const sel = i === s.sel;
    g.font = f(500, 30);
    const lines = wrap(g, label.replace(/^"|"$/g, ''), W - 200);
    const h = 40 + lines.length * 40;
    frost(g, wp, 40, y, W - 80, h, 26, { selected: sel, tint: 'rgba(255,255,255,0.08)' });
    lines.forEach((l, k) => text(g, l, 76, y + 50 + k * 40, { font: f(500, 30), color: sel ? '#0d0f14' : WHITE }));
    y += h + 16;
  });
  if (answers.length) text(g, 'Whisper · scroll and click', W / 2, y + 30, { font: f(500, 22), color: FAINT, align: 'center' });
  // The call's controls; the red button hangs up (selected when it is the only choice).
  const row = H - 400, xs = [W / 2 - 190, W / 2, W / 2 + 190];
  const labels = ['mute', 'keypad', 'speaker'];
  xs.forEach((x, i) => {
    circleButton(g, x, row, 62, 'rgba(255,255,255,0.14)', () => {
      g.fillStyle = WHITE;
      if (i === 0) { rr(g, x - 10, row - 30, 20, 36, 10); g.fill(); g.strokeStyle = WHITE; g.lineWidth = 4; g.beginPath(); g.arc(x, row - 2, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.fillRect(x - 2, row + 16, 4, 12); }
      if (i === 1) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { g.beginPath(); g.arc(x - 18 + b * 18, row - 18 + a * 18, 5, 0, Math.PI * 2); g.fill(); }
      if (i === 2) { g.beginPath(); g.moveTo(x - 22, row - 9); g.lineTo(x - 10, row - 9); g.lineTo(x + 4, row - 22); g.lineTo(x + 4, row + 22); g.lineTo(x - 10, row + 9); g.lineTo(x - 22, row + 9); g.fill(); g.strokeStyle = WHITE; g.lineWidth = 4; g.beginPath(); g.arc(x + 8, row, 16, -0.9, 0.9); g.stroke(); }
    });
    text(g, labels[i], x, row + 98, { font: f(500, 24), color: DIM, align: 'center' });
  });
  const hangSel = opts.length === 1 && opts[0][0] === 'Hang up';
  circleButton(g, W / 2, H - 196, 72, RED, () => handset(g, W / 2, H - 192, 1.9, '#fff', true));
  if (hangSel) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, H - 196, 84, 0, Math.PI * 2); g.stroke(); }
  homeBar(g);
}
