// Class and weapon definitions (TFC-flavoured; 1 TFC unit ~= 2.5 cm, so 240 u/s = 6 m/s).
(function (root) {
  'use strict';
  const WEAPONS = {
    crowbar: { name: 'Crowbar', type: 'melee', dmg: 25, rate: 0.5, range: 1.6, model: 'melee' },
    knife: { name: 'Knife', type: 'melee', dmg: 40, rate: 0.5, range: 1.6, backstab: true, model: 'melee' },
    spanner: { name: 'Spanner', type: 'melee', dmg: 20, rate: 0.5, range: 1.6, model: 'melee' },
    medkit: { name: 'Medikit', type: 'melee', dmg: 10, rate: 0.5, range: 1.8, heal: 30, infect: true, model: 'melee' },
    shotgun: { name: 'Shotgun', type: 'hitscan', ammo: 'shells', perShot: 1, rate: 0.5, pellets: 6, dmg: 4, spread: 0.04, model: 'shotgun' },
    supershotgun: { name: 'Super Shotgun', type: 'hitscan', ammo: 'shells', perShot: 2, rate: 0.7, pellets: 14, dmg: 4, spread: 0.07, model: 'supershotgun' },
    nailgun: { name: 'Nailgun', type: 'proj', ammo: 'nails', perShot: 1, rate: 0.1, proj: 'nail', dmg: 9, speed: 50, model: 'nailgun' },
    supernailgun: { name: 'Super Nailgun', type: 'proj', ammo: 'nails', perShot: 2, rate: 0.1, proj: 'nail', dmg: 13, speed: 50, model: 'nailgun' },
    rpg: { name: 'Rocket Launcher', type: 'proj', ammo: 'rockets', perShot: 1, rate: 0.8, proj: 'rocket', dmg: 92, radius: 4.2, speed: 27, model: 'rpg' },
    gl: { name: 'Grenade Launcher', type: 'proj', ammo: 'rockets', perShot: 1, rate: 0.6, proj: 'pipe', dmg: 100, radius: 4, speed: 22, fuse: 2.5, model: 'gl' },
    pl: { name: 'Pipebomb Launcher', type: 'proj', ammo: 'rockets', perShot: 1, rate: 0.6, proj: 'pipebomb', dmg: 100, radius: 4, speed: 20, detonate: true, model: 'gl' },
    sniper: { name: 'Sniper Rifle', type: 'charge', ammo: 'shells', perShot: 1, rate: 1.4, dmg: 45, maxDmg: 380, chargeTime: 2.5, zoom: true, model: 'sniper' },
    autorifle: { name: 'Auto Rifle', type: 'hitscan', ammo: 'shells', perShot: 1, rate: 0.1, pellets: 1, dmg: 8, spread: 0.02, model: 'autorifle' },
    ac: { name: 'Assault Cannon', type: 'hitscan', ammo: 'shells', perShot: 1, rate: 0.08, pellets: 3, dmg: 6, spread: 0.09, spinup: 0.7, slow: 0.55, model: 'ac' },
    flamer: { name: 'Flamethrower', type: 'flame', ammo: 'cells', perShot: 1, rate: 0.08, dmg: 6, range: 7, burn: 3, model: 'flamer' },
    ic: { name: 'Incendiary Cannon', type: 'proj', ammo: 'rockets', perShot: 1, rate: 1.0, proj: 'ic', dmg: 55, radius: 3.5, speed: 30, burn: 4, model: 'rpg' },
    tranq: { name: 'Tranquilizer', type: 'proj', ammo: 'shells', perShot: 1, rate: 1.5, proj: 'dart', dmg: 18, speed: 40, slow: 5, model: 'autorifle' },
    railgun: { name: 'Railgun', type: 'hitscan', ammo: 'nails', perShot: 1, rate: 0.4, pellets: 1, dmg: 20, spread: 0.0, tracer: 1, model: 'autorifle' },
  };
  const GRENADES = {
    frag: { name: 'Frag', dmg: 100, radius: 4.5, fuse: 3.8 },
    conc: { name: 'Concussion', dmg: 0, radius: 6, push: 22, fuse: 3.8 },
    mirv: { name: 'MIRV', dmg: 90, radius: 4, fuse: 3.8, bomblets: 4 },
    nail: { name: 'Nail', dmg: 40, radius: 3, fuse: 3.8, nails: true },
    napalm: { name: 'Napalm', dmg: 25, radius: 3.5, fuse: 3.8, fire: 8 },
    emp: { name: 'EMP', dmg: 60, radius: 5, fuse: 3.8 },
    caltrop: { name: 'Caltrops', dmg: 10, radius: 2.5, fuse: 0.5 },
  };
  const AMMO_MAX = { shells: 200, nails: 300, rockets: 50, cells: 200 };
  const CLASSES = {
    scout: { name: 'Scout', hp: 75, armor: 50, armorMax: 50, armorType: 0.3, speed: 10.0, weapons: ['crowbar', 'shotgun', 'nailgun'], ammo: { shells: 25, nails: 100, rockets: 0, cells: 0 }, ammoMax: { shells: 50, nails: 200, rockets: 0, cells: 0 }, gren: ['caltrop', 'conc'], grenN: [3, 2], desc: 'Fastest class. Grab the flag and run.' },
    sniper: { name: 'Sniper', hp: 90, armor: 50, armorMax: 50, armorType: 0.3, speed: 7.5, weapons: ['crowbar', 'sniper', 'autorifle', 'nailgun'], ammo: { shells: 75, nails: 50, rockets: 0, cells: 0 }, ammoMax: { shells: 75, nails: 100, rockets: 0, cells: 0 }, gren: ['frag', null], grenN: [2, 0], desc: 'Charge the rifle for one-shot kills. Headshots hurt.' },
    soldier: { name: 'Soldier', hp: 100, armor: 200, armorMax: 200, armorType: 0.8, speed: 6.0, weapons: ['crowbar', 'shotgun', 'supershotgun', 'rpg'], ammo: { shells: 50, nails: 0, rockets: 36, cells: 0 }, ammoMax: { shells: 100, nails: 0, rockets: 50, cells: 0 }, gren: ['frag', 'nail'], grenN: [4, 1], desc: 'Rockets and heavy armor. Rocket-jump to the battlements.' },
    demoman: { name: 'Demoman', hp: 90, armor: 120, armorMax: 120, armorType: 0.6, speed: 7.0, weapons: ['crowbar', 'shotgun', 'gl', 'pl'], ammo: { shells: 30, nails: 0, rockets: 50, cells: 0 }, ammoMax: { shells: 75, nails: 0, rockets: 50, cells: 0 }, gren: ['frag', 'mirv'], grenN: [4, 2], desc: 'Pipes bounce, pipebombs wait for right-click.' },
    medic: { name: 'Medic', hp: 90, armor: 100, armorMax: 100, armorType: 0.3, speed: 8.0, weapons: ['medkit', 'shotgun', 'supershotgun', 'supernailgun'], ammo: { shells: 50, nails: 50, rockets: 0, cells: 0 }, ammoMax: { shells: 75, nails: 150, rockets: 0, cells: 0 }, gren: ['frag', 'conc'], grenN: [3, 2], desc: 'Heal teammates with the medikit; it infects enemies.' },
    hwguy: { name: 'HWGuy', hp: 100, armor: 300, armorMax: 300, armorType: 0.8, speed: 5.75, weapons: ['crowbar', 'shotgun', 'supershotgun', 'ac'], ammo: { shells: 200, nails: 0, rockets: 0, cells: 0 }, ammoMax: { shells: 200, nails: 0, rockets: 0, cells: 0 }, gren: ['frag', 'mirv'], grenN: [4, 1], desc: 'Slow, huge armor, assault cannon spins up.' },
    pyro: { name: 'Pyro', hp: 100, armor: 150, armorMax: 150, armorType: 0.6, speed: 7.5, weapons: ['crowbar', 'shotgun', 'flamer', 'ic'], ammo: { shells: 20, nails: 0, rockets: 15, cells: 120 }, ammoMax: { shells: 40, nails: 0, rockets: 20, cells: 200 }, gren: ['frag', 'napalm'], grenN: [1, 4], desc: 'Set things on fire. Water puts it out.' },
    spy: { name: 'Spy', hp: 90, armor: 100, armorMax: 100, armorType: 0.3, speed: 7.5, weapons: ['knife', 'tranq', 'supershotgun', 'nailgun'], ammo: { shells: 40, nails: 50, rockets: 0, cells: 0 }, ammoMax: { shells: 40, nails: 100, rockets: 0, cells: 0 }, gren: ['frag', null], grenN: [2, 0], desc: 'Disguise (Q) as the enemy; backstab with the knife.' },
    engineer: { name: 'Engineer', hp: 80, armor: 50, armorMax: 50, armorType: 0.3, speed: 7.5, weapons: ['spanner', 'railgun', 'supershotgun'], ammo: { shells: 40, nails: 50, rockets: 0, cells: 130 }, ammoMax: { shells: 50, nails: 50, rockets: 0, cells: 200 }, gren: ['frag', 'emp'], grenN: [2, 2], desc: 'Build a sentry gun (E) — it costs 130 cells.' },
  };
  const CLASS_ORDER = ['scout', 'sniper', 'soldier', 'demoman', 'medic', 'hwguy', 'pyro', 'spy', 'engineer'];
  const BOT_NAMES = ['Gordon', 'Barney', 'Otto', 'Corey', 'Sabine', 'Ripley', 'Dutch', 'Mac', 'Blaine', 'Hudson', 'Vasquez', 'Hicks', 'Bishop', 'Kane', 'Dallas', 'Lambert', 'Parker', 'Ash', 'Brett', 'Jonesy', 'Snake', 'Nomad', 'Wraith', 'Zed'];
  const out = { WEAPONS, GRENADES, CLASSES, CLASS_ORDER, AMMO_MAX, BOT_NAMES };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
