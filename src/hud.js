// The little the game puts on screen (horror plays best with almost nothing): a key prompt that fades in and out
// ("C · Crouch"), a crouch mark in the corner, short toasts, voices on the phone as captions (the dispatcher), and the
// document viewer (examine): a note, the diary, a polaroid and its back, read full screen; E, Esc or a click puts it down.
export class Hud {
  constructor(doc = document) {
    this.doc = doc;
    const el = (tag, cls, parent = doc.body) => { const e = doc.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
    this.promptEl = el('div', 'hud-prompt'); this.promptEl.hidden = true;
    this.crouchEl = el('div', 'hud-crouch'); this.crouchEl.hidden = true;
    this.crouchEl.setAttribute('aria-label', 'Crouching');
    this.voiceEl = el('div', 'hud-voice'); this.voiceEl.hidden = true;
    this.toastEl = el('div', 'hud-toast'); this.toastEl.hidden = true;
    this.soundEl = el('div', 'hud-sound'); this.soundEl.hidden = true;
    this.soundCaptions = false;   // settings: the night's important sounds described on screen
    this.docEl = el('div', 'hud-doc'); this.docEl.hidden = true;
    this.docEl.innerHTML = '<div class="sheet"></div><p class="hint">E · put it down</p>';
    this.docEl.addEventListener('click', () => this.closeDoc());
    window.addEventListener('keydown', (e) => {
      if (this.docEl.hidden || e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space') { e.stopImmediatePropagation(); this.closeDoc(); }
      if (e.code === 'KeyF' && this.docFlip) { e.stopImmediatePropagation(); this.flip(); }
    }, true);
  }

  prompt(key, text, seconds = 4) {
    this.promptKey = key;
    this.promptEl.innerHTML = `<kbd>${key}</kbd>${text}`;
    this.promptEl.hidden = false; this.promptEl.classList.remove('out');
    clearTimeout(this.promptTimer);
    this.promptTimer = setTimeout(() => { this.promptEl.classList.add('out'); setTimeout(() => { this.promptEl.hidden = true; }, 900); }, seconds * 1000);
  }

  // Takes a prompt off the screen now (its key has been used); key: only if the prompt showing is that key's.
  hidePrompt(key = null) {
    if (this.promptEl.hidden || (key && this.promptKey !== key)) return;
    clearTimeout(this.promptTimer);
    this.promptEl.classList.add('out');
    this.promptTimer = setTimeout(() => { this.promptEl.hidden = true; }, 900);
  }

  toast(text, seconds = 2.5) {
    this.toastEl.textContent = text; this.toastEl.hidden = false; this.toastEl.classList.remove('out');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.classList.add('out'); setTimeout(() => { this.toastEl.hidden = true; }, 900); }, seconds * 1000);
  }

  // A voice on the phone, as a caption under the thoughts.
  voice(who, text) {
    this.voiceEl.innerHTML = `<b>${who}</b> ${text}`;
    this.voiceEl.hidden = false; this.voiceEl.classList.remove('out');
    clearTimeout(this.voiceTimer);
    this.voiceTimer = setTimeout(() => { this.voiceEl.classList.add('out'); setTimeout(() => { this.voiceEl.hidden = true; }, 900); }, Math.max(3.5, text.length * 0.075) * 1000);
  }

  // A sound, in words ([Glass shatters, in the bedroom]), for players who turned sound captions on.
  soundCaption(text, seconds = 2.8) {
    if (!this.soundCaptions) return;
    this.soundEl.textContent = text; this.soundEl.hidden = false; this.soundEl.classList.remove('out');
    clearTimeout(this.soundTimer);
    this.soundTimer = setTimeout(() => { this.soundEl.classList.add('out'); setTimeout(() => { this.soundEl.hidden = true; }, 900); }, seconds * 1000);
  }

  crouch(on) { this.crouchEl.hidden = !on; }

  // Read a document: { html, className, back (html, F turns it over), onClose }.
  examine(doc) {
    this.docSpec = doc;
    this.docFlip = !!doc.back; this.flipped = false;
    const sheet = this.docEl.querySelector('.sheet');
    sheet.className = `sheet ${doc.className || ''}`;
    sheet.innerHTML = doc.html;
    this.docEl.querySelector('.hint').textContent = doc.back ? 'F · turn it over    E · put it down' : 'E · put it down';
    this.docEl.hidden = false;
    this.reading = true;
  }

  flip() {
    const sheet = this.docEl.querySelector('.sheet'), d = this.docSpec;
    this.flipped = !this.flipped;
    sheet.innerHTML = this.flipped ? d.back : d.html;
    sheet.classList.toggle('back', this.flipped);
    if (this.flipped) d.onFlip?.();
  }

  closeDoc() {
    if (this.docEl.hidden) return;
    this.docEl.hidden = true; this.reading = false;
    const d = this.docSpec; this.docSpec = null;
    d?.onClose?.();
  }
}
