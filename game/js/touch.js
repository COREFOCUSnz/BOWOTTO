// Touch controls: a floating left stick for movement, right-side drag to look,
// and on-screen buttons. Exposes the same shape of state the keyboard path uses.
(function (root) {
  'use strict';
  const clamp = root.clamp;

  class TouchControls {
    constructor(canvas) {
      this.canvas = canvas;
      this.enabled = false;
      this.move = [0, 0];              // x strafe, y forward, each -1..1
      this.look = [0, 0];              // pixels accumulated since the last read
      this.btn = { fire: false, jump: false, gren: false, gren2: false, alt: false, down: false };
      this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
      this.lookId = null; this.lookX = 0; this.lookY = 0;
      this.handlers = {};
      this.radius = 58;
      this.el = {};
    }
    // Turn the on-screen UI on. Safe to call more than once.
    enable() {
      if (this.enabled) return;
      this.enabled = true;
      document.body.classList.add('touch');
      this.build();
      this.bindCanvas();
    }
    on(name, fn) { this.handlers[name] = fn; }
    fire(name, arg) { const f = this.handlers[name]; if (f) f(arg); }

    build() {
      const wrap = document.getElementById('touch');
      wrap.hidden = false;
      const mk = (cls, label, id) => {
        const b = document.createElement('button');
        b.className = 'tb ' + cls; b.innerHTML = label; b.id = id || '';
        b.setAttribute('type', 'button');
        wrap.appendChild(b); return b;
      };
      const hold = (b, key) => {
        b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.btn[key] = true; b.classList.add('on'); }, { passive: false });
        const off = (e) => { e.preventDefault(); e.stopPropagation(); this.btn[key] = false; b.classList.remove('on'); };
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
      };
      const tap = (b, name) => {
        b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); this.fire(name); }, { passive: false });
        const off = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.remove('on'); };
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
      };
      this.el.fire = mk('fire', 'FIRE');       hold(this.el.fire, 'fire');
      this.el.jump = mk('jump', 'JUMP');       hold(this.el.jump, 'jump');
      this.el.down = mk('down', 'DIVE');       hold(this.el.down, 'down');
      this.el.gren = mk('gren', 'GREN<b></b>'); hold(this.el.gren, 'gren');
      this.el.gren2 = mk('gren2', 'GREN2<b></b>'); hold(this.el.gren2, 'gren2');
      this.el.action = mk('action', 'ACTION'); tap(this.el.action, 'action');
      this.el.menu = mk('menu', '&#9776;');    tap(this.el.menu, 'menu');
      this.el.scores = mk('scores', 'SCORE');
      this.el.scores.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.fire('scores', true); }, { passive: false });
      this.el.scores.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.fire('scores', false); }, { passive: false });
      this.el.weapons = [];
      const col = document.createElement('div'); col.className = 'wcol'; wrap.appendChild(col);
      this.el.wcol = col;
      for (let i = 0; i < 4; i++) {
        const b = document.createElement('button');
        b.className = 'tb w'; b.setAttribute('type', 'button'); b.dataset.i = i;
        b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.fire('weapon', i); }, { passive: false });
        col.appendChild(b); this.el.weapons.push(b);
      }
      // the stick lives on the canvas layer so it can follow the thumb
      this.el.stick = document.createElement('div'); this.el.stick.className = 'stick'; this.el.stick.hidden = true;
      wrap.appendChild(this.el.stick);
      this.el.knob = document.createElement('div'); this.el.knob.className = 'knob';
      this.el.stick.appendChild(this.el.knob);
    }

    bindCanvas() {
      const c = this.canvas;
      const zone = (t) => (t.clientX < window.innerWidth * 0.42 ? 'move' : 'look');
      c.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (zone(t) === 'move' && this.stick.id === null) {
            this.stick.id = t.identifier; this.stick.ox = t.clientX; this.stick.oy = t.clientY;
            this.stick.x = 0; this.stick.y = 0; this.stick.active = true;
            this.el.stick.hidden = false;
            this.el.stick.style.left = t.clientX + 'px';
            this.el.stick.style.top = t.clientY + 'px';
            this.el.knob.style.transform = 'translate(-50%,-50%)';
          } else if (this.lookId === null) {
            this.lookId = t.identifier; this.lookX = t.clientX; this.lookY = t.clientY;
          }
        }
        this.fire('firsttouch');
      }, { passive: false });
      c.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.stick.id) {
            let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
            const len = Math.hypot(dx, dy);
            if (len > this.radius) { dx *= this.radius / len; dy *= this.radius / len; }
            this.stick.x = dx / this.radius; this.stick.y = dy / this.radius;
            this.el.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          } else if (t.identifier === this.lookId) {
            this.look[0] += t.clientX - this.lookX;
            this.look[1] += t.clientY - this.lookY;
            this.lookX = t.clientX; this.lookY = t.clientY;
          }
        }
      }, { passive: false });
      const end = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.stick.id) {
            this.stick.id = null; this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
            this.el.stick.hidden = true;
          } else if (t.identifier === this.lookId) this.lookId = null;
        }
      };
      c.addEventListener('touchend', end, { passive: false });
      c.addEventListener('touchcancel', end, { passive: false });
    }

    // Called once per frame by the game.
    read() {
      this.move[0] = this.stick.x;
      this.move[1] = -this.stick.y;         // screen down is backwards
      const l = [this.look[0], this.look[1]];
      this.look[0] = 0; this.look[1] = 0;
      return l;
    }
    // Refresh the labels that depend on the class and state.
    sync(p, state) {
      if (!this.enabled || !this.el.action) return;
      const a = state.actionLabel;
      this.el.action.innerHTML = a || '';
      this.el.action.style.display = a ? '' : 'none';
      this.el.down.style.display = state.inWater ? '' : 'none';
      const g = state.grenades;
      this.el.gren.innerHTML = 'GREN<b>' + (g[0] === null ? '' : g[0]) + '</b>';
      this.el.gren.style.display = g[0] === null ? 'none' : '';
      this.el.gren2.innerHTML = '2ND<b>' + (g[1] === null ? '' : g[1]) + '</b>';
      this.el.gren2.style.display = g[1] === null ? 'none' : '';
      this.el.weapons.forEach((b, i) => {
        const w = state.weapons[i];
        b.style.display = w ? '' : 'none';
        if (!w) return;
        b.innerHTML = w.short + (w.ammo !== null ? '<b>' + w.ammo + '</b>' : '');
        b.classList.toggle('sel', i === state.wi);
        b.classList.toggle('empty', w.ammo === 0);
      });
    }
  }
  Object.assign(root, { TouchControls });
})(window);
