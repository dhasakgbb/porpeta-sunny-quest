const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const menu = document.getElementById("menu");
const ending = document.getElementById("ending");
const hud = document.getElementById("hud");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const audioToggle = document.getElementById("audio-toggle");
const levelLabel = document.getElementById("level-label");
const objectiveLabel = document.getElementById("objective-label");
const scoreLabel = document.getElementById("score-label");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const CAT_R = 24;
const keys = new Set();
const pointer = { x: 0, y: 0, down: false };
let audio = null;
let lastTime = 0;
let manualClock = false;
let audioMuted = false;

const laserPositions = [
  { x: 250, y: 160 },
  { x: 720, y: 140 },
  { x: 640, y: 375 },
  { x: 325, y: 415 },
  { x: 820, y: 285 },
];

function makePlayer(x, y, dir = "right") {
  const facing = directionVector(dir);
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    dir,
    facingX: facing.x,
    facingY: facing.y,
    gait: 0,
    speedVisual: 0,
    turnLean: 0,
    pounce: 0,
    curled: false,
  };
}

const state = {
  mode: "menu",
  level: 1,
  message: "",
  time: 0,
  player: makePlayer(100, 400),
  kitchen: {
    foodBowl: { x: 838, y: 382, r: 32 },
    human: { x: 470, y: 286, w: 230, h: 92, danger: 150 },
    wake: 0,
  },
  livingRoom: {
    caught: 0,
    currentDot: { ...laserPositions[0], r: 20 },
    sparkle: 0,
  },
  bedroom: {
    sunPatch: { x: 700, y: 280, rx: 128, ry: 78 },
    settled: 0,
  },
};

const objectives = {
  1: "Sneak to the food bowl.",
  2: "Catch 5 red laser dots.",
  3: "Rest in the warm sun patch.",
};

function resetGame() {
  stopPurr();
  retuneMusic();
  state.mode = "menu";
  state.level = 1;
  state.message = "";
  state.time = 0;
  state.player = makePlayer(100, 400);
  state.kitchen.wake = 0;
  state.livingRoom.caught = 0;
  state.livingRoom.currentDot = { ...laserPositions[0], r: 20 };
  state.livingRoom.sparkle = 0;
  state.bedroom.settled = 0;
  menu.hidden = false;
  ending.hidden = true;
  hud.hidden = true;
  updateHud();
  render();
}

function startGame() {
  ensureAudio();
  startMusic();
  state.mode = "playing";
  menu.hidden = true;
  ending.hidden = true;
  hud.hidden = false;
  resetLevel(1);
}

function resetLevel(level) {
  state.level = level;
  state.mode = "playing";
  state.message = "";
  state.player.curled = false;
  state.player.pounce = 0;
  if (level === 1) {
    Object.assign(state.player, makePlayer(100, 400));
    state.kitchen.wake = 0;
  } else if (level === 2) {
    Object.assign(state.player, makePlayer(118, 330));
    state.livingRoom.caught = 0;
    state.livingRoom.currentDot = { ...laserPositions[0], r: 20 };
  } else {
    Object.assign(state.player, makePlayer(140, 360));
    state.bedroom.settled = 0;
  }
  retuneMusic();
  updateHud();
}

function nextLevel() {
  if (state.level < 3) {
    resetLevel(state.level + 1);
  } else {
    state.mode = "ending";
    state.player.curled = true;
    state.message = "Thank you for being my best friend.";
    ending.hidden = false;
    hud.hidden = true;
    retuneMusic();
    playPurr();
  }
}

function update(dt) {
  state.time += dt;
  if (state.mode !== "playing") return;

  const input = readInput();
  const wasPouncing = state.player.pounce > 0;
  state.player.pounce = Math.max(0, state.player.pounce - dt);
  updatePlayer(dt, input);

  if (state.level === 1) updateKitchen(dt, input);
  if (state.level === 2) updateLivingRoom(dt, wasPouncing);
  if (state.level === 3) updateBedroom(dt);
  updateHud();
}

function readInput() {
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  const up = keys.has("arrowup") || keys.has("w");
  const down = keys.has("arrowdown") || keys.has("s");
  const sneak = keys.has("shift") || (state.level === 1 && keys.has("b"));
  const pounce = keys.has(" ") || keys.has("spacebar");
  return {
    x: Number(right) - Number(left),
    y: Number(down) - Number(up),
    sneak,
    pounce,
  };
}

function updatePlayer(dt, input) {
  const player = state.player;
  const mag = Math.hypot(input.x, input.y) || 1;
  const baseSpeed = input.sneak ? 92 : 162;
  const pounceBoost = input.pounce && state.level !== 1 ? 1.75 : 1;
  if (input.pounce && state.level !== 1) player.pounce = 0.22;

  player.vx = (input.x / mag) * baseSpeed * pounceBoost;
  player.vy = (input.y / mag) * baseSpeed * pounceBoost;
  updatePlayerFacing(player, input, dt);

  const next = { x: player.x + player.vx * dt, y: player.y + player.vy * dt };
  player.x = clamp(next.x, 52, WIDTH - 52);
  player.y = clamp(next.y, 82, HEIGHT - 50);

  if (state.level === 1) resolveKitchenHumanCollision();
}

function updatePlayerFacing(player, input, dt) {
  const moving = Math.hypot(input.x, input.y) > 0.01;
  if (moving) {
    const targetX = input.x / (Math.hypot(input.x, input.y) || 1);
    const targetY = input.y / (Math.hypot(input.x, input.y) || 1);
    const turnSpeed = 1 - Math.exp(-dt * 12);
    const oldAngle = Math.atan2(player.facingY, player.facingX);
    player.facingX += (targetX - player.facingX) * turnSpeed;
    player.facingY += (targetY - player.facingY) * turnSpeed;
    const facingLength = Math.hypot(player.facingX, player.facingY) || 1;
    player.facingX /= facingLength;
    player.facingY /= facingLength;
    const newAngle = Math.atan2(player.facingY, player.facingX);
    player.turnLean = shortestAngleDelta(oldAngle, newAngle) * 3.2;

    if (Math.abs(targetX) > Math.abs(targetY)) player.dir = targetX > 0 ? "right" : "left";
    else player.dir = targetY > 0 ? "down" : "up";
  } else {
    player.turnLean *= Math.exp(-dt * 9);
  }

  const speed = Math.hypot(player.vx, player.vy);
  player.speedVisual += (speed - player.speedVisual) * (1 - Math.exp(-dt * 10));
  player.gait += (player.speedVisual / 46) * dt;
}

function updateKitchen(dt, input) {
  const { human, foodBowl } = state.kitchen;
  const humanCenter = { x: human.x + human.w / 2, y: human.y + human.h / 2 };
  const distance = dist(state.player, humanCenter);
  const closeToSleeperPath = distance < human.danger && state.player.y < human.y + human.h + 45;
  const walkingNear = closeToSleeperPath && !input.sneak && Math.hypot(state.player.vx, state.player.vy) > 20;
  state.kitchen.wake = clamp(state.kitchen.wake + (walkingNear ? dt * 0.25 : -dt * 0.28), 0, 1);

  if (state.kitchen.wake >= 1) {
    state.message = "The human stirred. Back to the doorway.";
    Object.assign(state.player, makePlayer(100, 400));
    state.kitchen.wake = 0.18;
  }

  if (dist(state.player, foodBowl) < foodBowl.r + CAT_R) nextLevel();
}

function updateLivingRoom(dt) {
  const dot = state.livingRoom.currentDot;
  dot.x += Math.sin(state.time * 2.8 + state.livingRoom.caught) * 18 * dt;
  dot.y += Math.cos(state.time * 2.4 + state.livingRoom.caught) * 14 * dt;
  dot.x = clamp(dot.x, 80, WIDTH - 80);
  dot.y = clamp(dot.y, 110, HEIGHT - 70);
  state.livingRoom.sparkle = Math.max(0, state.livingRoom.sparkle - dt);

  if (dist(state.player, dot) < CAT_R + dot.r || pointerCatch(dot)) {
    state.livingRoom.caught += 1;
    state.livingRoom.sparkle = 0.38;
    Object.assign(state.player, { x: dot.x - 16, y: dot.y + 8, pounce: 0.2 });
    if (state.livingRoom.caught >= 5) {
      nextLevel();
    } else {
      state.livingRoom.currentDot = { ...laserPositions[state.livingRoom.caught], r: 20 };
    }
  }
}

function pointerCatch(dot) {
  if (!pointer.down) return false;
  const didCatch = dist(pointer, dot) < dot.r + 18;
  pointer.down = false;
  return didCatch;
}

function updateBedroom(dt) {
  const patch = state.bedroom.sunPatch;
  const nx = (state.player.x - patch.x) / patch.rx;
  const ny = (state.player.y - patch.y) / patch.ry;
  const inSun = nx * nx + ny * ny < 1;
  state.bedroom.settled = clamp(state.bedroom.settled + (inSun ? dt : -dt * 0.5), 0, 1.4);
  if (state.bedroom.settled >= 1.2) {
    Object.assign(state.player, { x: patch.x - 10, y: patch.y + 8, vx: 0, vy: 0, curled: true });
    nextLevel();
  }
}

function resolveKitchenHumanCollision() {
  const player = state.player;
  const human = state.kitchen.human;
  const pad = CAT_R + 6;
  const insideX = player.x > human.x - pad && player.x < human.x + human.w + pad;
  const insideY = player.y > human.y - pad && player.y < human.y + human.h + pad;
  if (!insideX || !insideY) return;

  const left = Math.abs(player.x - (human.x - pad));
  const right = Math.abs(player.x - (human.x + human.w + pad));
  const top = Math.abs(player.y - (human.y - pad));
  const bottom = Math.abs(player.y - (human.y + human.h + pad));
  const min = Math.min(left, right, top, bottom);
  if (min === left) player.x = human.x - pad;
  else if (min === right) player.x = human.x + human.w + pad;
  else if (min === top) player.y = human.y - pad;
  else player.y = human.y + human.h + pad;
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (state.level === 1) drawKitchen();
  if (state.level === 2) drawLivingRoom();
  if (state.level === 3) drawBedroom();
  drawCat(state.player);
  if (state.message && state.mode === "playing") drawToast(state.message);
  if (state.mode === "menu") drawTitleBackdrop();
}

function drawKitchen() {
  drawRoomBase("#f3e7d6", "#d1b99d");
  drawTiles("#ead8bf", "#d9c1a4", 48);
  drawCounter(0, 84, 260, 78, "#8da778");
  drawCounter(712, 82, 210, 76, "#456f94");
  drawRug(84, 388, 280, 72, "#9b2f45", "#f1d990");

  const { human, foodBowl, wake } = state.kitchen;
  drawWakeZone(human, wake);
  drawSleepingHuman(human, wake);
  drawFoodBowl(foodBowl);
}

function drawLivingRoom() {
  drawRoomBase("#e8e3da", "#c8b5a2");
  drawFloorboards();
  drawSofa(90, 108, 285, 112);
  drawPlant(790, 130);
  drawRug(342, 292, 292, 130, "#456f94", "#f0d59c");
  drawLaserDot(state.livingRoom.currentDot, state.livingRoom.sparkle);
}

function drawBedroom() {
  drawRoomBase("#f4e8dd", "#cbb8a4");
  drawFloorboards();
  drawBed();
  drawSunPatch(state.bedroom.sunPatch);
  drawWindowLight();
}

function drawRoomBase(color, wall) {
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, WIDTH, 90);
  ctx.fillStyle = color;
  ctx.fillRect(0, 90, WIDTH, HEIGHT - 90);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(0, 88, WIDTH, 8);
}

function drawTiles(a, b, size) {
  for (let y = 96; y < HEIGHT; y += size) {
    for (let x = 0; x < WIDTH; x += size) {
      ctx.fillStyle = (Math.floor(x / size) + Math.floor(y / size)) % 2 ? a : b;
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawFloorboards() {
  ctx.strokeStyle = "rgba(94, 68, 51, 0.16)";
  ctx.lineWidth = 2;
  for (let y = 112; y < HEIGHT; y += 38) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y + Math.sin(y) * 6);
    ctx.stroke();
  }
}

function drawCounter(x, y, w, h, color) {
  roundRect(x, y, w, h, 8, color);
  roundRect(x + 14, y + 18, w - 28, h - 28, 6, "rgba(255,255,255,0.22)");
}

function drawRug(x, y, w, h, main, stripe) {
  roundRect(x, y, w, h, 8, main);
  ctx.fillStyle = stripe;
  for (let i = 0; i < 5; i += 1) ctx.fillRect(x + 16 + i * 58, y, 18, h);
  ctx.strokeStyle = "rgba(45,36,31,0.16)";
  ctx.lineWidth = 5;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
}

function drawWakeZone(human, wake) {
  const cx = human.x + human.w / 2;
  const cy = human.y + human.h / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 30, cx, cy, human.danger);
  gradient.addColorStop(0, `rgba(155,47,69,${0.08 + wake * 0.16})`);
  gradient.addColorStop(1, "rgba(155,47,69,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, human.danger, 0, Math.PI * 2);
  ctx.fill();
}

function drawSleepingHuman(human, wake) {
  roundRect(human.x, human.y, human.w, human.h, 28, "#7d604d");
  roundRect(human.x + 20, human.y + 14, human.w - 36, human.h - 24, 22, "#f1d9b6");
  ctx.fillStyle = "#5d4037";
  ctx.beginPath();
  ctx.ellipse(human.x + 58, human.y + 38, 30, 22, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d241f";
  ctx.font = "bold 24px ui-rounded, system-ui";
  ctx.fillText(wake > 0.55 ? "Z?" : "Zzz", human.x + human.w - 64, human.y - 14);
  ctx.fillStyle = "#9b2f45";
  ctx.fillRect(human.x, human.y + human.h + 12, human.w * wake, 7);
}

function drawFoodBowl(bowl) {
  ctx.fillStyle = "#456f94";
  ctx.beginPath();
  ctx.ellipse(bowl.x, bowl.y, 38, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(bowl.x, bowl.y - 5, 27, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSofa(x, y, w, h) {
  roundRect(x, y + 25, w, h, 18, "#8da778");
  roundRect(x + 24, y, w - 48, 72, 14, "#9fb98d");
  roundRect(x - 20, y + 48, 42, 86, 16, "#789667");
  roundRect(x + w - 22, y + 48, 42, 86, 16, "#789667");
}

function drawPlant(x, y) {
  roundRect(x - 24, y + 72, 48, 54, 8, "#b26f47");
  ctx.fillStyle = "#557c48";
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x, y + 68, 14, 56, (i / 9) * Math.PI * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLaserDot(dot, sparkle) {
  const pulse = 1 + Math.sin(state.time * 12) * 0.18 + sparkle * 0.8;
  ctx.strokeStyle = "rgba(219,36,45,0.18)";
  ctx.lineWidth = 22 * pulse;
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, dot.r * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e12634";
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 8 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(225,38,52,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dot.x - 18, dot.y);
  ctx.lineTo(dot.x + 18, dot.y);
  ctx.moveTo(dot.x, dot.y - 18);
  ctx.lineTo(dot.x, dot.y + 18);
  ctx.stroke();
}

function drawBed() {
  roundRect(120, 150, 650, 290, 18, "#806c65");
  roundRect(150, 132, 590, 270, 10, "#f6ead8");
  drawRug(188, 180, 500, 208, "#9b2f45", "#f5db9d");
  ctx.strokeStyle = "rgba(45,36,31,0.35)";
  ctx.lineWidth = 5;
  for (let x = 214; x < 676; x += 86) {
    ctx.beginPath();
    ctx.moveTo(x, 180);
    ctx.lineTo(x - 42, 388);
    ctx.stroke();
  }
  for (let y = 205; y < 380; y += 52) {
    ctx.beginPath();
    ctx.moveTo(188, y);
    ctx.lineTo(688, y + 18);
    ctx.stroke();
  }
}

function drawSunPatch(patch) {
  const g = ctx.createRadialGradient(patch.x, patch.y, 18, patch.x, patch.y, patch.rx);
  g.addColorStop(0, "rgba(255, 235, 149, 0.74)");
  g.addColorStop(1, "rgba(255, 213, 99, 0.03)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, -0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawWindowLight() {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  roundRect(700, 26, 130, 62, 8, "rgba(255,255,255,0.62)");
  ctx.strokeStyle = "#456f94";
  ctx.lineWidth = 4;
  ctx.strokeRect(700, 26, 130, 62);
  ctx.beginPath();
  ctx.moveTo(765, 26);
  ctx.lineTo(765, 88);
  ctx.moveTo(700, 57);
  ctx.lineTo(830, 57);
  ctx.stroke();
}

function drawCat(player) {
  if (player.curled) return drawCurledCat(player.x, player.y);

  ctx.save();
  ctx.translate(player.x, player.y);
  const facingAngle = Math.atan2(player.facingY || 0, player.facingX || 1);
  ctx.rotate(facingAngle);
  const moving = player.speedVisual > 10;
  const bob = Math.sin(player.gait * Math.PI * 2) * (moving ? 2.5 : 0.6);
  const stretch = player.pounce > 0 ? 1.2 : 1;
  const lean = clamp(player.turnLean || 0, -0.28, 0.28);

  ctx.fillStyle = "rgba(55, 37, 24, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 30, 38 * stretch, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(0, bob, 34 * stretch, 18, lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(34 * stretch, -8 + bob, 17, 15, lean + 0.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2d241f";
  ctx.beginPath();
  ctx.arc(40 * stretch, -10 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f5b1a4";
  ctx.beginPath();
  ctx.moveTo(25 * stretch, -21 + bob);
  ctx.lineTo(32 * stretch, -42 + bob);
  ctx.lineTo(40 * stretch, -20 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(41 * stretch, -20 + bob);
  ctx.lineTo(52 * stretch, -36 + bob);
  ctx.lineTo(54 * stretch, -13 + bob);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(-11 * stretch, -11 + bob, 15, 11, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(35 * stretch, -17 + bob, 10, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c4b42";
  ctx.beginPath();
  ctx.ellipse(10 * stretch, -3 + bob, 9, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5f4a3c";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-31 * stretch, -3 + bob);
  ctx.quadraticCurveTo(-58 * stretch, -28 + bob, -50 * stretch, -54 + bob);
  ctx.stroke();

  ctx.strokeStyle = "#fff8ed";
  ctx.lineWidth = 5;
  const stride = Math.sin(player.gait * Math.PI * 2) * (moving ? 8 : 2);
  for (const lx of [-17, 8, 25]) {
    ctx.beginPath();
    ctx.moveTo(lx * stretch, 12 + bob);
    ctx.lineTo((lx + stride / 2) * stretch, 29 + bob);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCurledCat(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(55, 37, 24, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 32, 54, 10, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 39, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(18, -6, 34, 25, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(-10, -4, 39, 28, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(-30, -25, 17, 15, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d241f";
  ctx.beginPath();
  ctx.arc(-34, -27, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5f4a3c";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(8, 4, 42, 0.5, 3.8);
  ctx.stroke();
  ctx.restore();
}

function drawToast(text) {
  ctx.font = "700 18px ui-rounded, system-ui";
  const metrics = ctx.measureText(text);
  const w = metrics.width + 38;
  roundRect(WIDTH / 2 - w / 2, HEIGHT - 72, w, 42, 8, "rgba(255,249,239,0.9)");
  ctx.fillStyle = "#2d241f";
  ctx.fillText(text, WIDTH / 2 - metrics.width / 2, HEIGHT - 45);
}

function drawTitleBackdrop() {
  ctx.fillStyle = "rgba(255,248,234,0.24)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function updateHud() {
  levelLabel.textContent = `Level ${state.level}`;
  objectiveLabel.textContent = objectives[state.level];
  if (state.level === 1) {
    scoreLabel.textContent = `Wake ${Math.round(state.kitchen.wake * 100)}%`;
  } else if (state.level === 2) {
    scoreLabel.textContent = `${state.livingRoom.caught}/5`;
  } else {
    scoreLabel.textContent = `${Math.round(Math.min(1, state.bedroom.settled) * 100)}%`;
  }
}

function ensureAudio() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  const musicGain = ctx.createGain();
  const purrGain = ctx.createGain();
  master.gain.value = audioMuted ? 0 : 0.9;
  musicGain.gain.value = 0.32;
  purrGain.gain.value = 0.06;
  musicGain.connect(master);
  purrGain.connect(master);
  master.connect(ctx.destination);
  audio = { ctx, master, musicGain, purrGain, purrNodes: [], music: null, lastNote: null, lastAudibleNote: null };
  return audio;
}

function startMusic() {
  const setup = ensureAudio();
  if (!setup || setup.music) return;
  const ac = setup.ctx;
  if (ac.state === "suspended") ac.resume();

  const drone = ac.createOscillator();
  const harmony = ac.createOscillator();
  const droneGain = ac.createGain();
  const harmonyGain = ac.createGain();
  const filter = ac.createBiquadFilter();
  drone.type = "sine";
  harmony.type = "triangle";
  droneGain.gain.value = 0.052;
  harmonyGain.gain.value = 0.032;
  filter.type = "lowpass";
  filter.frequency.value = 900;
  drone.connect(droneGain);
  harmony.connect(harmonyGain);
  droneGain.connect(filter);
  harmonyGain.connect(filter);
  filter.connect(setup.musicGain);
  drone.start();
  harmony.start();

  const music = {
    drone,
    harmony,
    droneGain,
    harmonyGain,
    filter,
    tick: 0,
    timer: window.setInterval(() => playMusicNote(), 430),
  };
  setup.music = music;
  retuneMusic();
  playMusicNote();
  window.setTimeout(() => playMusicNote(), 180);
}

function retuneMusic() {
  if (!audio?.music) return;
  const ac = audio.ctx;
  const target = state.mode === "ending" ? [82.41, 123.47, 760] : state.level === 2 ? [110, 164.81, 1350] : state.level === 3 ? [98, 146.83, 860] : [73.42, 110, 720];
  audio.music.drone.frequency.setTargetAtTime(target[0], ac.currentTime, 0.16);
  audio.music.harmony.frequency.setTargetAtTime(target[1], ac.currentTime, 0.16);
  audio.music.filter.frequency.setTargetAtTime(target[2], ac.currentTime, 0.16);
  audio.music.droneGain.gain.setTargetAtTime(state.level === 2 ? 0.035 : 0.052, ac.currentTime, 0.18);
  audio.music.harmonyGain.gain.setTargetAtTime(state.level === 2 ? 0.024 : 0.032, ac.currentTime, 0.18);
}

function playMusicNote() {
  if (!audio?.music || audioMuted) return;
  const ac = audio.ctx;
  if (ac.state !== "running") return;
  const patterns = {
    1: [293.66, 0, 329.63, 392, 0, 329.63, 293.66, 246.94],
    2: [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 659.25, 523.25],
    3: [246.94, 293.66, 329.63, 293.66, 369.99, 329.63, 293.66, 246.94],
  };
  const notes = state.mode === "ending" ? [246.94, 0, 329.63, 392, 0, 329.63, 293.66, 246.94] : patterns[state.level] || patterns[1];
  const index = audio.music.tick % notes.length;
  const note = notes[index];
  audio.music.tick += 1;
  if (!note) {
    audio.lastNote = { tick: audio.music.tick, note: 0, peak: 0, level: state.level };
    return;
  }

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = state.level === 2 ? "triangle" : "sine";
  osc.frequency.value = note;
  const peak = state.level === 2 ? 0.16 : state.level === 3 ? 0.095 : 0.105;
  const duration = state.level === 2 ? 0.22 : 0.38;
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.musicGain);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.04);
  audio.lastNote = { tick: audio.music.tick, note, peak, level: state.level };
  audio.lastAudibleNote = audio.lastNote;
}

function setAudioMuted(nextMuted) {
  audioMuted = nextMuted;
  if (audio?.master) audio.master.gain.value = audioMuted ? 0 : 0.9;
  audioToggle.textContent = audioMuted ? "Sound Off" : "Sound On";
  audioToggle.setAttribute("aria-pressed", String(audioMuted));
}

function playPurr() {
  const setup = ensureAudio();
  if (!setup) return;
  const ac = setup.ctx;
  if (ac.state === "suspended") ac.resume();
  stopPurr();
  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  osc1.type = "sine";
  osc2.type = "triangle";
  osc1.frequency.value = 64;
  osc2.frequency.value = 92;
  lfo.frequency.value = 24;
  lfoGain.gain.value = 12;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  osc1.connect(setup.purrGain);
  osc2.connect(setup.purrGain);
  osc1.start();
  osc2.start();
  lfo.start();
  setup.purrNodes = [osc1, osc2, lfo];
}

function stopPurr() {
  if (!audio?.purrNodes?.length) return;
  for (const node of audio.purrNodes) {
    try {
      if (typeof node.stop === "function") node.stop();
      node.disconnect();
    } catch {
      // Audio nodes may already be stopped during quick restarts.
    }
  }
  audio.purrNodes = [];
}

function renderGameToText() {
  const dot = state.level === 2 ? state.livingRoom.currentDot : null;
  const payload = {
    coordinateSystem: "canvas pixels, origin top-left, x right, y down",
    mode: state.mode,
    catName: "Porpeta",
    audio: {
      muted: audioMuted,
      musicPlaying: Boolean(audio?.music),
      musicTick: audio?.music?.tick || 0,
      lastNote: audio?.lastNote || null,
      lastAudibleNote: audio?.lastAudibleNote || null,
      musicGain: audio ? Number(audio.musicGain.gain.value.toFixed(2)) : 0,
    },
    level: state.level,
    objective: objectives[state.level],
    player: {
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      vx: Math.round(state.player.vx),
      vy: Math.round(state.player.vy),
      radius: CAT_R,
      direction: state.player.dir,
      facing: {
        x: Number((state.player.facingX || 0).toFixed(2)),
        y: Number((state.player.facingY || 0).toFixed(2)),
      },
      curled: state.player.curled,
    },
    kitchen:
      state.level === 1
        ? {
            foodBowl: state.kitchen.foodBowl,
            sleepingHuman: state.kitchen.human,
            wake: Number(state.kitchen.wake.toFixed(2)),
          }
        : undefined,
    livingRoom:
      state.level === 2
        ? {
            caught: state.livingRoom.caught,
            required: 5,
            laserDot: { x: Math.round(dot.x), y: Math.round(dot.y), r: dot.r },
          }
        : undefined,
    bedroom:
      state.level === 3
        ? {
            sunPatch: state.bedroom.sunPatch,
            settled: Number(state.bedroom.settled.toFixed(2)),
          }
        : undefined,
    message: state.message,
  };
  return JSON.stringify(payload);
}

function screenToCanvas(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * WIDTH,
    y: ((evt.clientY - rect.top) / rect.height) * HEIGHT,
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function directionVector(dir) {
  if (dir === "left") return { x: -1, y: 0 };
  if (dir === "up") return { x: 0, y: -1 };
  if (dir === "down") return { x: 0, y: 1 };
  return { x: 1, y: 0 };
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function frame(timestamp) {
  const now = timestamp / 1000;
  const dt = Math.min(0.04, now - lastTime || 1 / 60);
  lastTime = now;
  if (!manualClock) update(dt);
  render();
  requestAnimationFrame(frame);
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", resetGame);
audioToggle.addEventListener("click", () => {
  const setup = ensureAudio();
  if (setup?.ctx.state === "suspended") setup.ctx.resume();
  setAudioMuted(!audioMuted);
});

window.addEventListener("keydown", (evt) => {
  const key = evt.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"].includes(key)) {
    evt.preventDefault();
  }
  if (key === "f") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.getElementById("game-shell").requestFullscreen?.();
    return;
  }
  keys.add(key);
});

window.addEventListener("keyup", (evt) => {
  keys.delete(evt.key.toLowerCase());
});

function updatePointerFromEvent(evt, down = pointer.down) {
  Object.assign(pointer, screenToCanvas(evt));
  pointer.down = down;
}

canvas.addEventListener("pointermove", (evt) => updatePointerFromEvent(evt));

canvas.addEventListener("pointerdown", (evt) => {
  updatePointerFromEvent(evt, true);
});

canvas.addEventListener("pointerup", () => {
  pointer.down = false;
});

canvas.addEventListener("mousemove", (evt) => updatePointerFromEvent(evt));
canvas.addEventListener("mousedown", (evt) => updatePointerFromEvent(evt, true));
canvas.addEventListener("mouseup", () => {
  pointer.down = false;
});

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  manualClock = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  render();
};
window.__ricardoGame = { state, resetGame, startGame, resetLevel, nextLevel };

audioToggle.textContent = "Sound On";
audioToggle.setAttribute("aria-pressed", "false");
resetGame();
requestAnimationFrame(frame);
