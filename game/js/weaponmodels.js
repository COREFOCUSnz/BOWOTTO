// Weapon models built from cubes, shared by the first-person viewmodel and the
// third-person player models. Weapon-local frame: the hand/grip is the origin,
// the barrel points down -Z, +Y is up. Units are metres.
(function (root) {
  'use strict';
  const { M } = root;
  const GUN = [0.16, 0.17, 0.19], STEEL = [0.5, 0.52, 0.55], WOOD = [0.42, 0.27, 0.13], BRASS = [0.75, 0.6, 0.25];
  const OLIVE = [0.3, 0.33, 0.25], RED = [0.6, 0.12, 0.1], DARKWOOD = [0.3, 0.19, 0.09], RUBBER = [0.1, 0.1, 0.1];

  // Per-model muzzle position in weapon space (for flashes, laser dot).
  const MUZZLE = {
    shotgun: [0, 0.05, -0.93], supershotgun: [0, 0.04, -0.9], nailgun: [0, 0.03, -0.76], supernailgun: [0, 0.03, -0.8],
    rpg: [0, 0.06, -0.92], ic: [0, 0.06, -0.92], gl: [0, 0.03, -0.77], pl: [0, 0.03, -0.77], sniper: [0, 0.05, -1.15],
    autorifle: [0, 0.05, -0.88], ac: [0, 0.05, -0.95], flamer: [0, 0.04, -0.95], tranq: [0, 0.03, -0.37], railgun: [0, 0.03, -0.42],
  };

  // st: { kick, pump, drum, spin, charge, bolt, hasAmmo, time, swing }
  function drawWeapon(r, base, model, st) {
    st = st || {};
    const P = (t, s, c, o, rot) => {
      let m = M.translate(t[0], t[1], t[2]); if (rot) m = M.mul(m, rot);
      r.drawMesh(r.cube, M.mul(base, M.mul(m, M.scale(s[0], s[1], s[2]))), c, o);
    };
    // octagon-ish cylinder along Z: a plus of two boxes and a 45° square
    const CYL = (t, rad, len, c, o) => {
      P(t, [rad * 2, rad * 0.85, len], c, o); P(t, [rad * 0.85, rad * 2, len], c, o);
      P(t, [rad * 1.5, rad * 1.5, len], c, o, M.rotZ(Math.PI / 4));
    };
    const kick = st.kick || 0, pump = st.pump || 0;
    switch (model) {
      case 'shotgun':
        P([0, 0.02, -0.15], [0.07, 0.09, 0.32], GUN);
        P([0.04, 0.03, -0.05], [0.01, 0.02, 0.05], STEEL);            // ejection port
        CYL([0, 0.05, -0.6], 0.018, 0.68, GUN);
        CYL([0, 0.005, -0.55], 0.014, 0.55, GUN);                     // magazine tube
        P([0, -0.005, -0.42 + pump * 0.09], [0.06, 0.06, 0.17], WOOD); // pump / forend
        P([0, -0.02, 0.15], [0.05, 0.1, 0.3], WOOD);
        P([0, 0.075, -0.92], [0.01, 0.015, 0.01], BRASS);             // bead
        break;
      case 'supershotgun':
        CYL([-0.022, 0.04, -0.55], 0.02, 0.72, GUN); CYL([0.022, 0.04, -0.55], 0.02, 0.72, GUN);
        P([0, 0.04, -0.2], [0.09, 0.02, 0.05], GUN);                  // rib
        P([0, 0.02, -0.1], [0.09, 0.09, 0.26], GUN);
        P([0, -0.01, -0.4], [0.075, 0.05, 0.22], WOOD);
        P([0, -0.03, 0.14], [0.06, 0.1, 0.28], WOOD);
        P([0, -0.06, -0.05], [0.02, 0.03, 0.06], GUN);                // trigger guard
        break;
      case 'nailgun': case 'supernailgun': {
        const sup = model === 'supernailgun';
        P([0, 0.03, -0.2], [sup ? 0.15 : 0.12, 0.12, 0.42], GUN);
        P([0, 0.03, -0.42], [sup ? 0.16 : 0.13, 0.13, 0.03], STEEL);
        const bs = sup ? [[-0.035, 0.06], [0.035, 0.06], [-0.035, 0.0], [0.035, 0.0]] : [[-0.03, 0.03], [0.03, 0.03]];
        bs.forEach((b, i) => CYL([b[0], b[1], -0.58], 0.014, 0.36, i === (st.barrel || 0) % bs.length ? STEEL : [0.35, 0.36, 0.38]));
        P([0, 0.14, -0.15], [0.1, 0.08, 0.2], OLIVE);                // nail drum
        for (let i = 0; i < 4; i++) P([-0.03 + i * 0.02, 0.185, -0.15], [0.006, 0.01, 0.18], BRASS);
        P([0, -0.05, 0.0], [0.05, 0.06, 0.08], RUBBER);
        break;
      }
      case 'rpg': case 'ic': {
        const body = model === 'ic' ? [0.5, 0.3, 0.15] : OLIVE;
        CYL([0, 0.06, -0.35], 0.045, 1.0, body);
        P([0, 0.06, -0.88], [0.12, 0.12, 0.06], GUN);
        P([0, 0.06, 0.17], [0.11, 0.11, 0.06], GUN);
        P([0, 0.14, -0.45], [0.02, 0.05, 0.08], GUN); P([0, 0.17, -0.45], [0.06, 0.02, 0.02], GUN);
        P([0, 0.0, -0.3], [0.04, 0.08, 0.05], GUN);
        if (model === 'ic') { CYL([0, 0.15, -0.15], 0.035, 0.3, RED); P([0, 0.15, -0.31], [0.05, 0.05, 0.02], BRASS); }
        else if (st.hasAmmo !== false) P([0, 0.06, -0.86], [0.05, 0.05, 0.05], RED, { emissive: 0.3 });
        break;
      }
      case 'gl': case 'pl': {
        CYL([0, 0.03, -0.5], 0.03, 0.5, GUN);
        P([0, 0.03, -0.75], [0.075, 0.075, 0.03], STEEL);
        const drum = st.drum || 0;
        for (let i = 0; i < 6; i++) { const a = drum + i * Math.PI / 3; P([Math.cos(a) * 0.05, 0.03 + Math.sin(a) * 0.05, -0.15], [0.035, 0.035, 0.16], model === 'pl' ? [0.3, 0.32, 0.3] : STEEL); }
        P([0, 0.03, -0.15], [0.05, 0.05, 0.19], GUN);
        P([0, 0.03, -0.02], [0.08, 0.09, 0.1], GUN);
        P([0, -0.02, 0.15], [0.05, 0.09, 0.3], WOOD);
        P([0, 0.1, -0.3], [0.015, 0.03, 0.02], GUN);
        if (model === 'pl') P([0, 0.1, -0.05], [0.015, 0.015, 0.015], Math.sin((st.time || 0) * 10) > 0 ? [1, 0.15, 0.15] : [0.4, 0.05, 0.05], { emissive: 1 });
        break;
      }
      case 'sniper':
        CYL([0, 0.05, -0.72], 0.014, 0.9, GUN);
        P([0, 0.03, -0.15], [0.05, 0.08, 0.36], GUN);
        CYL([0, 0.125, -0.2], 0.025, 0.3, GUN);
        P([0, 0.125, -0.355], [0.045, 0.045, 0.006], [0.3, 0.6, 0.9], { emissive: 0.5 });
        P([0, 0.085, -0.1], [0.02, 0.03, 0.03], GUN); P([0, 0.085, -0.3], [0.02, 0.03, 0.03], GUN);
        P([0.045, 0.04, -0.06 + (st.bolt || 0) * 0.08], [0.06, 0.015, 0.015], STEEL);
        P([0, -0.01, 0.14], [0.045, 0.09, 0.3], WOOD);
        P([0, 0.01, -0.45], [0.045, 0.06, 0.32], WOOD);
        if (st.charge > 0) P([0, 0.05, -1.17], [0.012, 0.012, 0.02], [1, 0.1, 0.1], { emissive: 1 });
        break;
      case 'autorifle':
        P([0, 0.03, -0.2], [0.06, 0.1, 0.45], GUN);
        CYL([0, 0.05, -0.65], 0.015, 0.46, GUN);
        P([0, 0.03, -0.5], [0.055, 0.07, 0.26], [0.25, 0.25, 0.27]);
        P([0, -0.1, -0.12], [0.035, 0.16, 0.08], GUN, undefined, M.rotX(0.15));
        P([0, 0.11, -0.15], [0.02, 0.04, 0.2], GUN);
        P([0, 0.02, 0.15], [0.04, 0.06, 0.25], GUN);
        break;
      case 'ac': {
        const spin = st.spin || 0;
        for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3; CYL([Math.cos(a) * 0.045, 0.05 + Math.sin(a) * 0.045, -0.55], 0.012, 0.76, STEEL); }
        CYL([0, 0.05, -0.55], 0.02, 0.8, GUN);
        P([0, 0.05, -0.9], [0.14, 0.14, 0.03], GUN); P([0, 0.05, -0.4], [0.14, 0.14, 0.03], GUN);
        P([0, 0.05, -0.05], [0.16, 0.18, 0.3], GUN);
        P([-0.13, -0.05, -0.05], [0.12, 0.2, 0.24], OLIVE);
        P([0, 0.2, -0.1], [0.03, 0.03, 0.2], GUN); P([0, 0.15, -0.1], [0.02, 0.06, 0.02], GUN);
        break;
      }
      case 'flamer':
        CYL([0.06, 0.0, 0.05], 0.05, 0.35, RED); CYL([-0.06, 0.0, 0.05], 0.05, 0.35, OLIVE);
        P([0, 0.05, 0.05], [0.16, 0.02, 0.3], GUN);
        CYL([0, 0.04, -0.45], 0.02, 0.72, GUN);
        P([0, 0.04, -0.85], [0.06, 0.06, 0.1], GUN);
        P([0, 0.1, -0.2], [0.02, 0.06, 0.02], BRASS); P([0, 0.14, -0.2], [0.06, 0.012, 0.06], BRASS);
        P([0, 0.04, -0.93], [0.02, 0.02, 0.04], [1, 0.6, 0.2], { emissive: 1 });      // pilot light
        break;
      case 'tranq':
        P([0, 0.03, -0.13], [0.04, 0.05, 0.24], GUN);
        CYL([0, 0.03, -0.3], 0.012, 0.14, STEEL);
        P([0, -0.03, 0.0], [0.035, 0.08, 0.05], RUBBER);
        P([0, 0.065, -0.24], [0.01, 0.015, 0.01], [0.3, 0.9, 0.3], { emissive: 0.6 });
        break;
      case 'railgun':
        P([0, 0.03, -0.15], [0.05, 0.07, 0.3], GUN);
        CYL([0, 0.03, -0.32], 0.012, 0.2, STEEL);
        for (let i = 0; i < 3; i++) P([0, 0.03, -0.2 - i * 0.08], [0.07, 0.07, 0.02], [0.3, 0.6, 1], { emissive: 0.8 });
        P([0, -0.03, 0.0], [0.035, 0.08, 0.05], RUBBER);
        break;
      case 'crowbar': case 'melee': {
        const sw = M.rotX(-(st.swing || 0));
        P([0, 0, -0.28], [0.03, 0.03, 0.5], RED, undefined, sw);
        P([0, 0.03, -0.52], [0.03, 0.07, 0.04], RED, undefined, sw);
        P([0, 0.055, -0.49], [0.03, 0.025, 0.08], RED, undefined, sw);
        P([0, 0, -0.05], [0.035, 0.035, 0.12], RUBBER, undefined, sw);
        break;
      }
      case 'knife': {
        const sw = M.rotX(-(st.swing || 0) * 0.6);
        P([0, 0, -0.1], [0.03, 0.045, 0.14], RUBBER, undefined, sw);
        P([0, 0, -0.18], [0.05, 0.015, 0.02], STEEL, undefined, sw);
        P([0, 0.005, -0.33], [0.012, 0.035, 0.28], [0.8, 0.82, 0.86], undefined, sw);
        break;
      }
      case 'spanner': {
        const sw = M.rotX(-(st.swing || 0));
        P([0, 0, -0.25], [0.04, 0.02, 0.4], STEEL, undefined, sw);
        P([0, 0, -0.47], [0.12, 0.03, 0.08], STEEL, undefined, sw);
        P([0.045, 0, -0.52], [0.03, 0.03, 0.06], STEEL, undefined, sw); P([-0.045, 0, -0.52], [0.03, 0.03, 0.06], STEEL, undefined, sw);
        break;
      }
      case 'medkit': {
        const sw = M.rotX(-(st.swing || 0) * 0.5);
        P([0, 0, -0.25], [0.26, 0.18, 0.3], [0.92, 0.92, 0.92], undefined, sw);
        P([0, 0.095, -0.25], [0.18, 0.01, 0.05], RED, undefined, sw); P([0, 0.095, -0.25], [0.05, 0.01, 0.18], RED, undefined, sw);
        P([0, 0.11, -0.25], [0.12, 0.02, 0.03], [0.5, 0.5, 0.5], undefined, sw);
        CYL([0.08, -0.02, -0.45], 0.01, 0.16, STEEL);                   // syringe
        P([0.08, -0.02, -0.55], [0.004, 0.004, 0.06], STEEL);
        break;
      }
    }
  }
  // 3 crossed emissive blades + core, pointing along -Z at the muzzle
  function drawMuzzleFlash(r, base, model, seed) {
    const mz = MUZZLE[model]; if (!mz) return;
    const m = M.mul(base, M.translate(mz[0], mz[1], mz[2] - 0.08));
    const col = [1, 0.85, 0.4];
    for (let i = 0; i < 3; i++) {
      const rz = M.rotZ(seed * 2 + i * Math.PI / 3);
      r.drawMesh(r.cube, M.mul(m, M.mul(rz, M.scale(0.28, 0.05, 0.16))), col, { emissive: 1 });
    }
    r.drawMesh(r.sphere, M.mul(m, M.scale(0.14, 0.14, 0.3)), [1, 0.95, 0.7], { emissive: 1 });
  }
  Object.assign(root, { drawWeapon, drawMuzzleFlash, WEAPON_MUZZLE: MUZZLE });
})(window);
