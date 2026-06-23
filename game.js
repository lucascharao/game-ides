const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const selectScreen = document.querySelector("#selectScreen");
const gameScreen = document.querySelector("#gameScreen");
const roster = document.querySelector("#roster");
const leftName = document.querySelector("#leftName");
const rightName = document.querySelector("#rightName");
const leftPortrait = document.querySelector("#leftPortrait");
const rightPortrait = document.querySelector("#rightPortrait");
const leftHealth = document.querySelector("#leftHealth");
const rightHealth = document.querySelector("#rightHealth");
const roundState = document.querySelector("#roundState");
const timerNode = document.querySelector("#timer");
const restartButton = document.querySelector("#restartButton");
const selectButton = document.querySelector("#selectButton");
const soundButton = document.querySelector("#soundButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const endOverlay = document.querySelector("#endOverlay");
const endKicker = document.querySelector("#endKicker");
const endTitle = document.querySelector("#endTitle");
const endRestartButton = document.querySelector("#endRestartButton");

const FRAME_COLS = 4;
const FRAME_ROWS = 2;
const SHEET_GRID_HEIGHT_RATIO = 0.89;
const SPRITE_VISIBLE_HEIGHT_RATIO = 0.78;
const OUTCOME_TOP_CUT_RATIO = 0.1;
const OUTCOME_VISIBLE_HEIGHT_RATIO = 0.78;
const RESULT_REVEAL_DELAY = 2.8;
const FLOOR_Y = 592;
const GRAVITY = 2100;
const WALK_SPEED = 385;
const JUMP_VELOCITY = -860;
const ROUND_SECONDS = 90;
const MAX_HEALTH = 140;

const characters = [
  {
    id: "codex",
    name: "Codex",
    portrait: "Codex.png",
    sprite: "Codex_Sprite.png",
    outcomeSprite: "Codex_Victory e Defect.png",
    tint: "#7e54ff",
    special: "Voltaic Singularity",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    portrait: "Antigravity.png",
    sprite: "Antigravity_Sprite.png",
    outcomeSprite: "Antigravity_Victory e Defect.png",
    tint: "#26e5ff",
    special: "Zero-G Burst",
  },
  {
    id: "vscode",
    name: "VScode",
    portrait: "VScode.png",
    sprite: "VScode_Sprite.png",
    outcomeSprite: "ChatGPT Image 22 de jun. de 2026, 16_10_17 (4).png",
    tint: "#2f8cff",
    special: "Debug Crusher",
  },
  {
    id: "cursor",
    name: "Cursor",
    portrait: "Cursor.png",
    sprite: "Cursor_Sprite.png",
    outcomeSprite: "Cursor_Victory e Defect.png",
    tint: "#ffca4a",
    special: "Predictive Slash",
  },
];

const frameIndex = {
  idle: 0,
  walk: 1,
  punch: 2,
  kick: 3,
  grab: 4,
  block: 5,
  charge: 6,
  special: 7,
};

const keys = new Set();
const touchMap = {
  left: "a",
  right: "d",
  jump: "w",
  block: "s",
  punch: "j",
  kick: "k",
  special: "l",
};

const loadedImages = new Map();
const sfxFiles = {
  start: "audio/sfx/start.mp3",
  fight: "audio/sfx/fight.mp3",
  punch: "audio/sfx/punch.mp3",
  kick: "audio/sfx/kick.mp3",
  hit: "audio/sfx/hit.mp3",
  block: "audio/sfx/block.mp3",
  jump: "audio/sfx/jump.mp3",
  special: "audio/sfx/special.mp3",
  ko: "audio/sfx/ko.mp3",
  select: "audio/sfx/select.mp3",
};
const sfxVolume = {
  start: 0.82,
  fight: 0.82,
  punch: 0.74,
  kick: 0.78,
  hit: 0.78,
  block: 0.68,
  jump: 0.58,
  special: 0.84,
  ko: 0.88,
  select: 0.48,
};
const loadedSfx = new Map();
let arenaBackground = null;
let selectedIndex = 0;
let lastTime = 0;
let match = null;
let aiThink = 0;
let announcerUntil = 0;
let announcerText = "";
let audioContext = null;
let audioBus = null;
let soundEnabled = true;

loadImage("arena-background.png").then((image) => {
  arenaBackground = image;
});

function loadRecordedSfx(name) {
  if (loadedSfx.has(name)) return loadedSfx.get(name);
  const source = sfxFiles[name];
  if (!source) return null;
  const audio = new Audio(source);
  audio.preload = "auto";
  audio.volume = sfxVolume[name] || 0.75;
  loadedSfx.set(name, audio);
  return audio;
}

function playRecordedSfx(name) {
  const template = loadRecordedSfx(name);
  if (!template) return false;
  const audio = template.cloneNode(true);
  audio.volume = sfxVolume[name] || 0.75;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => playSyntheticSfx(name));
  }
  return true;
}

function createReverbImpulse(audio, duration = 0.52, decay = 3.2) {
  const sampleRate = audio.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = audio.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = (1 - i / length) ** decay;
      data[i] = (Math.random() * 2 - 1) * envelope * 0.52;
    }
  }

  return impulse;
}

function createAudioBus(audio) {
  const dry = audio.createGain();
  const wet = audio.createGain();
  const reverb = audio.createConvolver();
  const compressor = audio.createDynamicsCompressor();
  const master = audio.createGain();

  reverb.buffer = createReverbImpulse(audio);
  dry.gain.value = 0.74;
  wet.gain.value = 0.17;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 7;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.16;
  master.gain.value = 0.82;

  dry.connect(compressor);
  wet.connect(reverb);
  reverb.connect(compressor);
  compressor.connect(master);
  master.connect(audio.destination);

  return { dry, wet };
}

function getAudioContext() {
  if (!soundEnabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (!audioBus) audioBus = createAudioBus(audioContext);
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function connectSfxOutput(node, wetAmount = 0.08) {
  const audio = getAudioContext();
  if (!audio || !audioBus) return;
  const drySend = audio.createGain();
  const wetSend = audio.createGain();
  drySend.gain.value = 1;
  wetSend.gain.value = wetAmount;
  node.connect(drySend);
  node.connect(wetSend);
  drySend.connect(audioBus.dry);
  wetSend.connect(audioBus.wet);
}

function playTone({
  frequency,
  endFrequency,
  duration,
  type = "triangle",
  gain = 0.08,
  delay = 0,
  attack = 0.006,
  filter = 1800,
  endFilter,
  q = 0.8,
  pan = 0,
  wet = 0.06,
}) {
  const audio = getAudioContext();
  if (!audio || !audioBus) return;
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const toneFilter = audio.createBiquadFilter();
  const volume = audio.createGain();
  const panner = audio.createStereoPanner ? audio.createStereoPanner() : null;
  const safeFrequency = Math.max(20, frequency);
  const safeEndFrequency = Math.max(20, endFrequency || frequency);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(safeFrequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(safeEndFrequency, start + duration);
  toneFilter.type = "lowpass";
  toneFilter.frequency.setValueAtTime(filter, start);
  if (endFilter) toneFilter.frequency.exponentialRampToValueAtTime(Math.max(80, endFilter), start + duration);
  toneFilter.Q.value = q;
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + attack);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(toneFilter);
  toneFilter.connect(volume);
  if (panner) {
    panner.pan.setValueAtTime(pan, start);
    volume.connect(panner);
    connectSfxOutput(panner, wet);
  } else {
    connectSfxOutput(volume, wet);
  }
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playNoise({
  duration = 0.12,
  gain = 0.08,
  filter = 900,
  delay = 0,
  type = "bandpass",
  q = 0.9,
  pan = 0,
  wet = 0.04,
}) {
  const audio = getAudioContext();
  if (!audio || !audioBus) return;
  const sampleRate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  const start = audio.currentTime + delay;
  const source = audio.createBufferSource();
  const tone = audio.createBiquadFilter();
  const volume = audio.createGain();
  const panner = audio.createStereoPanner ? audio.createStereoPanner() : null;
  source.buffer = buffer;
  tone.type = type;
  tone.frequency.setValueAtTime(filter, start);
  tone.Q.value = q;
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(tone);
  tone.connect(volume);
  if (panner) {
    panner.pan.setValueAtTime(pan, start);
    volume.connect(panner);
    connectSfxOutput(panner, wet);
  } else {
    connectSfxOutput(volume, wet);
  }
  source.start(start);
}

function playSyntheticSfx(name) {
  if (!soundEnabled) return;
  if (name === "start") {
    playTone({ frequency: 96, endFrequency: 42, duration: 0.58, type: "sine", gain: 0.17, filter: 620, endFilter: 280, wet: 0.1 });
    playTone({ frequency: 192, endFrequency: 128, duration: 0.34, type: "triangle", gain: 0.07, delay: 0.05, filter: 940, wet: 0.16 });
    playNoise({ duration: 0.32, gain: 0.07, filter: 430, type: "lowpass", delay: 0.03, wet: 0.12 });
  }
  if (name === "fight") {
    playTone({ frequency: 126, endFrequency: 54, duration: 0.38, type: "triangle", gain: 0.17, filter: 760, endFilter: 260, wet: 0.08 });
    playTone({ frequency: 312, endFrequency: 184, duration: 0.22, type: "sine", gain: 0.08, delay: 0.05, filter: 1200, wet: 0.12 });
    playNoise({ duration: 0.18, gain: 0.06, filter: 920, delay: 0.02, wet: 0.08 });
  }
  if (name === "punch") {
    playTone({ frequency: 164, endFrequency: 86, duration: 0.085, type: "sine", gain: 0.06, filter: 720, wet: 0.02 });
    playNoise({ duration: 0.075, gain: 0.11, filter: 1280, q: 1.35, wet: 0.03 });
  }
  if (name === "kick") {
    playTone({ frequency: 112, endFrequency: 48, duration: 0.14, type: "triangle", gain: 0.12, filter: 620, endFilter: 210, wet: 0.03 });
    playNoise({ duration: 0.105, gain: 0.09, filter: 720, q: 1.1, delay: 0.012, wet: 0.04 });
  }
  if (name === "hit") {
    playTone({ frequency: 92, endFrequency: 36, duration: 0.2, type: "triangle", gain: 0.17, filter: 520, endFilter: 180, wet: 0.05 });
    playNoise({ duration: 0.14, gain: 0.12, filter: 540, q: 0.8, type: "lowpass", delay: 0.008, wet: 0.05 });
    playNoise({ duration: 0.045, gain: 0.08, filter: 2200, q: 1.4, wet: 0.02 });
  }
  if (name === "block") {
    playTone({ frequency: 460, endFrequency: 260, duration: 0.105, type: "triangle", gain: 0.055, filter: 1800, wet: 0.04 });
    playNoise({ duration: 0.095, gain: 0.065, filter: 1900, q: 1.8, wet: 0.03 });
  }
  if (name === "jump") {
    playTone({ frequency: 220, endFrequency: 430, duration: 0.13, type: "sine", gain: 0.052, filter: 980, wet: 0.06 });
    playNoise({ duration: 0.06, gain: 0.035, filter: 1500, delay: 0.01, wet: 0.02 });
  }
  if (name === "special") {
    playTone({ frequency: 72, endFrequency: 30, duration: 0.72, type: "sine", gain: 0.18, filter: 420, endFilter: 160, wet: 0.12 });
    playTone({ frequency: 196, endFrequency: 116, duration: 0.46, type: "triangle", gain: 0.09, delay: 0.055, filter: 980, wet: 0.16 });
    playTone({ frequency: 520, endFrequency: 1180, duration: 0.24, type: "sine", gain: 0.052, delay: 0.1, filter: 2400, wet: 0.22 });
    playNoise({ duration: 0.34, gain: 0.09, filter: 880, delay: 0.015, wet: 0.12 });
  }
  if (name === "ko") {
    playTone({ frequency: 118, endFrequency: 31, duration: 0.92, type: "triangle", gain: 0.2, filter: 560, endFilter: 140, wet: 0.15 });
    playTone({ frequency: 46, endFrequency: 24, duration: 0.72, type: "sine", gain: 0.16, delay: 0.055, filter: 220, wet: 0.1 });
    playNoise({ duration: 0.32, gain: 0.08, filter: 360, type: "lowpass", delay: 0.09, wet: 0.18 });
  }
  if (name === "select") {
    playTone({ frequency: 420, endFrequency: 620, duration: 0.09, type: "sine", gain: 0.045, filter: 1400, wet: 0.1 });
  }
}

function playSfx(name) {
  if (!soundEnabled) return;
  if (playRecordedSfx(name)) return;
  playSyntheticSfx(name);
}

function loadImage(src) {
  if (loadedImages.has(src)) return loadedImages.get(src);
  const image = new Image();
  const promise = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = reject;
  });
  image.src = src;
  loadedImages.set(src, promise);
  return promise;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chooseCpu(playerIndex) {
  return (playerIndex + 1 + Math.floor(Math.random() * (characters.length - 1))) % characters.length;
}

function setScreen(screen) {
  selectScreen.classList.toggle("is-active", screen === "select");
  gameScreen.classList.toggle("is-active", screen === "game");
  document.body.classList.toggle("game-active", screen === "game");
}

function renderRoster() {
  roster.innerHTML = "";
  characters.forEach((character, index) => {
    const button = document.createElement("button");
    button.className = `character${index === selectedIndex ? " is-selected" : ""}`;
    button.type = "button";
    button.style.setProperty("--portrait", `url(${character.portrait})`);
    button.innerHTML = `<span>${character.name}</span>`;
    button.addEventListener("click", () => {
      getAudioContext();
      playSfx("select");
      selectedIndex = index;
      renderRoster();
      startMatch();
    });
    roster.appendChild(button);
  });
}

function createFighter(character, side) {
  return {
    character,
    image: null,
    side,
    x: side === "left" ? 350 : 930,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    width: 242,
    height: 322,
    facing: side === "left" ? 1 : -1,
    health: MAX_HEALTH,
    energy: 32,
    state: "idle",
    actionTime: 0,
    actionDuration: 0,
    attackActive: false,
    hurtFlash: 0,
    blocking: false,
    cooldowns: {
      punch: 0,
      kick: 0,
      special: 0,
    },
    ai: {
      move: 0,
      block: false,
      attack: null,
    },
    frames: {},
    outcomeFrames: {
      victory: [],
      defeat: [],
    },
  };
}

function pixelIsBackground(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return luma < 42 || (luma < 78 && max - min < 44);
}

function removeBorderBackground(canvas) {
  const frameCtx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = frameCtx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const seen = new Uint8Array(width * height);
  const stack = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const point = y * width + x;
    if (seen[point]) return;
    const offset = point * 4;
    if (!pixelIsBackground(data, offset)) return;
    seen[point] = 1;
    stack.push(point);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length > 0) {
    const point = stack.pop();
    const x = point % width;
    const y = Math.floor(point / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let point = 0; point < seen.length; point += 1) {
    if (!seen[point]) continue;
    const offset = point * 4;
    data[offset + 3] = 0;
  }

  frameCtx.putImageData(imageData, 0, 0);
}

function trimTransparentFrame(source) {
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX > maxX || minY > maxY) return source;

  const padding = 6;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const trimmed = document.createElement("canvas");
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  trimmed.getContext("2d").drawImage(source, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}

function buildSpriteFrames(image) {
  const frames = {};
  const gridHeight = image.height * SHEET_GRID_HEIGHT_RATIO;
  const sw = image.width / FRAME_COLS;
  const cellHeight = gridHeight / FRAME_ROWS;
  const sh = cellHeight * SPRITE_VISIBLE_HEIGHT_RATIO;

  Object.entries(frameIndex).forEach(([state, idx]) => {
    const frame = document.createElement("canvas");
    frame.width = Math.round(sw);
    frame.height = Math.round(sh);
    const frameCtx = frame.getContext("2d", { willReadFrequently: true });
    const sx = (idx % FRAME_COLS) * sw;
    const sy = Math.floor(idx / FRAME_COLS) * cellHeight;
    frameCtx.drawImage(image, sx, sy, sw, sh, 0, 0, frame.width, frame.height);
    removeBorderBackground(frame);
    frames[state] = trimTransparentFrame(frame);
  });

  return frames;
}

function buildOutcomeFrames(image) {
  const outcomeFrames = {
    victory: [],
    defeat: [],
  };
  const gridHeight = image.height * SHEET_GRID_HEIGHT_RATIO;
  const sw = image.width / FRAME_COLS;
  const cellHeight = gridHeight / FRAME_ROWS;
  const topCut = cellHeight * OUTCOME_TOP_CUT_RATIO;
  const sh = cellHeight * OUTCOME_VISIBLE_HEIGHT_RATIO;

  ["victory", "defeat"].forEach((state, row) => {
    for (let col = 0; col < FRAME_COLS; col += 1) {
      const frame = document.createElement("canvas");
      frame.width = Math.round(sw);
      frame.height = Math.round(sh);
      const frameCtx = frame.getContext("2d", { willReadFrequently: true });
      frameCtx.drawImage(image, col * sw, row * cellHeight + topCut, sw, sh, 0, 0, frame.width, frame.height);
      removeBorderBackground(frame);
      outcomeFrames[state].push(trimTransparentFrame(frame));
    }
  });

  return outcomeFrames;
}

function setEndOverlay(visible, title = "", kicker = "Resultado") {
  endOverlay.classList.toggle("is-visible", visible);
  if (!visible) return;
  endKicker.textContent = kicker;
  endTitle.textContent = title;
}

async function startMatch() {
  getAudioContext();
  playSfx("start");
  const cpuIndex = chooseCpu(selectedIndex);
  const playerCharacter = characters[selectedIndex];
  const cpuCharacter = characters[cpuIndex];
  const [playerImage, cpuImage, playerOutcomeImage, cpuOutcomeImage] = await Promise.all([
    loadImage(playerCharacter.sprite),
    loadImage(cpuCharacter.sprite),
    loadImage(playerCharacter.outcomeSprite),
    loadImage(cpuCharacter.outcomeSprite),
    loadImage(playerCharacter.portrait),
    loadImage(cpuCharacter.portrait),
  ]);

  match = {
    player: createFighter(playerCharacter, "left"),
    cpu: createFighter(cpuCharacter, "right"),
    time: ROUND_SECONDS,
    state: "intro",
    stateTime: 1.7,
    overTime: 0,
    resultRevealAt: RESULT_REVEAL_DELAY,
    resultAnnounced: false,
    particles: [],
    impacts: [],
    cameraShake: 0,
    winner: null,
  };
  match.player.image = playerImage;
  match.cpu.image = cpuImage;
  match.player.frames = buildSpriteFrames(playerImage);
  match.cpu.frames = buildSpriteFrames(cpuImage);
  match.player.outcomeFrames = buildOutcomeFrames(playerOutcomeImage);
  match.cpu.outcomeFrames = buildOutcomeFrames(cpuOutcomeImage);

  leftName.textContent = playerCharacter.name;
  rightName.textContent = cpuCharacter.name;
  leftPortrait.src = playerCharacter.portrait;
  rightPortrait.src = cpuCharacter.portrait;
  roundState.textContent = "READY";
  timerNode.textContent = ROUND_SECONDS;
  announcerText = "ROUND 1";
  announcerUntil = 1.45;
  keys.clear();
  setEndOverlay(false);
  setScreen("game");
}

function restartMatch() {
  setEndOverlay(false);
  announcerUntil = 0;
  keys.clear();
  if (!match) return startMatch();
  return startMatch();
}

function goToSelect() {
  match = null;
  keys.clear();
  announcerUntil = 0;
  setEndOverlay(false);
  setScreen("select");
}

function canAct(fighter) {
  return fighter.health > 0 && !["punch", "kick", "special", "hurt", "ko", "victory", "defeat"].includes(fighter.state);
}

function isGrounded(fighter) {
  return fighter.y >= FLOOR_Y - 0.5;
}

function setAction(fighter, state, duration) {
  fighter.state = state;
  fighter.actionTime = duration;
  fighter.actionDuration = duration;
  fighter.attackActive = state === "punch" || state === "kick" || state === "special";
  if (state !== "block") fighter.blocking = false;
  if (state === "punch") fighter.vx = fighter.facing * 150;
  if (state === "kick") fighter.vx = fighter.facing * 205;
  if (state === "special") fighter.vx = fighter.facing * 235;
  if (state === "punch" || state === "kick" || state === "special") playSfx(state);
}

function applyInput(fighter, opponent, dt) {
  if (!canAct(fighter)) return;

  const left = keys.has("a");
  const right = keys.has("d");
  const block = keys.has("s");

  fighter.vx = 0;
  fighter.blocking = block && isGrounded(fighter);

  if (fighter.blocking) {
    fighter.state = "block";
    fighter.energy = Math.min(100, fighter.energy + 15 * dt);
    return;
  }

  if (left) fighter.vx -= WALK_SPEED;
  if (right) fighter.vx += WALK_SPEED;
  if (keys.has("w") && isGrounded(fighter)) {
    fighter.vy = JUMP_VELOCITY;
    playSfx("jump");
  }

  if (keys.has("j") && fighter.cooldowns.punch <= 0) {
    fighter.cooldowns.punch = 0.55;
    setAction(fighter, "punch", 0.3);
  } else if (keys.has("k") && fighter.cooldowns.kick <= 0) {
    fighter.cooldowns.kick = 0.85;
    setAction(fighter, "kick", 0.46);
  } else if (keys.has("l") && fighter.cooldowns.special <= 0 && fighter.energy >= 35) {
    fighter.energy -= 35;
    fighter.cooldowns.special = 6;
    setAction(fighter, "special", 0.78);
    spawnSpecial(fighter, opponent);
    announce(fighter.character.special, 0.72);
  } else {
    fighter.state = Math.abs(fighter.vx) > 0 ? "walk" : "idle";
  }
}

function applyAi(fighter, opponent, dt) {
  if (!canAct(fighter)) return;

  aiThink -= dt;
  const distance = Math.abs(opponent.x - fighter.x);
  if (aiThink <= 0) {
    aiThink = 0.16 + Math.random() * 0.18;
    fighter.ai.block = Math.random() < 0.15 && distance < 300;
    fighter.ai.attack = null;
    if (distance < 190) fighter.ai.attack = Math.random() < 0.56 ? "punch" : "kick";
    if (distance < 340 && fighter.energy >= 35 && Math.random() < 0.2) fighter.ai.attack = "special";
    fighter.ai.move = distance > 176 ? Math.sign(opponent.x - fighter.x) : Math.random() < 0.5 ? -1 : 1;
  }

  fighter.vx = 0;
  fighter.blocking = fighter.ai.block && isGrounded(fighter);
  if (fighter.blocking) {
    fighter.state = "block";
    fighter.energy = Math.min(100, fighter.energy + 11 * dt);
    return;
  }

  fighter.vx = fighter.ai.move * WALK_SPEED * 0.66;
  if (fighter.ai.attack === "punch" && fighter.cooldowns.punch <= 0) {
    fighter.cooldowns.punch = 0.55;
    setAction(fighter, "punch", 0.32);
  } else if (fighter.ai.attack === "kick" && fighter.cooldowns.kick <= 0) {
    fighter.cooldowns.kick = 0.85;
    setAction(fighter, "kick", 0.48);
  } else if (fighter.ai.attack === "special" && fighter.cooldowns.special <= 0) {
    fighter.energy -= 35;
    fighter.cooldowns.special = 6;
    setAction(fighter, "special", 0.8);
    spawnSpecial(fighter, opponent);
  } else {
    fighter.state = Math.abs(fighter.vx) > 0 ? "walk" : "idle";
  }
}

function updateFighter(fighter, opponent, dt) {
  fighter.facing = opponent.x >= fighter.x ? 1 : -1;
  fighter.energy = Math.min(100, fighter.energy + (fighter.state === "idle" ? 8 : 4) * dt);
  fighter.hurtFlash = Math.max(0, fighter.hurtFlash - dt);

  Object.keys(fighter.cooldowns).forEach((key) => {
    fighter.cooldowns[key] = Math.max(0, fighter.cooldowns[key] - dt);
  });

  if (fighter.actionTime > 0) {
    fighter.actionTime -= dt;
    if (fighter.actionTime <= 0) {
      fighter.attackActive = false;
      fighter.state = "idle";
    }
  }

  fighter.vy += GRAVITY * dt;
  fighter.x += fighter.vx * dt;
  fighter.y += fighter.vy * dt;
  fighter.x = clamp(fighter.x, 170, 1110);

  if (fighter.y >= FLOOR_Y) {
    fighter.y = FLOOR_Y;
    fighter.vy = 0;
  }
}

function resolveFighterCollision(primary, secondary) {
  const a = bodyBox(primary);
  const b = bodyBox(secondary);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return;

  const push = overlapX / 2 + 0.5;
  if (primary.x < secondary.x) {
    primary.x = clamp(primary.x - push, 170, 1110);
    secondary.x = clamp(secondary.x + push, 170, 1110);
  } else {
    primary.x = clamp(primary.x + push, 170, 1110);
    secondary.x = clamp(secondary.x - push, 170, 1110);
  }
  primary.vx = 0;
  secondary.vx = 0;
}

function attackBox(fighter) {
  const reach = fighter.state === "kick" ? 150 : fighter.state === "special" ? 225 : 122;
  const height = fighter.state === "kick" ? 116 : 135;
  return {
    x: fighter.x + fighter.facing * 112,
    y: fighter.y - 242,
    w: reach,
    h: height,
  };
}

function bodyBox(fighter) {
  return {
    x: fighter.x - 74,
    y: fighter.y - 286,
    w: 148,
    h: 260,
  };
}

function boxesOverlap(a, b) {
  const ax = a.w < 0 ? a.x + a.w : a.x;
  const aw = Math.abs(a.w);
  const bx = b.w < 0 ? b.x + b.w : b.x;
  const bw = Math.abs(b.w);
  return ax < bx + bw && ax + aw > bx && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveAttack(attacker, defender) {
  if (!attacker.attackActive || attacker.actionTime <= 0) return;
  const activeWindow = attacker.state === "special" ? attacker.actionTime < 0.36 : attacker.actionTime < 0.18;
  if (!activeWindow) return;
  const atk = attackBox(attacker);
  atk.w *= attacker.facing;
  if (!boxesOverlap(atk, bodyBox(defender))) return;

  attacker.attackActive = false;
  const baseDamage = attacker.state === "punch" ? 5 : attacker.state === "kick" ? 8 : 13;
  const damage = defender.blocking ? Math.ceil(baseDamage * 0.32) : baseDamage;
  defender.health = clamp(defender.health - damage, 0, MAX_HEALTH);
  defender.hurtFlash = 0.18;
  defender.vx = attacker.facing * (defender.blocking ? 120 : 260);
  if (!defender.blocking) setAction(defender, "hurt", 0.18);
  playSfx(defender.blocking ? "block" : "hit");
  match.cameraShake = Math.max(match.cameraShake, defender.blocking ? 5 : 12);
  spawnImpact(defender.x, defender.y - 208, attacker.character.tint, defender.blocking);
  if (defender.health <= 0) {
    finishMatch(attacker, defender);
  }
}

function finishMatch(winner, loser) {
  if (!match || match.state === "over") return;
  match.state = "over";
  match.stateTime = 3;
  match.overTime = 0;
  match.resultAnnounced = false;
  match.winner = winner;
  winner.state = "victory";
  winner.actionTime = 999;
  winner.actionDuration = 999;
  winner.attackActive = false;
  winner.blocking = false;
  winner.vx = 0;
  loser.state = "defeat";
  loser.actionTime = 999;
  loser.actionDuration = 999;
  loser.attackActive = false;
  loser.blocking = false;
  loser.vx = 0;
  playSfx("ko");
  winner.x = 360;
  winner.y = FLOOR_Y;
  loser.x = 920;
  loser.y = FLOOR_Y;
  winner.facing = 1;
  loser.facing = -1;
}

function spawnImpact(x, y, color, blocked) {
  match.impacts.push({ x, y, color, life: 0.18, blocked });
  for (let i = 0; i < (blocked ? 7 : 15); i += 1) {
    match.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 680,
      vy: (Math.random() - 0.75) * 520,
      life: 0.32 + Math.random() * 0.22,
      size: 3 + Math.random() * 7,
      color,
    });
  }
}

function spawnSpecial(fighter, opponent) {
  const direction = Math.sign(opponent.x - fighter.x) || fighter.facing;
  for (let i = 0; i < 28; i += 1) {
    match.particles.push({
      x: fighter.x + direction * (60 + Math.random() * 110),
      y: fighter.y - 210 + (Math.random() - 0.5) * 130,
      vx: direction * (360 + Math.random() * 480),
      vy: (Math.random() - 0.5) * 300,
      life: 0.38 + Math.random() * 0.34,
      size: 4 + Math.random() * 10,
      color: fighter.character.tint,
    });
  }
}

function announce(text, duration) {
  announcerText = text;
  announcerUntil = duration;
  roundState.textContent = text.length > 12 ? "SPECIAL" : text;
}

function updateParticles(dt) {
  match.particles = match.particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 480 * dt;
    return particle.life > 0;
  });
  match.impacts = match.impacts.filter((impact) => {
    impact.life -= dt;
    return impact.life > 0;
  });
}

function updateMatch(dt) {
  if (!match) return;

  match.cameraShake = Math.max(0, match.cameraShake - 42 * dt);
  announcerUntil = Math.max(0, announcerUntil - dt);

  if (match.state === "intro") {
    match.stateTime -= dt;
    if (match.stateTime <= 0) {
      match.state = "fight";
      roundState.textContent = "FIGHT";
      announce("FIGHT", 0.9);
      playSfx("fight");
    }
  } else if (match.state === "fight") {
    match.time = Math.max(0, match.time - dt);
    timerNode.textContent = String(Math.ceil(match.time));
    applyInput(match.player, match.cpu, dt);
    applyAi(match.cpu, match.player, dt);
    resolveFighterCollision(match.player, match.cpu);
    if (match.time <= 0) {
      const winner = match.player.health >= match.cpu.health ? match.player : match.cpu;
      const loser = winner === match.player ? match.cpu : match.player;
      finishMatch(winner, loser);
    }
  } else if (match.state === "over") {
    match.overTime += dt;
    if (match.overTime >= match.resultRevealAt && !match.resultAnnounced) {
      match.resultAnnounced = true;
      announce(`${match.winner.character.name} Wins`, 3);
      setEndOverlay(true, `${match.winner.character.name} venceu`, "Fim da luta");
    }
  }

  updateFighter(match.player, match.cpu, dt);
  updateFighter(match.cpu, match.player, dt);
  resolveAttack(match.player, match.cpu);
  resolveAttack(match.cpu, match.player);
  updateParticles(dt);
  updateHud();
}

function updateHud() {
  if (!match) return;
  leftHealth.style.transform = `scaleX(${match.player.health / MAX_HEALTH})`;
  rightHealth.style.transform = `scaleX(${match.cpu.health / MAX_HEALTH})`;
}

function drawArena(time) {
  ctx.fillStyle = "#05050a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (arenaBackground) {
    ctx.drawImage(arenaBackground, 0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  const dusk = ctx.createLinearGradient(0, 0, 0, canvas.height);
  dusk.addColorStop(0, "rgba(0, 0, 0, 0.74)");
  dusk.addColorStop(0.42, "rgba(7, 9, 14, 0.6)");
  dusk.addColorStop(1, "rgba(3, 4, 8, 0.9)");
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const pulse = Math.sin(time * 0.0014) * 0.5 + 0.5;

  ctx.save();
  ctx.globalAlpha = 0.64;
  ctx.fillStyle = "#1b2230";
  ctx.beginPath();
  ctx.arc(1010, 174, 178, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "screen";
  const moonGlow = ctx.createRadialGradient(1010, 174, 40, 1010, 174, 250);
  moonGlow.addColorStop(0, "rgba(255, 196, 84, 0.18)");
  moonGlow.addColorStop(1, "rgba(255, 196, 84, 0)");
  ctx.fillStyle = moonGlow;
  ctx.fillRect(720, 0, 560, 430);
  ctx.restore();

  for (let i = 0; i < 54; i += 1) {
    const x = (i * 97 + time * 0.018) % 1280;
    const y = 55 + ((i * 53) % 280);
    ctx.fillStyle = i % 5 === 0 ? "rgba(242, 184, 75, 0.68)" : "rgba(255,255,255,0.5)";
    ctx.fillRect(x, y, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
  }

  ctx.strokeStyle = `rgba(38, 229, 255, ${0.12 + pulse * 0.1})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, FLOOR_Y + i * 20);
    ctx.lineTo(1280, FLOOR_Y + i * 10);
    ctx.stroke();
  }

  const floor = ctx.createLinearGradient(0, FLOOR_Y - 24, 0, 720);
  floor.addColorStop(0, "#262735");
  floor.addColorStop(0.1, "#12131a");
  floor.addColorStop(1, "#050507");
  ctx.fillStyle = floor;
  ctx.fillRect(0, FLOOR_Y - 24, 1280, 160);

  ctx.fillStyle = "rgba(255, 59, 47, 0.22)";
  ctx.fillRect(0, FLOOR_Y - 30, 1280, 4);
  ctx.fillStyle = "rgba(242, 184, 75, 0.42)";
  ctx.fillRect(0, FLOOR_Y - 25, 1280, 2);
}

function drawFighter(fighter) {
  const outcomeFrames = fighter.outcomeFrames[fighter.state];
  const outcomeFrame = outcomeFrames && outcomeFrames.length > 0 ? outcomeFrames[Math.min(outcomeFrames.length - 1, Math.floor((match?.overTime || 0) * 2.2))] : null;
  const frame = outcomeFrame || fighter.frames[fighter.state] || fighter.frames.idle;
  const progress = fighter.actionDuration > 0 ? 1 - fighter.actionTime / fighter.actionDuration : 0;
  const walkCycle = Math.sin(performance.now() * 0.018);
  const idleCycle = Math.sin(performance.now() * 0.004);
  const actionLean = ["punch", "kick", "special"].includes(fighter.state) ? Math.sin(progress * Math.PI) : 0;
  const outcomeScale = outcomeFrame ? (fighter.state === "victory" ? 1.16 : 1.08) : 1;
  const drawW = (fighter.state === "special" ? fighter.width * 1.24 : fighter.width) * (1 + actionLean * 0.05) * outcomeScale;
  const drawH = fighter.height * (1 + (fighter.state === "idle" ? idleCycle * 0.012 : 0)) * outcomeScale;
  const lift = fighter.state === "walk" && isGrounded(fighter) ? Math.abs(walkCycle) * 8 : 0;
  const dx = fighter.x - drawW / 2;

  ctx.save();
  ctx.translate(fighter.x, fighter.y);
  if (fighter.facing < 0) ctx.scale(-1, 1);
  ctx.rotate((fighter.state === "walk" ? walkCycle * 0.018 : 0) + actionLean * 0.035);
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = fighter.character.tint;
  ctx.shadowBlur = fighter.state === "special" || fighter.state === "charge" ? 28 : 10;
  ctx.globalAlpha = 1;
  if (fighter.hurtFlash > 0) {
    ctx.filter = "brightness(1.85) saturate(1.45)";
  }
  ctx.drawImage(frame, -drawW / 2 + actionLean * 16, -drawH - lift, drawW, drawH);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const shadow = ctx.createRadialGradient(fighter.x, FLOOR_Y + 2, 20, fighter.x, FLOOR_Y + 2, 130);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(dx - 30, FLOOR_Y - 38, drawW + 60, 82);
  ctx.restore();
}

function drawParticles() {
  match.particles.forEach((particle) => {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(particle.life * 3, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  match.impacts.forEach((impact) => {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(impact.life * 6, 0, 1);
    ctx.strokeStyle = impact.blocked ? "#ffffff" : impact.color;
    ctx.lineWidth = impact.blocked ? 4 : 7;
    ctx.shadowColor = impact.color;
    ctx.shadowBlur = 34;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, (1 - impact.life / 0.18) * 62 + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function drawAnnouncer() {
  if (announcerUntil <= 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 76px Impact, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.fillStyle = announcerText === "FIGHT" ? "#ff3b2f" : "#f2b84b";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 30;
  ctx.strokeText(announcerText.toUpperCase(), 640, 168);
  ctx.fillText(announcerText.toUpperCase(), 640, 168);
  ctx.restore();
}

function drawMatch(time) {
  if (!match) return;
  ctx.save();
  if (match.cameraShake > 0) {
    ctx.translate((Math.random() - 0.5) * match.cameraShake, (Math.random() - 0.5) * match.cameraShake);
  }
  drawArena(time);
  const fighters = [match.player, match.cpu].sort((a, b) => a.y - b.y);
  drawFighter(fighters[0]);
  drawFighter(fighters[1]);
  drawParticles();
  drawAnnouncer();
  ctx.restore();
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  updateMatch(dt);
  drawMatch(time);
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  getAudioContext();
  if (key === "enter" && match?.state === "over") {
    event.preventDefault();
    restartMatch();
    return;
  }
  if (key === "enter" && !match) startMatch();
  if (["a", "d", "w", "s", "j", "k", "l"].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
  if (key === "arrowleft") selectedIndex = (selectedIndex + characters.length - 1) % characters.length;
  if (key === "arrowright") selectedIndex = (selectedIndex + 1) % characters.length;
  if (key === "arrowleft" || key === "arrowright") {
    playSfx("select");
    renderRoster();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

document.querySelectorAll("[data-touch]").forEach((button) => {
  const key = touchMap[button.dataset.touch];
  const hold = () => keys.add(key);
  const release = () => keys.delete(key);
  button.addEventListener("pointerdown", hold);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

restartButton.addEventListener("click", restartMatch);
endRestartButton.addEventListener("click", restartMatch);
selectButton.addEventListener("click", goToSelect);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = soundEnabled ? "Som: On" : "Som: Off";
  if (soundEnabled) {
    getAudioContext();
    playSfx("select");
  }
});
fullscreenButton.addEventListener("click", () => {
  const target = document.documentElement;
  if (!document.fullscreenElement && target.requestFullscreen) {
    target.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
});

renderRoster();
Promise.all(characters.flatMap((character) => [loadImage(character.portrait), loadImage(character.sprite)])).then(() => {
  requestAnimationFrame(loop);
});
