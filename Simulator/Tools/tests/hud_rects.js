// hud_rects.js -- the phone HUD boxes the overlap checker compares; shared by phone.js (real game) and layout.js (harness)
module.exports = function hudRects() {
  const $ = id => document.getElementById(id);
  const vis = id => { const e = $(id); if (!e) return null; for (let q = e; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).display === 'none') return null;
    const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null; };
  return { badge: vis('top-left'), raceTop: vis('race-top'), tmenu: vis('t-menu'), topRight: vis('top-right'), tach: vis('tach'), cluster: vis('cluster'), mode: vis('mode'),
    tLeft: vis('t-left'), tRight: vis('t-right'), tGas: vis('t-gas'), tBrake: vis('t-brake'), tHand: vis('t-hand'), tNos: vis('t-nos'), wheel: vis('t-wheel'), damage: vis('damage') };
};
