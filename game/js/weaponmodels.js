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
    rpg: [0, 0.06, -0.92], ic: [0, 0.06, -0.92], gl: [0, 0.03, -0.82], pl: [0, 0.03, -0.67], sniper: [0, 0.05, -1.15],
    autorifle: [0, 0.05, -0.88], ac: [0, 0.05, -0.95], flamer: [0, 0.04, -0.95], tranq: [0, 0.03, -0.37], railgun: [0, 0.03, -0.42],
  };

  // st: { kick, pump, drum, spin, charge, bolt, hasAmmo, time, swing }
  // Box and pseudo-cylinder helpers bound to one parent transform.
  function parts(r, base) {
    const P = (t, s, c, o, rot) => {
      let m = M.translate(t[0], t[1], t[2]); if (rot) m = M.mul(m, rot);
      r.drawMesh(r.cube, M.mul(base, M.mul(m, M.scale(s[0], s[1], s[2]))), c, o);
    };
    // octagon-ish cylinder along Z: a plus of two boxes and a 45 degree square
    const CYL = (t, rad, len, c, o) => {
      P(t, [rad * 2, rad * 0.85, len], c, o); P(t, [rad * 0.85, rad * 2, len], c, o);
      P(t, [rad * 1.5, rad * 1.5, len], c, o, M.rotZ(Math.PI / 4));
    };
    // same, standing along Y
    const CYLY = (t, rad, len, c, o) => {
      P(t, [rad * 2, len, rad * 0.85], c, o); P(t, [rad * 0.85, len, rad * 2], c, o);
      P(t, [rad * 1.5, len, rad * 1.5], c, o, M.rotY(Math.PI / 4));
    };
    return { P, CYL, CYLY };
  }

  function drawWeapon(r, base, model, st) {
    st = st || {};
    const { P, CYL, CYLY } = parts(r, base);
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
      // The demoman's two launchers used to be the same model with one blinking
      // pixel between them, which is no good for guns that behave completely
      // differently: pipes bounce and time out, pipebombs stick and wait for your
      // detonator. They now read apart at a glance, in the hand and across the map.
      case 'gl': {
        // Grenade launcher: long barrel, open six-round drum, wood furniture.
        CYL([0, 0.03, -0.52], 0.032, 0.56, GUN);
        CYL([0, 0.03, -0.76], 0.042, 0.09, STEEL);            // flared muzzle
        const drum = st.drum || 0;
        CYL([0, 0.03, -0.15], 0.085, 0.2, [0.24, 0.25, 0.27]); // drum housing
        for (let i = 0; i < 6; i++) {
          const a = drum + i * Math.PI / 3;
          const cx = Math.cos(a) * 0.055, cy = 0.03 + Math.sin(a) * 0.055;
          P([cx, cy, -0.15], [0.036, 0.036, 0.21], STEEL);
          P([cx, cy, -0.255], [0.03, 0.03, 0.02], BRASS);      // a shell in each chamber
        }
        P([0, 0.03, -0.02], [0.085, 0.095, 0.12], GUN);
        P([0, -0.02, 0.15], [0.05, 0.09, 0.3], WOOD);          // stock
        P([0, 0.095, -0.02], [0.05, 0.03, 0.1], WOOD);         // cheek rest
        P([0, 0.115, -0.42], [0.012, 0.03, 0.02], STEEL);      // front sight
        P([0, 0.105, -0.02], [0.03, 0.018, 0.015], STEEL);     // rear notch
        P([0, -0.055, -0.02], [0.035, 0.09, 0.05], GUN, undefined, M.rotX(0.2)); // grip
        break;
      }
      case 'pl': {
        // Pipebomb launcher: stubby, boxy, drum of live bombs under a cage, and a
        // detonator box on top whose light pulses while bombs are out.
        const BODY = [0.2, 0.22, 0.2], BOMB = [0.32, 0.34, 0.3];
        CYL([0, 0.03, -0.42], 0.042, 0.4, BODY);
        CYL([0, 0.03, -0.62], 0.055, 0.07, [0.14, 0.15, 0.16]);  // thick muzzle collar
        const drum = st.drum || 0;
        CYLY([0, 0.03, -0.16], 0.095, 0.14, [0.18, 0.19, 0.2]);  // flat drum, lying over
        for (let i = 0; i < 5; i++) {
          const a = drum + i * Math.PI * 2 / 5;
          const cx = Math.cos(a) * 0.062, cz = -0.16 + Math.sin(a) * 0.062;
          CYLY([cx, 0.045, cz], 0.026, 0.1, BOMB);               // a pipebomb standing in each slot
          P([cx, 0.1, cz], [0.02, 0.012, 0.02], [0.75, 0.1, 0.1]);
        }
        P([0, 0.03, 0.0], [0.09, 0.1, 0.14], BODY);
        P([0, -0.02, 0.15], [0.05, 0.09, 0.26], [0.13, 0.13, 0.14]);  // polymer stock, not wood
        // detonator box
        P([0, 0.125, 0.02], [0.06, 0.045, 0.11], [0.18, 0.18, 0.2]);
        P([0.02, 0.15, -0.01], [0.012, 0.012, 0.012], [0.3, 0.3, 0.3]);
        const armed = st.armed;   // number of live pipebombs
        const blink = armed ? (Math.sin((st.time || 0) * 9) > 0 ? [1, 0.15, 0.15] : [0.35, 0.04, 0.04]) : [0.1, 0.3, 0.12];
        P([-0.02, 0.15, -0.01], [0.016, 0.014, 0.016], blink, { emissive: 1 });
        P([0, -0.055, 0.0], [0.035, 0.09, 0.05], BODY, undefined, M.rotX(0.2));
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

  // ------------------------------------------------------------------ sentry gun
  // Local space: origin on the ground, +Y up, -Z is the base's facing.
  const SENTRY_LEVELS = [
    { hub: 0.50, headY: 0.70, house: [0.40, 0.26, 0.44], barrels: 1, blen: 0.46, brad: 0.045, legR: 0.34, legT: 0.07 },
    { hub: 0.54, headY: 0.78, house: [0.52, 0.32, 0.52], barrels: 2, blen: 0.52, brad: 0.05,  legR: 0.38, legT: 0.085 },
    { hub: 0.56, headY: 0.82, house: [0.58, 0.36, 0.56], barrels: 2, blen: 0.54, brad: 0.055, legR: 0.40, legT: 0.095 },
  ];
  const SENTRY_HEIGHT = [1.0, 1.15, 1.3];

  function drawSentry(r, root, level, teamCol, st) {
    st = st || {};
    const L = SENTRY_LEVELS[Math.min(2, Math.max(0, level - 1))];
    const DARK = [0.19, 0.20, 0.22], METAL = [0.46, 0.48, 0.51], MID = [0.32, 0.33, 0.36];
    const RUB = [0.11, 0.11, 0.12], WARN = [0.82, 0.66, 0.12];
    const team = teamCol, teamDim = [teamCol[0] * 0.55, teamCol[1] * 0.55, teamCol[2] * 0.55];
    const { P, CYLY } = parts(r, root);

    // ---- tripod: three splayed legs with feet
    for (let i = 0; i < 3; i++) {
      const a = (st.baseSpin || 0) + i * Math.PI * 2 / 3 + Math.PI;
      const fx = Math.sin(a) * L.legR, fz = Math.cos(a) * L.legR;
      const len = Math.hypot(L.legR, L.hub);
      // tilt so the box's +Z runs exactly from the hub down to the foot
      const tilt = Math.atan2(L.hub, L.legR);
      const legM = M.mul(M.translate(fx / 2, L.hub / 2, fz / 2), M.mul(M.rotY(a), M.rotX(tilt)));
      r.drawMesh(r.cube, M.mul(root, M.mul(legM, M.scale(L.legT, L.legT * 0.9, len))), MID);
      r.drawMesh(r.cube, M.mul(root, M.mul(legM, M.scale(L.legT * 0.45, L.legT * 1.15, len * 0.55))), DARK);
      // foot pad
      r.drawMesh(r.cube, M.mul(root, M.mul(M.translate(fx, 0.03, fz), M.mul(M.rotY(a), M.scale(0.17, 0.06, 0.13)))), DARK);
      if (level >= 2) r.drawMesh(r.cube, M.mul(root, M.mul(M.translate(fx * 0.5, L.hub * 0.46, fz * 0.5), M.mul(M.rotY(a), M.scale(0.12, 0.04, 0.04)))), METAL);
    }
    // ---- hub and turntable
    CYLY([0, L.hub, 0], 0.13, 0.16, MID);
    CYLY([0, L.hub + 0.11, 0], 0.17, 0.07, DARK);
    if (level >= 2) CYLY([0, L.hub + 0.15, 0], 0.2, 0.04, teamDim);

    // ---- head (yaw then pitch)
    const head = M.mul(root, M.mul(M.translate(0, L.headY, 0), M.mul(M.rotY(st.yaw || 0), M.rotX(st.pitch || 0))));
    const H = parts(r, head);
    const h = L.house;
    // main housing
    H.P([0, 0, 0], [h[0], h[1], h[2]], MID);
    // team side plates
    H.P([h[0] / 2 + 0.012, 0, -0.02], [0.03, h[1] * 0.82, h[2] * 0.8], team);
    H.P([-h[0] / 2 - 0.012, 0, -0.02], [0.03, h[1] * 0.82, h[2] * 0.8], team);
    // sloped front armour with a team band
    H.P([0, 0.02, -h[2] / 2 - 0.03], [h[0] * 0.86, h[1] * 0.78, 0.07], DARK);
    H.P([0, h[1] * 0.3, -h[2] / 2 - 0.07], [h[0] * 0.7, h[1] * 0.2, 0.02], team);
    H.P([0, h[1] / 2 + 0.005, 0.02], [h[0] * 0.7, 0.02, h[2] * 0.7], teamDim);
    // rear counterweight / motor
    H.P([0, -0.02, h[2] / 2 + 0.06], [h[0] * 0.62, h[1] * 0.7, 0.14], DARK);
    // ---- barrels with recoil
    const rec = (st.recoil || 0) * 0.07;
    const bx = L.barrels === 2 ? [-0.10, 0.10] : [0];
    for (const x of bx) {
      H.CYL([x, 0.01, -h[2] / 2 - 0.1 - L.blen / 2 + rec], L.brad, L.blen, DARK);
      H.CYL([x, 0.01, -h[2] / 2 - 0.1 - L.blen + 0.04 + rec], L.brad * 1.35, 0.07, [0.15, 0.15, 0.16]);
      // cooling rings
      for (let k = 0; k < 3; k++) H.CYL([x, 0.01, -h[2] / 2 - 0.16 - k * 0.11 + rec], L.brad * 1.25, 0.03, METAL);
    }
    // ---- ammo feed
    if (level >= 2) {
      H.P([h[0] / 2 - 0.02, h[1] / 2 + 0.07, 0.06], [0.16, 0.14, 0.26], DARK);
      H.P([h[0] / 2 - 0.02, h[1] / 2 + 0.07, 0.06], [0.17, 0.03, 0.27], WARN);
    } else {
      H.P([h[0] / 2 + 0.03, 0.0, 0.1], [0.08, 0.16, 0.16], DARK);
    }
    // ---- sight and status light
    H.P([0, h[1] / 2 + 0.03, -0.06], [0.05, 0.05, 0.14], METAL);
    H.P([0, h[1] / 2 + 0.03, -0.14], [0.025, 0.025, 0.03], st.target ? [1, 0.2, 0.15] : [0.2, 1, 0.3], { emissive: 1 });
    // ---- level 3 rocket pod
    if (level >= 3) {
      const pod = M.mul(head, M.translate(0, h[1] / 2 + 0.12, 0.02));
      const Pd = parts(r, pod);
      Pd.P([0, 0, 0], [0.34, 0.2, 0.3], DARK);
      Pd.P([0, 0.11, 0], [0.35, 0.03, 0.31], WARN);
      for (const rx of [-0.08, 0.08]) for (const ry of [-0.045, 0.045]) Pd.CYL([rx, ry, -0.17], 0.035, 0.08, [0.1, 0.1, 0.11]);
      for (const rx of [-0.08, 0.08]) for (const ry of [-0.045, 0.045]) Pd.CYL([rx, ry, -0.2], 0.022, 0.05, [0.7, 0.25, 0.1], { emissive: 0.3 });
    }
    // ---- muzzle flash
    if (st.flash > 0) {
      for (const x of bx) {
        const m = M.mul(head, M.translate(x, 0.01, -h[2] / 2 - 0.12 - L.blen));
        const f = st.flash;
        for (let i = 0; i < 2; i++) r.drawMesh(r.cube, M.mul(m, M.mul(M.rotZ(f * 7 + i * 1.57), M.scale(0.11 * f, 0.025, 0.07))), [1, 0.85, 0.4], { emissive: 1 });
        r.drawMesh(r.sphere, M.mul(m, M.scale(0.055, 0.055, 0.12)), [1, 0.95, 0.7], { emissive: 1 });
      }
    }
  }
  // The toolbox an engineer drops before the gun assembles itself.
  function drawToolbox(r, root, teamCol, open) {
    const { P } = parts(r, root);
    const DARK = [0.2, 0.21, 0.23], MID = [0.35, 0.36, 0.39];
    P([0, 0.12, 0], [0.62, 0.24, 0.42], MID);
    P([0, 0.245, 0], [0.64, 0.03, 0.44], teamCol);
    P([0, 0.3, -0.19], [0.5, 0.1, 0.05], DARK);
    if (open > 0) {
      const a = -open * 1.5;
      r.drawMesh(r.cube, M.mul(root, M.mul(M.translate(0, 0.26, 0.21), M.mul(M.rotX(a), M.mul(M.translate(0, 0.03, -0.21), M.scale(0.62, 0.06, 0.42))))), DARK);
    }
  }

  // ---- demoman ordnance ----
  // Both of these used to be plain cubes, which made a live pipebomb sitting on
  // the floor look like a crate. They are the two things a demoman leaves lying
  // around the map, so they have to be readable at a glance and tellable apart.

  // Grenade-launcher pipe: a tumbling iron slug. The fuse tip heats up as it runs
  // down, so you can see how close a bouncing pipe is to going off.
  function drawPipe(r, base, hot) {
    const { P, CYL } = parts(r, base);
    const IRON = [0.24, 0.25, 0.26];
    CYL([0, 0, 0], 0.072, 0.28, IRON);
    CYL([0, 0, 0.145], 0.082, 0.035, STEEL);     // end caps
    CYL([0, 0, -0.145], 0.082, 0.035, STEEL);
    CYL([0, 0, 0], 0.085, 0.05, BRASS);          // band round the middle
    const h = Math.max(0, Math.min(1, hot || 0));
    P([0, 0, -0.18], [0.03, 0.03, 0.04], [1, 0.35 + h * 0.5, 0.1 + h * 0.3], { emissive: 0.4 + h * 0.6 });
  }

  // Pipebomb: a capped steel pipe with a team band and a live detonator light.
  // The band is what tells you whose it is before you walk over it.
  function drawPipebomb(r, base, team, lit) {
    const { P, CYL, CYLY } = parts(r, base);
    const PIPE = [0.3, 0.31, 0.33];
    CYL([0, 0, 0], 0.065, 0.26, PIPE);
    // Team colour on the END CAPS as well as the waist band. A bomb lying with
    // its length pointing at you shows nothing but a cap, and a grey cap tells
    // you nothing about who left it there.
    CYL([0, 0, 0.135], 0.079, 0.045, team);
    CYL([0, 0, -0.135], 0.079, 0.045, team);
    CYL([0, 0, 0.155], 0.05, 0.012, [0.42, 0.43, 0.45]);   // bolt heads on the caps
    CYL([0, 0, -0.155], 0.05, 0.012, [0.42, 0.43, 0.45]);
    CYL([0, 0, 0], 0.073, 0.06, team);                     // waist band
    P([0, 0.075, 0], [0.05, 0.035, 0.07], [0.16, 0.16, 0.18]);   // detonator pack
    CYLY([0.03, 0.13, -0.02], 0.006, 0.09, [0.35, 0.35, 0.38]);  // aerial
    P([-0.015, 0.098, 0.01], [0.018, 0.014, 0.018], lit ? [1, 0.15, 0.15] : [0.35, 0.05, 0.05], { emissive: lit ? 1 : 0.2 });
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
  Object.assign(root, { drawWeapon, drawMuzzleFlash, drawSentry, drawToolbox, drawPipe, drawPipebomb, SENTRY_HEIGHT, WEAPON_MUZZLE: MUZZLE });
})(window);
