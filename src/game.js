import * as THREE from 'three';
import { createCharacter, DEFAULT_STYLE } from './character.js';
import { whoami, saveRun, leaderboard, signIn } from './startng.js';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const TILE = 1;
const HALF_WIDTH = 4; // the player can stand on x = -4 .. 4
const WORLD_HALF = 13; // decorations and traffic extend this far
const ROWS_AHEAD = 18;
const HOP_TIME = 0.17;
const HOP_HEIGHT = 0.55;
const BEHIND_LIMIT = 4; // rows behind the best row before the agbero gets you
const IDLE_LIMIT = 9; // seconds without a hop before the agbero gets you
const LIVES = 3;
const CONTINUE_COST = 5; // coins to carry on from the last checkpoint after a game over

const COLORS = {
  grassA: 0x8fd14f,
  grassB: 0x7cc242,
  road: 0x4a4a52,
  roadLine: 0xf2f2f2,
  rail: 0x8a7f72,
  track: 0x5a5146,
  trunk: 0x7a4b2a,
  leaf: 0x3f9b3a,
  leafB: 0x56b04a,
  coin: 0xf5c518,
  danfo: 0xf5c518,
  danfoStripe: 0x1b1b22,
  cars: [0xe74c3c, 0x3498db, 0xffffff, 0x2ecc71, 0x9b59b6, 0x1b1b22],
  train: 0x2b5c9e,
  bus: 0xb8352b,
  flag: 0xf5c518,
};

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// Renderer, scene, camera, lights
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9e8);
scene.fog = new THREE.Fog(0x87c9e8, 26, 44);

const VIEW = 10.5; // vertical size of the orthographic view in world units
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
const CAMERA_OFFSET = new THREE.Vector3(-7, 11, 9);
const SUN_OFFSET = new THREE.Vector3(6, 14, 6);
const cameraTarget = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f3a, 0.75));
const sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = sun.shadow.camera.bottom = -13;
sun.shadow.camera.right = sun.shadow.camera.top = 13;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  // Keep the road at least 11 tiles wide on narrow screens.
  const view = Math.max(VIEW, 10 / aspect);
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.left = (-view / 2) * aspect;
  camera.right = (view / 2) * aspect;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Shared geometry and materials
// ---------------------------------------------------------------------------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const MATS = {
  grassA: mat(COLORS.grassA),
  grassB: mat(COLORS.grassB),
  road: mat(COLORS.road),
  roadLine: mat(COLORS.roadLine),
  rail: mat(COLORS.rail),
  track: mat(COLORS.track, { metalness: 0.4, roughness: 0.5 }),
  trunk: mat(COLORS.trunk),
  leaf: mat(COLORS.leaf),
  leafB: mat(COLORS.leafB),
  coin: mat(COLORS.coin, { metalness: 0.6, roughness: 0.3, emissive: 0x6b5200 }),
  danfo: mat(COLORS.danfo),
  danfoStripe: mat(COLORS.danfoStripe),
  glass: mat(0x9fd8ff, { roughness: 0.2, metalness: 0.1 }),
  tyre: mat(0x1b1b22),
  train: mat(COLORS.train),
  bus: mat(COLORS.bus),
  light: mat(0xff3b30, { emissive: 0x000000 }),
  pole: mat(0xdddddd),
  flag: mat(COLORS.flag, { emissive: 0x3a2e00 }),
  checkLine: mat(0xd8fd71),
};
const GEO = {
  tile: new THREE.BoxGeometry(70, 0.4, TILE), // wide enough that the camera never sees the edge
  trunk: new THREE.BoxGeometry(0.3, 0.6, 0.3),
  leaf: new THREE.BoxGeometry(0.9, 0.8, 0.9),
  leafTop: new THREE.BoxGeometry(0.6, 0.5, 0.6),
  coin: new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18),
  tyre: new THREE.CylinderGeometry(0.17, 0.17, 0.14, 10),
};

function addMesh(parent, geometry, material, x, y, z, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

function wheels(group, length, width, y = 0.17) {
  const dx = length / 2 - 0.35;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = addMesh(group, GEO.tyre, MATS.tyre, sx * dx, y, sz * (width / 2 - 0.02));
      t.rotation.x = Math.PI / 2;
    }
  }
}

// Vehicles face +x; the lane flips them when it runs the other way.
const VEHICLES = {
  danfo: {
    length: 2.3,
    build() {
      const g = new THREE.Group();
      addMesh(g, new THREE.BoxGeometry(2.3, 0.95, 1.05), MATS.danfo, 0, 0.75, 0);
      addMesh(g, new THREE.BoxGeometry(2.32, 0.16, 1.07), MATS.danfoStripe, 0, 0.75, 0);
      addMesh(g, new THREE.BoxGeometry(1.4, 0.4, 0.9), MATS.glass, 0.1, 1.05, 0);
      addMesh(g, new THREE.BoxGeometry(0.2, 0.3, 0.9), MATS.glass, 1.06, 0.95, 0);
      wheels(g, 2.3, 1.05);
      return g;
    },
  },
  car: {
    length: 1.5,
    build() {
      const g = new THREE.Group();
      const body = pick(COLORS.cars);
      addMesh(g, new THREE.BoxGeometry(1.5, 0.45, 0.9), mat(body), 0, 0.45, 0);
      addMesh(g, new THREE.BoxGeometry(0.8, 0.4, 0.8), MATS.glass, -0.05, 0.85, 0);
      wheels(g, 1.5, 0.9);
      return g;
    },
  },
  okada: {
    length: 0.9,
    build() {
      const g = new THREE.Group();
      addMesh(g, new THREE.BoxGeometry(0.9, 0.22, 0.3), mat(pick(COLORS.cars)), 0, 0.45, 0);
      addMesh(g, new THREE.BoxGeometry(0.3, 0.45, 0.3), mat(0x2d3436), -0.1, 0.8, 0); // rider
      addMesh(g, new THREE.BoxGeometry(0.26, 0.26, 0.26), mat(0xd9a066), -0.1, 1.15, 0);
      addMesh(g, new THREE.BoxGeometry(0.3, 0.14, 0.3), mat(0xf5c518), -0.1, 1.33, 0); // helmet
      for (const sx of [-1, 1]) {
        const t = addMesh(g, GEO.tyre, MATS.tyre, sx * 0.38, 0.17, 0);
        t.rotation.x = Math.PI / 2;
      }
      return g;
    },
  },
  brt: {
    length: 3.2,
    build() {
      const g = new THREE.Group();
      addMesh(g, new THREE.BoxGeometry(3.2, 1.1, 1.05), MATS.bus, 0, 0.85, 0);
      addMesh(g, new THREE.BoxGeometry(2.9, 0.4, 1.07), MATS.glass, 0, 1.05, 0);
      wheels(g, 3.2, 1.05);
      return g;
    },
  },
};

function buildTrain() {
  const g = new THREE.Group();
  const cars = 3;
  const len = 3.4;
  for (let i = 0; i < cars; i++) {
    const x = (i - (cars - 1) / 2) * (len + 0.2);
    addMesh(g, new THREE.BoxGeometry(len, 1.3, 1.1), MATS.train, x, 1.0, 0);
    addMesh(g, new THREE.BoxGeometry(len - 0.4, 0.45, 1.12), MATS.glass, x, 1.2, 0);
    addMesh(g, new THREE.BoxGeometry(len, 0.3, 1.0), MATS.tyre, x, 0.3, 0);
  }
  return { group: g, length: cars * (len + 0.2) };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
const world = new THREE.Group();
scene.add(world);
const rows = new Map(); // index -> row

function rowZ(index) {
  return -index * TILE;
}

function makeGrass(index, { safe = false } = {}) {
  const g = new THREE.Group();
  g.position.z = rowZ(index);
  addMesh(g, GEO.tile, index % 2 ? MATS.grassA : MATS.grassB, 0, -0.2, 0, { cast: false, receive: true });
  const blocked = new Set();
  // Trees outside the playable strip frame the road.
  for (let x = -WORLD_HALF; x <= WORLD_HALF; x++) {
    const outside = Math.abs(x) > HALF_WIDTH;
    if (outside ? Math.random() < 0.55 : !safe && x !== 0 && Math.random() < 0.13) {
      if (!outside) blocked.add(x);
      tree(g, x);
    }
  }
  const coins = new Map();
  if (!safe && Math.random() < 0.35) {
    const x = randInt(-HALF_WIDTH, HALF_WIDTH);
    if (!blocked.has(x)) coins.set(x, coin(g, x));
  }
  // The first grass row after a crossing is a checkpoint: flags at both ends
  // and a bright line across the grass.
  const prev = rows.get(index - 1);
  const checkpoint = !!prev && prev.type !== 'grass';
  if (checkpoint) {
    addMesh(g, new THREE.BoxGeometry(HALF_WIDTH * 2 + 1, 0.03, 0.12), MATS.checkLine, 0, 0.005, 0.44, { cast: false });
    for (const sx of [-1, 1]) {
      const x = sx * (HALF_WIDTH + 0.7);
      addMesh(g, new THREE.BoxGeometry(0.08, 1.6, 0.08), MATS.pole, x, 0.8, 0);
      addMesh(g, new THREE.BoxGeometry(0.5, 0.3, 0.04), MATS.flag, x + (sx < 0 ? 0.29 : -0.29), 1.4, 0);
    }
  }
  return { index, type: 'grass', group: g, blocked, coins, checkpoint };
}

function tree(parent, x) {
  const h = randInt(1, 2);
  addMesh(parent, GEO.trunk, MATS.trunk, x, 0.3, 0);
  for (let i = 0; i < h; i++) {
    addMesh(parent, GEO.leaf, i % 2 ? MATS.leafB : MATS.leaf, x, 0.95 + i * 0.7, 0);
  }
  addMesh(parent, GEO.leafTop, MATS.leaf, x, 0.95 + h * 0.7 - 0.1, 0);
}

function coin(parent, x) {
  const c = addMesh(parent, GEO.coin, MATS.coin, x, 0.6, 0);
  c.rotation.x = Math.PI / 2;
  c.rotation.z = Math.random() * Math.PI;
  return c;
}

function makeRoad(index, difficulty) {
  const g = new THREE.Group();
  g.position.z = rowZ(index);
  addMesh(g, GEO.tile, MATS.road, 0, -0.2, 0, { cast: false, receive: true });
  const prev = rows.get(index - 1);
  if (prev?.type === 'road') {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 1.5) {
      addMesh(g, new THREE.BoxGeometry(0.7, 0.02, 0.08), MATS.roadLine, x, 0.01, 0.5, { cast: false });
    }
  }
  const dir = Math.random() < 0.5 ? -1 : 1;
  const kind = pick(['danfo', 'car', 'car', 'okada', 'okada', 'brt']);
  const base = kind === 'okada' ? 4.2 : kind === 'brt' ? 2.6 : 3.2;
  const speed = base * rand(0.85, 1.15) + Math.min(difficulty * 0.12, 3);
  const spec = VEHICLES[kind];
  const count = kind === 'brt' ? 2 : kind === 'okada' ? randInt(3, 4) : randInt(2, 3);
  const span = WORLD_HALF * 2;
  const vehicles = [];
  let x = -WORLD_HALF + rand(0, 2);
  for (let i = 0; i < count; i++) {
    const mesh = spec.build();
    if (dir < 0) mesh.rotation.y = Math.PI;
    mesh.position.x = x;
    g.add(mesh);
    vehicles.push({ mesh, length: spec.length });
    x += spec.length + rand(2.2, 4.5) + (span / count) * 0.4;
  }
  const coins = new Map();
  if (Math.random() < 0.2) {
    const cx = randInt(-HALF_WIDTH, HALF_WIDTH);
    coins.set(cx, coin(g, cx));
  }
  return { index, type: 'road', group: g, dir, speed, vehicles, coins, blocked: new Set() };
}

function makeRail(index) {
  const g = new THREE.Group();
  g.position.z = rowZ(index);
  addMesh(g, GEO.tile, MATS.rail, 0, -0.2, 0, { cast: false, receive: true });
  for (const z of [-0.3, 0.3]) {
    addMesh(g, new THREE.BoxGeometry(70, 0.06, 0.08), MATS.track, 0, 0.03, z, { cast: false });
  }
  for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.7) {
    addMesh(g, new THREE.BoxGeometry(0.25, 0.04, 0.9), MATS.trunk, x, 0.0, 0, { cast: false });
  }
  // Warning light at the edge of the road.
  const pole = addMesh(g, new THREE.BoxGeometry(0.1, 1.2, 0.1), MATS.pole, HALF_WIDTH + 1, 0.6, 0.45);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), MATS.light.clone());
  light.position.set(0, 0.7, 0);
  pole.add(light);
  const { group: train, length } = buildTrain();
  train.visible = false;
  g.add(train);
  const dir = Math.random() < 0.5 ? -1 : 1;
  if (dir < 0) train.rotation.y = Math.PI;
  return {
    index,
    type: 'rail',
    group: g,
    dir,
    train,
    trainLength: length,
    light,
    state: 'idle',
    timer: rand(1.5, 4),
    trainX: 0,
    coins: new Map(),
    blocked: new Set(),
  };
}

let roadRun = 0; // how many road rows in the current stretch
function makeRow(index) {
  let row;
  if (index < 5) {
    row = makeGrass(index, { safe: index < 3 });
  } else {
    const difficulty = index / 10;
    const r = Math.random();
    if (roadRun > 0 && roadRun < 3 && r < 0.6) {
      row = makeRoad(index, difficulty);
      roadRun++;
    } else if (r < 0.42) {
      row = makeGrass(index);
      roadRun = 0;
    } else if (r < 0.52 && index > 10) {
      row = makeRail(index);
      roadRun = 0;
    } else {
      row = makeRoad(index, difficulty);
      roadRun = 1;
    }
  }
  rows.set(index, row);
  world.add(row.group);
  return row;
}

function ensureRows(upTo) {
  let max = -1;
  for (const k of rows.keys()) if (k > max) max = k;
  for (let i = max + 1; i <= upTo; i++) makeRow(i);
}

function dropRows(below) {
  for (const [k, row] of rows) {
    if (k < below) {
      world.remove(row.group);
      row.group.traverse((o) => {
        if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
      });
      rows.delete(k);
    }
  }
}

function clearWorld() {
  for (const [, row] of rows) world.remove(row.group);
  rows.clear();
  roadRun = 0;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
const hero = createCharacter(DEFAULT_STYLE);
hero.root.scale.setScalar(0.46);
scene.add(hero.root);

const player = {
  x: 0,
  row: 0,
  hop: null, // { fromX, fromRow, toX, toRow, t, yaw }
  queue: [],
  alive: true,
  bestRow: 0, // rows crossed this run (the score)
  frontier: 0, // how far ahead the player has been since the last respawn (agbero check)
  checkpoint: 0, // row to respawn on
  lives: LIVES,
  coins: 0,
  idle: 0,
  deathBy: null,
  squashed: false,
};

const DIRS = {
  up: { dx: 0, dr: 1, yaw: 0 },
  down: { dx: 0, dr: -1, yaw: Math.PI },
  left: { dx: -1, dr: 0, yaw: Math.PI / 2 },
  right: { dx: 1, dr: 0, yaw: -Math.PI / 2 },
};

function tryHop(dirName) {
  if (!player.alive || state !== 'playing') return;
  if (player.hop) {
    if (player.queue.length < 2) player.queue.push(dirName);
    return;
  }
  const d = DIRS[dirName];
  const toX = player.x + d.dx;
  const toRow = player.row + d.dr;
  hero.root.rotation.y = d.yaw;
  if (Math.abs(toX) > HALF_WIDTH || toRow < 0) {
    nudge(d);
    return;
  }
  ensureRows(toRow + ROWS_AHEAD);
  const target = rows.get(toRow);
  if (target.blocked.has(toX)) {
    nudge(d);
    return;
  }
  player.hop = { fromX: player.x, fromRow: player.row, toX, toRow, t: 0, yaw: d.yaw };
  player.idle = 0;
  sfx.hop();
}

let bump = null; // { dx, dz, t } a short push against something solid

function nudge(d) {
  bump = { dx: d.dx * 0.22, dz: -d.dr * 0.22, t: 0 };
  sfx.bump();
}

function placeHero() {
  if (bump) {
    bump.t += 1 / 60;
    const k = Math.sin(Math.min(bump.t / 0.16, 1) * Math.PI);
    hero.root.position.set(player.x + bump.dx * k, 0, rowZ(player.row) + bump.dz * k);
    if (bump.t >= 0.16) bump = null;
    return;
  }
  if (player.hop) {
    const h = player.hop;
    const k = Math.min(h.t / HOP_TIME, 1);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    hero.root.position.x = THREE.MathUtils.lerp(h.fromX, h.toX, ease);
    hero.root.position.z = THREE.MathUtils.lerp(rowZ(h.fromRow), rowZ(h.toRow), ease);
    hero.root.position.y = Math.sin(k * Math.PI) * HOP_HEIGHT;
  } else {
    hero.root.position.set(player.x, 0, rowZ(player.row));
  }
}

function landed() {
  const h = player.hop;
  player.x = h.toX;
  player.row = h.toRow;
  player.hop = null;
  if (player.row > player.bestRow) {
    player.bestRow = player.row;
    hud.rows.textContent = player.bestRow;
  }
  if (player.row > player.frontier) player.frontier = player.row;
  const row = rows.get(player.row);
  if (row.checkpoint && player.row > player.checkpoint) {
    player.checkpoint = player.row;
    toast('Checkpoint!');
    sfx.checkpoint();
  }
  const c = row.coins.get(player.x);
  if (c) {
    row.group.remove(c);
    row.coins.delete(player.x);
    player.coins++;
    hud.coins.textContent = player.coins;
    sfx.coin();
  }
  if (player.queue.length) tryHop(player.queue.shift());
}

function die(reason) {
  if (!player.alive) return;
  player.alive = false;
  player.deathBy = reason;
  player.hop = null;
  player.queue.length = 0;
  player.squashed = reason === 'vehicle' || reason === 'train';
  player.lives--;
  renderLives();
  sfx.crash();
  const run = runId;
  if (player.lives > 0) {
    toast(reason === 'agbero' ? 'The agbero got you. Back to the checkpoint!' : 'Ouch! Back to the checkpoint.');
    setTimeout(() => {
      if (run === runId) respawn();
    }, 900);
  } else {
    setTimeout(() => {
      if (run === runId) endGame();
    }, 650);
  }
}

function respawn() {
  const row = rows.get(player.checkpoint) ?? rows.get(0);
  let x = 0;
  if (row?.blocked.has(0)) {
    for (let d = 1; d <= HALF_WIDTH; d++) {
      if (!row.blocked.has(-d)) { x = -d; break; }
      if (!row.blocked.has(d)) { x = d; break; }
    }
  }
  player.x = x;
  player.row = player.checkpoint;
  player.frontier = player.checkpoint;
  player.idle = 0;
  player.alive = true;
  player.squashed = false;
  player.deathBy = null;
  hero.root.rotation.y = 0;
  ensureRows(player.row + ROWS_AHEAD);
  placeHero();
  updateCamera(true);
}

// ---------------------------------------------------------------------------
// Sound: tiny synth so the game has no audio files
// ---------------------------------------------------------------------------
const sfx = (() => {
  let ctx;
  let muted = false;
  try {
    muted = localStorage.getItem('lagos-crossing-muted') === '1';
  } catch {
    /* storage may be blocked */
  }
  const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, type = 'square', vol = 0.08, slide = 0) {
    if (muted) return;
    try {
      const c = ac();
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    } catch {
      /* no audio */
    }
  }
  return {
    hop: () => tone(520, 0.08, 'square', 0.05, 160),
    coin: () => {
      tone(880, 0.09, 'triangle', 0.08);
      setTimeout(() => tone(1320, 0.12, 'triangle', 0.08), 70);
    },
    bump: () => tone(160, 0.08, 'sawtooth', 0.04),
    crash: () => tone(120, 0.45, 'sawtooth', 0.12, -90),
    horn: () => tone(220, 0.25, 'square', 0.05),
    checkpoint: () => {
      tone(660, 0.1, 'triangle', 0.08);
      setTimeout(() => tone(990, 0.1, 'triangle', 0.08), 90);
      setTimeout(() => tone(1320, 0.16, 'triangle', 0.08), 180);
    },
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem('lagos-crossing-muted', muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      return muted;
    },
  };
})();

// ---------------------------------------------------------------------------
// HUD and screens
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = { rows: $('hud-rows'), coins: $('hud-coins'), lives: $('hud-lives') };
let runId = 0;

function renderLives() {
  hud.lives.textContent = '\u2665'.repeat(Math.max(player.lives, 0)) + '\u2661'.repeat(Math.max(LIVES - player.lives, 0));
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1600);
}
const startScreen = $('start-screen');
const overScreen = $('over-screen');
const muteBtn = $('mute');

function syncMute() {
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on');
}
muteBtn.addEventListener('click', () => {
  sfx.toggle();
  syncMute();
});
syncMute();

let state = 'start'; // start | playing | over
let best = 0;
try {
  best = Number(localStorage.getItem('lagos-crossing-best')) || 0;
} catch {
  /* ignore */
}

function resetGame() {
  clearWorld();
  // Safe grass behind the start line so the camera never looks past the world.
  for (let i = -24; i < 0; i++) {
    const row = makeGrass(i, { safe: true });
    rows.set(i, row);
    world.add(row.group);
  }
  ensureRows(ROWS_AHEAD);
  runId++;
  Object.assign(player, {
    x: 0,
    row: 0,
    hop: null,
    alive: true,
    bestRow: 0,
    frontier: 0,
    checkpoint: 0,
    lives: LIVES,
    coins: 0,
    idle: 0,
    deathBy: null,
    squashed: false,
  });
  player.queue.length = 0;
  renderLives();
  $('toast').hidden = true;
  hero.root.rotation.y = 0;
  hud.rows.textContent = '0';
  hud.coins.textContent = '0';
  placeHero();
  cameraTarget.set(0, 0, 0);
  updateCamera(true);
}

function startGame() {
  resetGame();
  state = 'playing';
  startScreen.hidden = true;
  overScreen.hidden = true;
}

async function endGame() {
  if (player.alive) return; // the player already started a new run
  state = 'over';
  const rowsCrossed = player.bestRow;
  const coins = player.coins;
  if (rowsCrossed > best) {
    best = rowsCrossed;
    try {
      localStorage.setItem('lagos-crossing-best', String(best));
    } catch {
      /* ignore */
    }
  }
  $('over-title').textContent =
    player.deathBy === 'train' ? 'The train got you. No lives left!' :
    player.deathBy === 'agbero' ? 'The agbero caught you. No lives left!' :
    'Knocked down. No lives left!';
  $('over-rows').textContent = rowsCrossed;
  $('over-coins').textContent = coins;
  $('over-best').textContent = best;
  const saveMsg = $('save-msg');
  saveMsg.textContent = '';
  const cont = $('continue-btn');
  cont.hidden = coins < CONTINUE_COST || player.checkpoint === 0;
  cont.textContent = `Continue from checkpoint (${CONTINUE_COST} coins)`;
  overScreen.hidden = false;

  if (currentUser) {
    saveMsg.textContent = 'Saving your run…';
    const saved = await saveRun({ rows: rowsCrossed, coins });
    if (saved?.ok) {
      saveMsg.textContent = saved.result.improved
        ? `New best! You're #${saved.result.rank} on the board.`
        : `Not your best run. Your best is ${saved.result.best} rows (#${saved.result.rank}).`;
    } else {
      saveMsg.textContent = saved?.error ?? 'Could not reach start.ng to save this run.';
    }
  } else if (startNgReachable) {
    saveMsg.textContent = 'Sign in with start.ng to put your run on the leaderboard.';
  }
  renderBoard();
}

async function renderBoard() {
  const board = $('board');
  board.innerHTML = '';
  const entries = await leaderboard(10);
  if (!entries) {
    board.innerHTML = '<li class="note">The leaderboard shows up when the game is live on start.ng.</li>';
    return;
  }
  if (!entries.length) {
    board.innerHTML = '<li class="note">No runs saved yet. Be the first!</li>';
    return;
  }
  for (const e of entries) {
    const li = document.createElement('li');
    if (currentUser && e.player_id === currentUser.id) li.className = 'me';
    li.innerHTML = `<span class="rank">#${e.rank}</span><span class="name"></span><span class="num"></span><span class="num"></span>`;
    li.children[1].textContent = e.name;
    li.children[2].textContent = `${e.stats?.rows ?? e.score} rows`;
    li.children[3].textContent = `${e.stats?.coins ?? 0} coins`;
    board.append(li);
  }
}

$('start-btn').addEventListener('click', startGame);
$('again-btn').addEventListener('click', startGame);
$('continue-btn').addEventListener('click', continueRun);

// Spend coins to carry on from the last checkpoint with one life.
function continueRun() {
  if (player.coins < CONTINUE_COST || player.checkpoint === 0) return;
  player.coins -= CONTINUE_COST;
  hud.coins.textContent = player.coins;
  player.lives = 1;
  renderLives();
  runId++;
  overScreen.hidden = true;
  state = 'playing';
  respawn();
  toast('Back at the checkpoint. One life!');
}
$('player-sign-in').addEventListener('click', signIn);
$('over-sign-in').addEventListener('click', signIn);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const dir = KEYS[e.code];
  if (state === 'playing' && dir) {
    e.preventDefault();
    tryHop(dir);
  } else if ((e.code === 'Space' || e.code === 'Enter') && state !== 'playing') {
    if (document.activeElement?.tagName !== 'BUTTON') startGame();
  }
});

for (const b of document.querySelectorAll('#dpad button')) {
  let last = 0;
  const go = (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - last < 120) return; // pointerdown and click from the same press
    last = now;
    tryHop(b.dataset.dir);
  };
  b.addEventListener('pointerdown', go);
  b.addEventListener('click', go);
}

// Swipe anywhere on the canvas; a tap hops forward.
let touchStart = null;
canvas.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  if (state !== 'playing') return;
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
    tryHop('up');
  } else if (Math.abs(dx) > Math.abs(dy)) {
    tryHop(dx > 0 ? 'right' : 'left');
  } else {
    tryHop(dy < 0 ? 'up' : 'down');
  }
});

// ---------------------------------------------------------------------------
// start.ng player
// ---------------------------------------------------------------------------
let currentUser = null;
let startNgReachable = false;

async function loadPlayer() {
  const reply = await whoami();
  const card = $('player-card');
  if (!reply) {
    // Not on start.ng (local file or another host): play as the default look.
    startNgReachable = false;
    currentUser = null;
    hero.applyStyle(DEFAULT_STYLE);
    card.hidden = true;
    $('guest-hint').hidden = true;
    return;
  }
  startNgReachable = true;
  currentUser = reply.user ?? null;
  const who = reply.user ?? reply.guest;
  hero.applyStyle(who?.style ?? DEFAULT_STYLE);
  $('player-face').src = who?.face ?? '';
  $('player-name').textContent = who?.name ?? 'Guest';
  $('player-account').textContent = reply.user?.account ? `@${reply.user.account}` : 'Not signed in';
  $('player-sign-in').hidden = !!reply.user;
  $('over-sign-in').hidden = !!reply.user;
  $('guest-hint').hidden = !!reply.user;
  card.hidden = false;
}
loadPlayer();
addEventListener('focus', loadPlayer);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadPlayer();
});

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function updateCamera(snap = false) {
  const px = THREE.MathUtils.clamp(hero.root.position.x * 0.35, -1.5, 1.5);
  const pz = hero.root.position.z - 2.5;
  if (snap) cameraTarget.set(px, 0, pz);
  else {
    cameraTarget.x += (px - cameraTarget.x) * 0.08;
    cameraTarget.z += (pz - cameraTarget.z) * 0.1;
  }
  camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
  camera.lookAt(cameraTarget);
  sun.position.copy(cameraTarget).add(SUN_OFFSET);
  sun.target.position.copy(cameraTarget);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let time = 0;

function updateTraffic(dt) {
  for (const [, row] of rows) {
    if (row.type === 'road') {
      for (const v of row.vehicles) {
        v.mesh.position.x += row.dir * row.speed * dt;
        if (row.dir > 0 && v.mesh.position.x > WORLD_HALF + v.length) v.mesh.position.x -= WORLD_HALF * 2 + v.length * 2;
        if (row.dir < 0 && v.mesh.position.x < -WORLD_HALF - v.length) v.mesh.position.x += WORLD_HALF * 2 + v.length * 2;
      }
    } else if (row.type === 'rail') {
      row.timer -= dt;
      if (row.state === 'idle' && row.timer <= 0) {
        row.state = 'warn';
        row.timer = 1.2;
        if (Math.abs(row.index - player.row) < 8) sfx.horn();
      } else if (row.state === 'warn') {
        row.light.material.emissive.setHex(Math.floor(time * 8) % 2 ? 0xff3b30 : 0x000000);
        if (row.timer <= 0) {
          row.state = 'pass';
          row.train.visible = true;
          row.trainX = -row.dir * (WORLD_HALF + row.trainLength);
        }
      } else if (row.state === 'pass') {
        row.trainX += row.dir * 22 * dt;
        row.train.position.x = row.trainX;
        if (Math.abs(row.trainX) > WORLD_HALF + row.trainLength) {
          row.state = 'idle';
          row.train.visible = false;
          row.light.material.emissive.setHex(0x000000);
          row.timer = rand(3, 7);
        }
      }
    }
    for (const [, c] of row.coins) c.rotation.z += dt * 2;
  }
}

function checkCollisions() {
  if (!player.alive) return;
  // The player occupies the row they stand on, or both rows mid-hop.
  const spots = player.hop
    ? [[player.hop.fromRow, player.hop.fromX], [player.hop.toRow, player.hop.toX]]
    : [[player.row, player.x]];
  const hx = hero.root.position.x;
  for (const [r] of spots) {
    const row = rows.get(r);
    if (!row) continue;
    if (row.type === 'road') {
      for (const v of row.vehicles) {
        if (Math.abs(v.mesh.position.x - hx) < v.length / 2 + 0.32) return die('vehicle');
      }
    } else if (row.type === 'rail' && row.state === 'pass') {
      if (Math.abs(row.trainX - hx) < row.trainLength / 2 + 0.4) return die('train');
    }
  }
  if (player.frontier - player.row > BEHIND_LIMIT || player.idle > IDLE_LIMIT) die('agbero');
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (state === 'playing') {
    updateTraffic(dt);
    if (player.hop) {
      player.hop.t += dt;
      if (player.hop.t >= HOP_TIME) landed();
    } else if (player.alive) {
      player.idle += dt;
    }
    placeHero();
    checkCollisions();
    if (player.alive) {
      dropRows(player.row - 24);
      ensureRows(player.row + ROWS_AHEAD);
    }
    hero.animate(time, { hop: player.hop ? player.hop.t / HOP_TIME : null, squashed: player.squashed });
    updateCamera();
  } else {
    // Idle traffic behind the menus keeps the scene alive.
    if (rows.size) updateTraffic(dt);
    hero.animate(time, { squashed: player.squashed });
    updateCamera();
  }
  renderer.render(scene, camera);
}

resetGame();
frame();
