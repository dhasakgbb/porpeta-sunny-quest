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

const touchControls = document.getElementById("touch-controls");
const touchMeow = document.getElementById("touch-meow");
const touchSneak = document.getElementById("touch-sneak");
const touchPounce = document.getElementById("touch-pounce");
const joystickBase = document.getElementById("joystick-base");
const joystickKnob = document.getElementById("joystick-knob");
const controlsGuide = document.getElementById("controls-guide");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const CAT_R = 24;
const keys = new Set();
const pointer = { x: 0, y: 0, down: false };
const touchInput = { x: 0, y: 0, sneak: false, pounce: false };
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
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

function makeLaserDot(index, x = laserPositions[index].x, y = laserPositions[index].y) {
  return {
    x,
    y,
    targetX: laserPositions[index].x,
    targetY: laserPositions[index].y,
    baseIndex: index,
    evadeTimer: 0,
    r: 20,
  };
}

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
    pounceCooldown: 0,
    pounceVx: 0,
    pounceVy: 0,
    wasPounceInput: false,
    curled: false,
    meowTimer: 0,
  };
}

const state = {
  mode: "menu",
  level: 1,
  message: "",
  banner: { title: "", subtitle: "", timer: 0 },
  transition: { active: false, fadingOut: false, timer: 0, alpha: 0, targetLevel: null, targetAction: null },
  time: 0,
  particles: [],
  player: makePlayer(100, 400),
  kitchen: {
    foodBowl: { x: 838, y: 382, r: 32 },
    human: { x: 470, y: 286, w: 230, h: 92, danger: 150 },
    wake: 0,
  },
  livingRoom: {
    caught: 0,
    currentDot: makeLaserDot(0),
    captureCooldown: 0,
    sparkle: 0,
  },
  bedroom: {
    sunPatch: { x: 700, y: 280, rx: 128, ry: 78 },
    settled: 0,
  },
  menuCatMeowTimer: 0,
};

const objectives = {
  1: "Sneak to the food bowl.",
  2: "Catch 5 red laser dots.",
  3: "Rest in the warm sun patch.",
};

function setGameMode(mode) {
  state.mode = mode;
  document.documentElement.classList.toggle("game-scrollable", mode !== "playing");
}

function resetGame() {
  stopPurr();
  retuneMusic();
  setGameMode("menu");
  state.level = 1;
  state.message = "";
  state.banner = { title: "", subtitle: "", timer: 0 };
  state.transition = { active: false, fadingOut: false, timer: 0, alpha: 0, targetLevel: null, targetAction: null };
  state.time = 0;
  state.particles = [];
  const startX = manualClock ? 100 : 140;
  const startY = manualClock ? 400 : 240;
  state.player = makePlayer(startX, startY);
  state.kitchen.wake = 0;
  state.livingRoom.caught = 0;
  state.livingRoom.currentDot = makeLaserDot(0);
  state.livingRoom.captureCooldown = 0;
  state.livingRoom.sparkle = 0;
  state.bedroom.settled = 0;
  state.menuCatMeowTimer = 0;
  menu.hidden = false;
  ending.hidden = true;
  hud.hidden = true;
  if (touchControls) touchControls.hidden = true;
  updateHud();
  render();
}

function startGame() {
  ensureAudio();
  startMusic();
  setGameMode("playing");
  menu.hidden = true;
  ending.hidden = true;
  hud.hidden = false;
  if (isTouchDevice && touchControls) touchControls.hidden = false;
  resetLevel(1);
}

function resetLevel(level) {
  if (manualClock) {
    executeResetLevel(level);
  } else {
    state.transition = {
      active: true,
      fadingOut: true,
      timer: 0,
      alpha: 0,
      targetLevel: level,
      targetAction: null
    };
  }
}

function executeResetLevel(level) {
  state.level = level;
  setGameMode("playing");
  state.message = "";
  state.player.curled = false;
  state.player.pounce = 0;

  // Reset touch inputs and Knob position
  touchInput.x = 0;
  touchInput.y = 0;
  touchInput.sneak = false;
  touchInput.pounce = false;
  if (joystickKnob) joystickKnob.style.transform = "translate(0px, 0px)";
  if (touchMeow) touchMeow.classList.remove("active");
  if (touchSneak) touchSneak.classList.remove("active");
  if (touchPounce) touchPounce.classList.remove("active");

  // Dynamically show/hide context-specific buttons
  if (isTouchDevice && touchControls) {
    touchControls.hidden = false;
    touchMeow?.classList.remove("hidden");
    if (level === 1) {
      touchSneak?.classList.remove("hidden");
      touchPounce?.classList.remove("hidden");
    } else if (level === 2) {
      touchSneak?.classList.add("hidden");
      touchPounce?.classList.remove("hidden");
    } else {
      touchSneak?.classList.add("hidden");
      touchPounce?.classList.add("hidden");
    }
  }

  if (level === 1) {
    const startX = manualClock ? 100 : 140;
    const startY = manualClock ? 400 : 240;
    Object.assign(state.player, makePlayer(startX, startY));
    state.kitchen.wake = 0;
    showBanner("Kitchen", "Sneak to the food bowl.");
  } else if (level === 2) {
    Object.assign(state.player, makePlayer(118, 330));
    state.livingRoom.caught = 0;
    state.livingRoom.currentDot = makeLaserDot(0);
    state.livingRoom.captureCooldown = 0;
    showBanner("Living Room", "Stalk, then pounce with Space.");
  } else {
    Object.assign(state.player, makePlayer(140, 360));
    state.bedroom.settled = 0;
    showBanner("Bedroom", "Rest in the warm sun.");
  }
  retuneMusic();
  updateHud();
}

function nextLevel() {
  if (state.level < 3) {
    resetLevel(state.level + 1);
  } else {
    if (manualClock) {
      executeEndingTransition();
    } else {
      state.transition = {
        active: true,
        fadingOut: true,
        timer: 0,
        alpha: 0,
        targetLevel: null,
        targetAction: executeEndingTransition
      };
    }
  }
}

function executeEndingTransition() {
  setGameMode("ending");
  state.player.curled = true;
  state.message = "Thank you for being my best friend.";
  ending.hidden = false;
  hud.hidden = true;
  if (touchControls) touchControls.hidden = true;
  retuneMusic();
  playPurr();
}

function update(dt) {
  state.time += dt;
  state.banner.timer = Math.max(0, state.banner.timer - dt);
  updateParticles(dt);

  // Tick the screen transition
  if (state.transition && state.transition.active) {
    state.transition.timer += dt;
    const dur = 0.25; // 250ms half-transition duration
    if (state.transition.fadingOut) {
      state.transition.alpha = Math.min(1, state.transition.timer / dur);
      if (state.transition.alpha >= 1) {
        state.transition.fadingOut = false;
        state.transition.timer = 0;
        if (state.transition.targetLevel !== null) {
          executeResetLevel(state.transition.targetLevel);
        } else if (state.transition.targetAction) {
          state.transition.targetAction();
        }
      }
    } else {
      state.transition.alpha = Math.max(0, 1 - state.transition.timer / dur);
      if (state.transition.alpha <= 0) {
        state.transition.active = false;
      }
    }
  }

  if (state.mode === "menu") {
    state.menuCatMeowTimer = Math.max(0, state.menuCatMeowTimer - dt);

    // Spawn a floating gold dust particle occasionally
    if (state.particles.length < 40 && Math.random() < 0.12) {
      state.particles.push({
        x: Math.random() * WIDTH,
        y: HEIGHT + 10,
        vx: (Math.random() - 0.5) * 8,
        vy: -(10 + Math.random() * 15), // rise slowly
        life: 3.5 + Math.random() * 3.5,
        maxLife: 7.0,
        r: 1.0 + Math.random() * 2.0,
        color: `rgba(255, 235, 149, ${0.12 + Math.random() * 0.18})`,
        swaySpeed: 0.5 + Math.random() * 1.5,
        swayAmount: 10 + Math.random() * 15,
        spawnTime: state.time,
      });
    }
  }

  if (state.mode !== "playing") return;

  const input = readInput();
  state.player.pounce = Math.max(0, state.player.pounce - dt);
  state.player.pounceCooldown = Math.max(0, state.player.pounceCooldown - dt);
  state.player.meowTimer = Math.max(0, state.player.meowTimer - dt);
  updatePlayer(dt, input);

  if (state.level === 1) updateKitchen(dt, input);
  if (state.level === 2) updateLivingRoom(dt);
  if (state.level === 3) updateBedroom(dt);
  updateHud();
}

function readInput() {
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  const up = keys.has("arrowup") || keys.has("w");
  const down = keys.has("arrowdown") || keys.has("s");
  const sneak = keys.has("shift") || (state.level === 1 && keys.has("b")) || touchInput.sneak;
  const pounce = keys.has(" ") || keys.has("spacebar") || touchInput.pounce;

  let inputX = Number(right) - Number(left);
  let inputY = Number(down) - Number(up);

  // Apply a smooth deadzone mapping to virtual touch controls
  const touchMag = Math.hypot(touchInput.x, touchInput.y);
  if (touchMag > 0.15) {
    const scale = (touchMag - 0.15) / (1.0 - 0.15);
    inputX = (touchInput.x / touchMag) * scale;
    inputY = (touchInput.y / touchMag) * scale;
  } else if (touchInput.x !== 0 || touchInput.y !== 0) {
    inputX = 0;
    inputY = 0;
  }

  return {
    x: inputX,
    y: inputY,
    sneak,
    pounce,
  };
}

function updatePlayer(dt, input) {
  const player = state.player;
  const mag = Math.hypot(input.x, input.y) || 1;
  const baseSpeed = state.level === 2 ? 82 : input.sneak ? 92 : 162;
  const pounceStarted = input.pounce && !player.wasPounceInput && player.pounceCooldown <= 0;
  if (pounceStarted) {
    const launchX = Math.abs(input.x) + Math.abs(input.y) > 0 ? input.x / mag : player.facingX || 1;
    const launchY = Math.abs(input.x) + Math.abs(input.y) > 0 ? input.y / mag : player.facingY || 0;
    if (state.level === 2) {
      player.pounce = 0.34;
      player.pounceCooldown = 0.72;
      player.pounceVx = launchX * 470;
      player.pounceVy = launchY * 470;
    } else {
      player.pounce = 0.22;
      player.pounceCooldown = 0.65;
      player.pounceVx = launchX * 360; // quick pounce boost
      player.pounceVy = launchY * 360;
    }
    if (navigator.vibrate) navigator.vibrate(15);
  }
  player.wasPounceInput = input.pounce;

  player.pounceVx *= Math.exp(-dt * 5.2);
  player.pounceVy *= Math.exp(-dt * 5.2);

  // Proportional analog speed scaling (min/max 1.0 for keyboard)
  const speedScale = Math.min(1, Math.hypot(input.x, input.y));
  player.vx = (input.x / mag) * baseSpeed * speedScale + player.pounceVx;
  player.vy = (input.y / mag) * baseSpeed * speedScale + player.pounceVy;
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
    const startX = manualClock ? 100 : 140;
    const startY = manualClock ? 400 : 240;
    Object.assign(state.player, makePlayer(startX, startY));
    state.kitchen.wake = 0.18;
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }

  if (dist(state.player, foodBowl) < foodBowl.r + CAT_R) nextLevel();
}

function updateLivingRoom(dt) {
  const dot = state.livingRoom.currentDot;
  state.livingRoom.captureCooldown = Math.max(0, state.livingRoom.captureCooldown - dt);
  dot.evadeTimer = Math.max(0, dot.evadeTimer - dt);
  const distanceToCat = dist(state.player, dot);
  const catIsPouncing = state.player.pounce > 0;
  if (distanceToCat < 118 && !catIsPouncing && dot.evadeTimer <= 0) {
    const awayX = (dot.x - state.player.x) / (distanceToCat || 1);
    const awayY = (dot.y - state.player.y) / (distanceToCat || 1);
    dot.targetX = clamp(dot.x + awayX * 130 + Math.sin(state.time * 3) * 35, 100, WIDTH - 100);
    dot.targetY = clamp(dot.y + awayY * 96 + Math.cos(state.time * 2.7) * 28, 125, HEIGHT - 85);
    dot.evadeTimer = 0.78;
  } else if (dot.evadeTimer <= 0 && dist(dot, { x: dot.targetX, y: dot.targetY }) < 16) {
    dot.targetX = laserPositions[dot.baseIndex].x + Math.sin(state.time * 1.3 + dot.baseIndex) * 45;
    dot.targetY = laserPositions[dot.baseIndex].y + Math.cos(state.time * 1.1 + dot.baseIndex) * 34;
  }

  const glide = 1 - Math.exp(-dt * 3.8);
  dot.x += (dot.targetX - dot.x) * glide;
  dot.y += (dot.targetY - dot.y) * glide;
  dot.x += Math.sin(state.time * 8 + state.livingRoom.caught) * 5 * dt;
  dot.y += Math.cos(state.time * 7 + state.livingRoom.caught) * 4 * dt;
  dot.x = clamp(dot.x, 80, WIDTH - 80);
  dot.y = clamp(dot.y, 110, HEIGHT - 70);
  state.livingRoom.sparkle = Math.max(0, state.livingRoom.sparkle - dt);

  const canCapture = state.livingRoom.captureCooldown <= 0;
  if (canCapture && ((catIsPouncing && distanceToCat < CAT_R + dot.r + 12) || pointerCatch(dot))) {
    state.livingRoom.caught += 1;
    state.livingRoom.sparkle = 0.38;
    state.livingRoom.captureCooldown = 0.34;
    spawnLaserCatch(dot.x, dot.y);
    Object.assign(state.player, { x: dot.x - 16, y: dot.y + 8, pounce: 0.2 });
    if (navigator.vibrate) navigator.vibrate(25);
    if (state.livingRoom.caught >= 5) {
      nextLevel();
    } else {
      state.livingRoom.currentDot = makeLaserDot(state.livingRoom.caught, dot.x, dot.y);
    }
  }
}

function showBanner(title, subtitle) {
  state.banner = { title, subtitle, timer: 2.2 };
}

function spawnLaserCatch(x, y) {
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const speed = 80 + (i % 4) * 24;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45,
      maxLife: 0.45,
      color: i % 2 ? "#e12634" : "#ffd27a",
    });
  }
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    if (particle.swaySpeed) {
      particle.y += particle.vy * dt;
      particle.x += particle.vx * dt + Math.sin((state.time + particle.spawnTime) * particle.swaySpeed) * 0.35;
    } else {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - dt * 2.2;
      particle.vy *= 1 - dt * 2.2;
    }
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
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

  // Ambient golden dust motes in sunbeam
  if (Math.random() < 0.16) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random();
    const px = patch.x + Math.cos(angle) * patch.rx * r;
    const py = patch.y + Math.sin(angle) * patch.ry * r;
    state.particles.push({
      x: px + (Math.random() - 0.5) * 12,
      y: py - 10 - Math.random() * 20,
      vx: (Math.random() - 0.5) * 6,
      vy: 3 + Math.random() * 8, // drifts slowly downwards
      life: 2.0 + Math.random() * 2.0,
      maxLife: 4.0,
      r: 1.2 + Math.random() * 1.8, // small, delicate dust mote radius
      color: `rgba(255, 235, 149, ${0.12 + Math.random() * 0.18})`,
      swaySpeed: 0.8 + Math.random() * 1.2,
      spawnTime: state.time,
    });
  }

  if (state.bedroom.settled >= 1.2) {
    Object.assign(state.player, { x: patch.x - 10, y: patch.y + 8, vx: 0, vy: 0, curled: true });
    if (navigator.vibrate) navigator.vibrate(50);
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
  if (state.mode === "menu") {
    drawTitleBackdrop();
    if (state.transition && state.transition.active && state.transition.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = state.transition.alpha;
      ctx.fillStyle = "#e9dfd3";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }
    return;
  }
  if (state.level === 1) drawKitchen();
  if (state.level === 2) drawLivingRoom();
  if (state.level === 3) drawBedroom();
  drawParticles();
  drawCat(state.player);
  if (state.banner.timer > 0 && state.mode === "playing") drawBanner();
  if (state.message && state.mode === "playing") drawToast(state.message);

  // Render transition overlay at the very end of drawing
  if (state.transition && state.transition.active && state.transition.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = state.transition.alpha;
    ctx.fillStyle = "#e9dfd3";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
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
  drawWorldLabel("Dinner", foodBowl.x, foodBowl.y - 42);
}

function drawLivingRoom() {
  drawRoomBase("#e8e3da", "#c8b5a2");
  drawFloorboards();
  drawSofa(90, 108, 285, 112);
  drawPlant(790, 130);
  drawRug(342, 292, 292, 130, "#456f94", "#f0d59c");
  drawLaserDot(state.livingRoom.currentDot, state.livingRoom.sparkle);
  if (state.banner.timer <= 0.2) {
    drawWorldLabel(`${state.livingRoom.caught}/5`, state.livingRoom.currentDot.x, state.livingRoom.currentDot.y - 42);
  }
}

function drawBedroom() {
  drawRoomBase("#f4e8dd", "#cbb8a4");
  drawFloorboards();
  drawBed();
  drawSunPatch(state.bedroom.sunPatch);
  drawWorldLabel("Warm spot", state.bedroom.sunPatch.x, state.bedroom.sunPatch.y - 90);
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
  const breathe = Math.sin(state.time * 1.55) * (1 - wake * 0.45);
  const twitch = wake > 0.45 ? Math.sin(state.time * 12) * wake * 2.5 : 0;
  const bedX = human.x;
  const bedY = human.y;
  const bedW = human.w;
  const bedH = human.h;
  const centerY = bedY + bedH / 2;

  ctx.save();
  ctx.translate(twitch, 0);
  roundRect(bedX - 8, bedY - 8, bedW + 16, bedH + 16, 32, "#7d604d");
  roundRect(bedX + 9, bedY + 6, bedW - 18, bedH - 10, 26, "#f4dcb8");

  roundRect(bedX + 16, bedY + 14, 82, bedH - 26, 24, "#fff2d4");
  ctx.fillStyle = "rgba(116,91,75,0.12)";
  ctx.beginPath();
  ctx.ellipse(bedX + 58, centerY + 4, 32, 18, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(bedX + 136, centerY + 3);
  ctx.scale(1 + breathe * 0.018, 1 + breathe * 0.055);
  roundRect(-54, -30, bedW - 100, 62, 28, "#8da778");
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(-36, -22, bedW - 140, 18, 12, "rgba(255,255,255,0.2)");
  ctx.strokeStyle = "rgba(69,111,76,0.45)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-30, 26);
  ctx.bezierCurveTo(24, 40 + breathe * 2, 82, 39 + breathe * 2, 134, 26);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#f0bd96";
  ctx.beginPath();
  ctx.ellipse(bedX + 72, centerY + 3, 25, 20, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5d4037";
  ctx.beginPath();
  ctx.ellipse(bedX + 62, centerY - 6, 27, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5d4037";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(bedX + 80, centerY + 5, 3.4, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.strokeStyle = "#8b5f4f";
  ctx.beginPath();
  ctx.moveTo(bedX + 95, centerY + 12);
  ctx.quadraticCurveTo(bedX + 120, centerY + 27 + breathe * 2, bedX + 145, centerY + 12);
  ctx.stroke();

  ctx.fillStyle = "#f0bd96";
  ctx.beginPath();
  ctx.ellipse(bedX + 143, centerY + 13, 8, 6, 0.25, 0, Math.PI * 2);
  ctx.fill();

  drawSleepLetters(bedX + bedW - 42, bedY - 20, wake);

  // Cozy rounded wake meter container
  const barX = human.x;
  const barY = human.y + human.h + 12;
  const barW = human.w;
  const barH = 10;
  roundRect(barX, barY, barW, barH, 5, "rgba(55, 37, 24, 0.12)"); // container background

  // Rounded gradient alert bar filling
  if (wake > 0) {
    const fillW = barW * wake;
    const meterGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    meterGrad.addColorStop(0, "#d78143"); // orange
    meterGrad.addColorStop(1, "#9b2f45"); // red
    roundRect(barX, barY, fillW, barH, 5, meterGrad);
  }

  // Waking warning notification
  if (wake > 0.58) {
    ctx.font = "900 11px ui-rounded, system-ui";
    ctx.fillStyle = "#9b2f45";
    ctx.textAlign = "center";
    ctx.fillText("AWAKENING!", barX + barW / 2, barY - 4);
  }

  ctx.restore();
}

function drawSleepLetters(x, y, wake) {
  const letters = wake > 0.58 ? ["Z", "?", "!"] : ["Z", "z", "z"];
  for (let i = 0; i < letters.length; i += 1) {
    const phase = state.time * 1.8 + i * 1.15;
    const lift = (phase % Math.PI) / Math.PI;
    const px = x + i * 24 + Math.sin(phase) * 5;
    const py = y - lift * 16 + Math.cos(phase * 1.2) * 3;
    const size = 29 - i * 4 + lift * 4;
    ctx.globalAlpha = 0.32 + (1 - lift) * 0.55 + wake * 0.18;
    ctx.fillStyle = wake > 0.58 ? "#7d2f3d" : "#2d241f";
    ctx.font = `900 ${size}px ui-rounded, system-ui`;
    ctx.fillText(letters[i], px, py);
  }
  ctx.globalAlpha = 1;
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

function drawWorldLabel(text, x, y) {
  ctx.font = "800 15px ui-rounded, system-ui";
  const metrics = ctx.measureText(text);
  const w = metrics.width + 24;
  roundRect(x - w / 2, y - 18, w, 28, 8, "rgba(255,249,239,0.78)");
  ctx.fillStyle = "#2d241f";
  ctx.fillText(text, x - metrics.width / 2, y + 1);
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

function drawLaserPointerDevice(dot) {
  const emitterX = WIDTH - 36;
  const emitterY = 104;
  const angle = Math.atan2(dot.y - emitterY, dot.x - emitterX);
  ctx.save();
  ctx.translate(emitterX, emitterY);
  ctx.rotate(angle);

  // Draw mounting base (attached to the side wall)
  ctx.fillStyle = "#456f94"; // matches blue counters/accents
  ctx.beginPath();
  ctx.arc(-8, 0, 14, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  // Draw laser barrel
  ctx.fillStyle = "#705747";
  roundRect(-10, -5, 24, 10, 3, "#705747");
  ctx.fillStyle = "#d78143"; // gold accent tip
  ctx.fillRect(10, -5, 4, 10);

  // Little lens indicator
  ctx.fillStyle = "#e12634";
  ctx.beginPath();
  ctx.arc(14, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawLaserDot(dot, sparkle) {
  const pulse = 1 + Math.sin(state.time * 12) * 0.18 + sparkle * 0.8;
  ctx.strokeStyle = "rgba(225,38,52,0.18)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(WIDTH - 36, 104);
  ctx.lineTo(dot.x, dot.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(219,36,45,0.18)";
  ctx.lineWidth = 22 * pulse;
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, dot.r * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e12634";
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 8 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Draw physical emitter device
  drawLaserPointerDevice(dot);
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

  const progress = Math.min(1, state.bedroom.settled / 1.2);
  if (state.level === 3 && state.mode === "playing") {
    ctx.strokeStyle = "rgba(155, 47, 69, 0.3)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(patch.x, patch.y, 58, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 248, 234, 0.76)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(patch.x, patch.y, 58, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
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
  const moving = player.speedVisual > 10;
  const bob = Math.sin(player.gait * Math.PI * 2) * (moving ? 2.5 : 0.6);
  const stretch = player.pounce > 0 ? 1.2 : 1;
  const lean = clamp(player.turnLean || 0, -0.28, 0.28);
  const stride = Math.sin(player.gait * Math.PI * 2) * (moving ? 8 : 2);

  ctx.fillStyle = "rgba(55, 37, 24, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 30, player.dir === "up" || player.dir === "down" ? 24 : 38 * stretch, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (player.dir === "up" || player.dir === "down") {
    drawVerticalCat(player.dir, bob, stride, lean);
  } else {
    drawSideCat(player.dir, bob, stride, stretch, lean);
  }
  ctx.restore();

  if (player.meowTimer > 0) {
    drawMeowBubble(player.x, player.y - 45);
  }
}

function drawSideCat(dir, bob, stride, stretch, lean) {
  const flip = dir === "left" ? -1 : 1;
  const sway = clamp(lean * 10, -3, 3);
  ctx.save();
  ctx.scale(flip, 1);
  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(sway, bob, 34 * stretch, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(34 * stretch + sway, -8 + bob, 17, 15, 0, 0, Math.PI * 2);
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
  ctx.ellipse(-11 * stretch + sway, -11 + bob, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(35 * stretch + sway, -17 + bob, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c4b42";
  ctx.beginPath();
  ctx.ellipse(10 * stretch + sway, -3 + bob, 9, 7, 0, 0, Math.PI * 2);
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
  for (const lx of [-17, 8, 25]) {
    ctx.beginPath();
    ctx.moveTo(lx * stretch, 12 + bob);
    ctx.lineTo((lx + stride / 2) * stretch, 29 + bob);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVerticalCat(dir, bob, stride, lean) {
  const lookingDown = dir === "up";
  const sway = clamp(lean * 8, -2.5, 2.5);
  const bodyW = lookingDown ? 26 : 24;
  const headY = lookingDown ? -26 + bob : 26 + bob;
  const earY = lookingDown ? -42 + bob : 42 + bob;
  const bodyY = bob;

  ctx.save();
  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(sway, bodyY, bodyW, 38, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(9 + sway, bodyY + 6, 12, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c4b42";
  ctx.beginPath();
  ctx.ellipse(-9 + sway, bodyY - 11, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff8ed";
  ctx.beginPath();
  ctx.ellipse(sway, headY, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f5b1a4";
  ctx.beginPath();
  ctx.moveTo(-12, headY - (lookingDown ? 8 : -8));
  ctx.lineTo(-22, earY);
  ctx.lineTo(-4, headY - (lookingDown ? 12 : -12));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(12, headY - (lookingDown ? 8 : -8));
  ctx.lineTo(22, earY);
  ctx.lineTo(4, headY - (lookingDown ? 12 : -12));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#d78143";
  ctx.beginPath();
  ctx.ellipse(8, headY - (lookingDown ? 6 : -6), 10, 8, 0.1, 0, Math.PI * 2);
  ctx.fill();

  if (lookingDown) {
    ctx.fillStyle = "#2d241f";
    ctx.beginPath();
    ctx.arc(-6, headY - 2, 2.2, 0, Math.PI * 2);
    ctx.arc(7, headY - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#5f4a3c";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  const tailBaseY = lookingDown ? 25 + bob : -25 + bob;
  const tailEndY = lookingDown ? 54 + bob : -54 + bob;
  ctx.moveTo(-10, tailBaseY);
  ctx.quadraticCurveTo(-35, tailBaseY + (lookingDown ? 10 : -10), -24, tailEndY);
  ctx.stroke();

  ctx.strokeStyle = "#fff8ed";
  ctx.lineWidth = 5;
  for (const lx of [-11, 11]) {
    ctx.beginPath();
    ctx.moveTo(lx, lookingDown ? 8 + bob : -8 + bob);
    ctx.lineTo(lx + stride * 0.25, lookingDown ? 31 + bob : -31 + bob);
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

function drawMeowBubble(x, y) {
  ctx.save();
  ctx.font = "800 13px ui-rounded, system-ui";
  const text = "Meow!";
  const metrics = ctx.measureText(text);
  const w = metrics.width + 16;
  const h = 22;

  // Speech bubble background
  roundRect(x - w / 2, y - h, w, h, 6, "rgba(255, 255, 255, 0.92)");

  // Speech bubble pointer
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x, y + 4);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = "#2d241f";
  ctx.fillText(text, x - metrics.width / 2, y - 6);
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

function drawBanner() {
  if (state.banner.timer <= 0) return;

  const duration = 2.2;
  const fadeIn = 0.35;
  const fadeOut = 0.3;
  const elapsed = duration - state.banner.timer;

  let alpha = 1;
  if (elapsed < fadeIn) {
    alpha = elapsed / fadeIn;
  } else if (state.banner.timer < fadeOut) {
    alpha = state.banner.timer / fadeOut;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  const cardW = 480;
  const cardH = 76;
  const cardX = WIDTH / 2 - cardW / 2;
  const cardY = 96;

  roundRect(cardX, cardY, cardW, cardH, 12, "rgba(255, 249, 239, 0.94)");
  ctx.strokeStyle = "rgba(96, 65, 47, 0.16)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 12);
  ctx.stroke();

  ctx.font = "900 18px ui-rounded, system-ui";
  ctx.fillStyle = "#9b2f45";
  ctx.textAlign = "center";
  ctx.fillText(state.banner.title.toUpperCase(), WIDTH / 2, cardY + 28);

  ctx.font = "700 14px ui-rounded, system-ui";
  ctx.fillStyle = "#60412f";
  ctx.fillText(state.banner.subtitle, WIDTH / 2, cardY + 54);

  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    const r = particle.r !== undefined ? particle.r * alpha : 3 + alpha * 3;
    ctx.arc(particle.x, particle.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTitleBackdrop() {
  // 1. Cozy room backdrop (vertical gradient)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGrad.addColorStop(0, "#f4e8dd"); // warm walls
  bgGrad.addColorStop(1, "#cbb8a4"); // baseboard/floor line
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Floorboards (bottom third of screen)
  const floorY = HEIGHT - 180;
  ctx.fillStyle = "#e8dcd0"; // wood flooring
  ctx.fillRect(0, floorY, WIDTH, HEIGHT - floorY);

  // Draw floor divider (baseboard)
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(0, floorY - 8, WIDTH, 8);
  ctx.fillStyle = "rgba(45,36,31,0.08)";
  ctx.fillRect(0, floorY, WIDTH, 4);

  // Floorboard lines
  ctx.strokeStyle = "rgba(94, 68, 51, 0.08)";
  ctx.lineWidth = 2.5;
  for (let y = floorY + 30; y < HEIGHT; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y + Math.sin(y) * 4);
    ctx.stroke();
  }

  // 3. Cozy rug
  const rugX = WIDTH / 2;
  const rugY = HEIGHT - 92;
  drawRug(rugX - 170, rugY - 45, 340, 90, "#456f94", "#f0d59c");

  // 4. Curled sleeping cat on the rug with breathing animation
  ctx.save();
  ctx.translate(rugX, rugY - 14);
  const breath = 1.0 + Math.sin(state.time * 1.5) * 0.024;
  ctx.scale(breath, breath);
  drawCurledCat(0, 0);
  ctx.restore();

  // 5. Speech bubble if menu meow timer is active
  if (state.menuCatMeowTimer > 0) {
    drawMeowBubble(rugX, rugY - 72);
  }

  // 6. Swaying sunbeams
  ctx.save();
  const swayAngle = Math.sin(state.time * 0.35) * 0.015;
  ctx.translate(-50, -50); // upper left sunbeam source
  ctx.rotate(0.35 + swayAngle); // base angle pointing diagonally down

  // Volumetric sunbeam shaft
  const beamGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT * 0.8);
  beamGrad.addColorStop(0, "rgba(255, 238, 160, 0.44)");
  beamGrad.addColorStop(0.4, "rgba(255, 225, 120, 0.16)");
  beamGrad.addColorStop(1, "rgba(255, 225, 120, 0.0)");

  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(240, 0);
  ctx.lineTo(WIDTH + 300, HEIGHT + 100);
  ctx.lineTo(WIDTH - 150, HEIGHT + 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 7. Title particles (gold dust motes)
  drawParticles();
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

  // Immersive Delay effect for warm, ambient acoustic melodies
  const delay = ctx.createDelay(1.0);
  const delayFeedback = ctx.createGain();
  delay.delayTime.value = 0.43; // Match sequencer beat speed
  delayFeedback.gain.value = 0.36; // 36% feedback decay

  musicGain.connect(master);
  musicGain.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(master);

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
  if (isTouchDevice) {
    audioToggle.textContent = audioMuted ? "🔇 Muted" : "🔊 Sound";
  } else {
    audioToggle.textContent = audioMuted ? "Sound Off" : "Sound On";
  }
  audioToggle.setAttribute("aria-pressed", String(audioMuted));
}

function playMeowSound() {
  const setup = ensureAudio();
  if (!setup || audioMuted) return;
  const ac = setup.ctx;
  if (ac.state === "suspended") ac.resume();
  if (ac.state !== "running") return;

  const now = ac.currentTime;

  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const gainNode = ac.createGain();
  const filterNode = ac.createBiquadFilter();

  osc1.type = "triangle";
  osc2.type = "sawtooth";

  osc1.frequency.setValueAtTime(320, now);
  osc1.frequency.exponentialRampToValueAtTime(780, now + 0.08);
  osc1.frequency.exponentialRampToValueAtTime(650, now + 0.18);
  osc1.frequency.exponentialRampToValueAtTime(380, now + 0.4);

  osc2.frequency.setValueAtTime(325, now);
  osc2.frequency.exponentialRampToValueAtTime(785, now + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(655, now + 0.18);
  osc2.frequency.exponentialRampToValueAtTime(385, now + 0.4);

  filterNode.type = "bandpass";
  filterNode.Q.value = 1.8;
  filterNode.frequency.setValueAtTime(500, now);
  filterNode.frequency.exponentialRampToValueAtTime(1400, now + 0.1);
  filterNode.frequency.exponentialRampToValueAtTime(800, now + 0.22);
  filterNode.frequency.exponentialRampToValueAtTime(450, now + 0.4);

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(0.08, now + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.04, now + 0.2);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  osc1.connect(filterNode);
  osc2.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(setup.master);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
}

function triggerMeow() {
  state.player.meowTimer = 0.65;
  playMeowSound();
  if (navigator.vibrate) navigator.vibrate(30);

  const player = state.player;
  for (let i = 0; i < 4; i++) {
    state.particles.push({
      x: player.x + (Math.random() - 0.5) * 30,
      y: player.y - 20 + (Math.random() - 0.5) * 15,
      vx: (Math.random() - 0.5) * 50,
      vy: -40 - Math.random() * 40,
      life: 0.5 + Math.random() * 0.35,
      maxLife: 0.85,
      color: Math.random() > 0.5 ? "#f5b1a4" : "#fff2d4",
    });
  }

  // Easter egg: meowing wakes up the human if you are inside the danger zone!
  if (state.level === 1) {
    const human = state.kitchen.human;
    const humanCenter = { x: human.x + human.w / 2, y: human.y + human.h / 2 };
    const distance = dist(state.player, humanCenter);
    if (distance < human.danger) {
      state.kitchen.wake = Math.min(1.0, state.kitchen.wake + 0.55);
    }
  }
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
    banner: state.banner.timer > 0 ? `${state.banner.title}: ${state.banner.subtitle}` : "",
    particles: state.particles.length,
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
            pounceCooldown: Number(state.player.pounceCooldown.toFixed(2)),
            pouncing: state.player.pounce > 0,
            captureCooldown: Number(state.livingRoom.captureCooldown.toFixed(2)),
            laserDot: {
              x: Math.round(dot.x),
              y: Math.round(dot.y),
              targetX: Math.round(dot.targetX),
              targetY: Math.round(dot.targetY),
              evadeTimer: Number(dot.evadeTimer.toFixed(2)),
              r: dot.r,
            },
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
  if (key === "m") {
    triggerMeow();
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

function handleTitleCatClick() {
  if (state.mode === "menu") {
    const rugX = WIDTH / 2;
    const rugY = HEIGHT - 92;
    const catX = rugX;
    const catY = rugY - 14;
    const d = Math.hypot(pointer.x - catX, pointer.y - catY);
    if (d < 65) {
      playMeowSound();
      state.menuCatMeowTimer = 0.65;
    }
  }
}

canvas.addEventListener("pointerdown", (evt) => {
  updatePointerFromEvent(evt, true);
  handleTitleCatClick();
});

canvas.addEventListener("pointerup", () => {
  pointer.down = false;
});

canvas.addEventListener("mousemove", (evt) => updatePointerFromEvent(evt));
canvas.addEventListener("mousedown", (evt) => {
  updatePointerFromEvent(evt, true);
  handleTitleCatClick();
});
canvas.addEventListener("mouseup", () => {
  pointer.down = false;
});

// --- Virtual Joystick and Touch Inputs ---
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };

function updateJoystick(touch) {
  const rect = joystickBase.getBoundingClientRect();
  const knobRect = joystickKnob.getBoundingClientRect();
  const maxDisplacement = (rect.width - knobRect.width) / 2 || 30;

  const deltaX = touch.clientX - joystickCenter.x;
  const deltaY = touch.clientY - joystickCenter.y;
  const dist = Math.hypot(deltaX, deltaY);

  let targetX = deltaX;
  let targetY = deltaY;

  if (dist > maxDisplacement) {
    targetX = (deltaX / dist) * maxDisplacement;
    targetY = (deltaY / dist) * maxDisplacement;
  }

  touchInput.x = targetX / maxDisplacement;
  touchInput.y = targetY / maxDisplacement;

  joystickKnob.style.transform = `translate(${targetX}px, ${targetY}px)`;
}

if (isTouchDevice && joystickBase && joystickKnob) {
  document.getElementById("game-shell").classList.add("has-touch-controls");

  if (controlsGuide) {
    controlsGuide.textContent = "Move: Drag Joystick · Sneak / Pounce: Touch Buttons";
  }

  joystickBase.addEventListener("touchstart", (evt) => {
    evt.preventDefault();
    if (joystickTouchId !== null) return;

    const touch = evt.changedTouches[0];
    joystickTouchId = touch.identifier;

    joystickBase.classList.add("active");

    const rect = joystickBase.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    updateJoystick(touch);
  }, { passive: false });

  window.addEventListener("touchmove", (evt) => {
    if (joystickTouchId === null) return;

    for (let i = 0; i < evt.touches.length; i++) {
      if (evt.touches[i].identifier === joystickTouchId) {
        evt.preventDefault();
        updateJoystick(evt.touches[i]);
        break;
      }
    }
  }, { passive: false });

  const endJoystick = (evt) => {
    if (joystickTouchId === null) return;

    let ended = false;
    for (let i = 0; i < evt.changedTouches.length; i++) {
      if (evt.changedTouches[i].identifier === joystickTouchId) {
        ended = true;
        break;
      }
    }

    if (ended) {
      joystickTouchId = null;
      touchInput.x = 0;
      touchInput.y = 0;
      joystickKnob.style.transform = "translate(0px, 0px)";
      joystickBase.classList.remove("active");
    }
  };

  window.addEventListener("touchend", endJoystick);
  window.addEventListener("touchcancel", endJoystick);
}

if (isTouchDevice && touchSneak && touchPounce && touchMeow) {
  touchMeow.addEventListener("touchstart", (evt) => {
    evt.preventDefault();
    triggerMeow();
    touchMeow.classList.add("active");
  }, { passive: false });

  const endMeow = (evt) => {
    touchMeow.classList.remove("active");
  };
  touchMeow.addEventListener("touchend", endMeow);
  touchMeow.addEventListener("touchcancel", endMeow);

  touchSneak.addEventListener("touchstart", (evt) => {
    evt.preventDefault();
    touchInput.sneak = true;
    touchSneak.classList.add("active");
  }, { passive: false });

  const endSneak = (evt) => {
    touchInput.sneak = false;
    touchSneak.classList.remove("active");
  };
  touchSneak.addEventListener("touchend", endSneak);
  touchSneak.addEventListener("touchcancel", endSneak);

  touchPounce.addEventListener("touchstart", (evt) => {
    evt.preventDefault();
    touchInput.pounce = true;
    touchPounce.classList.add("active");
  }, { passive: false });

  const endPounce = (evt) => {
    touchInput.pounce = false;
    touchPounce.classList.remove("active");
  };
  touchPounce.addEventListener("touchend", endPounce);
  touchPounce.addEventListener("touchcancel", endPounce);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  manualClock = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  render();
};
window.__ricardoGame = { state, resetGame, startGame, resetLevel, nextLevel };

if (isTouchDevice) {
  audioToggle.textContent = "🔊 Sound";
} else {
  audioToggle.textContent = "Sound On";
}
audioToggle.setAttribute("aria-pressed", "false");
resetGame();
requestAnimationFrame(frame);
