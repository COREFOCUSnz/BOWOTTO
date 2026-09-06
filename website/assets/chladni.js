/* Chladni particle engine — shared by every page.
   amplitude(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy); grains take random
   steps scaled by |amplitude|, so they settle on the nodal lines. */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

function chladniAmp(x, y, m, n){
  const PI = Math.PI;
  return Math.cos(n*PI*x)*Math.cos(m*PI*y) - Math.cos(m*PI*x)*Math.cos(n*PI*y);
}

function makePlate(canvas, opts){
  const ctx = canvas.getContext('2d');
  const state = {
    m: opts.m, n: opts.n,
    agitation: opts.agitation ?? 0.55,
    grains: [],
    running: true
  };
  const COUNT = opts.count ?? 4000;

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w*dpr);
    canvas.height = Math.round(h*dpr);
  }

  function scatter(){
    state.grains.length = 0;
    for (let i=0;i<COUNT;i++)
      state.grains.push({x:Math.random(), y:Math.random()});
    // repaint once even when animation is off
    if (REDUCED) settle();
  }

  // With reduced motion: run the walk headlessly, draw the settled figure once.
  function settle(){
    for (let it=0; it<220; it++) stepAll();
    draw();
  }

  function stepAll(){
    const {m,n,agitation} = state;
    const step = 0.012*agitation + 0.0015;
    for (const g of state.grains){
      const a = Math.abs(chladniAmp(g.x*2-1, g.y*2-1, m, n));
      const s = step * Math.min(a*1.4, 1);
      g.x += (Math.random()-0.5)*s*2;
      g.y += (Math.random()-0.5)*s*2;
      if (g.x<0) g.x = -g.x; else if (g.x>1) g.x = 2-g.x;
      if (g.y<0) g.y = -g.y; else if (g.y>1) g.y = 2-g.y;
    }
  }

  function draw(){
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = opts.trail ? 'rgba(7,9,11,0.28)' : '#07090b';
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle = opts.color || '#eae3d2';
    const r = Math.max(1, Math.round(w/900));
    for (const g of state.grains)
      ctx.fillRect(g.x*w, g.y*h, r, r);
  }

  function frame(){
    if (state.running && !REDUCED){
      stepAll();
      draw();
    }
    requestAnimationFrame(frame);
  }

  new ResizeObserver(()=>{ resize(); draw(); }).observe(canvas);
  resize(); scatter();
  if (!REDUCED) requestAnimationFrame(frame); else settle();
  return {state, scatter, settle};
}

