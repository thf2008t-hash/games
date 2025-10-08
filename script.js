const canvas = document.getElementById("pitch");
const ctx = canvas.getContext("2d");

const playerScoreEl = document.getElementById("playerScore");
const keeperScoreEl = document.getElementById("keeperScore");
const roundIndicatorEl = document.getElementById("roundIndicator");
const phaseLabelEl = document.getElementById("phaseLabel");
const controlsContainer = document.getElementById("controls");
const commentaryEl = document.getElementById("commentary");

const GOAL = {
  x: canvas.width / 2,
  y: 110,
  width: 340,
  height: 160,
};
const PENALTY_SPOT = {
  x: canvas.width / 2,
  y: canvas.height - 120,
};

const crowdSeats = createCrowd();
const floodlights = createFloodlights();

const gameState = {
  phase: "playerShoot",
  round: 1,
  maxRounds: 5,
  playerGoals: 0,
  playerSaves: 0,
  halfComplete: false,
  animationId: null,
  lastTimestamp: 0,
  activeShot: null,
  aiShotPlan: null,
  pendingShot: null,
  lightsPhase: 0,
  cameraShake: {
    offsetX: 0,
    offsetY: 0,
    intensity: 0,
    duration: 0,
    maxDuration: 0,
  },
};

const striker = {
  x: PENALTY_SPOT.x,
  y: PENALTY_SPOT.y + 90,
  baseX: PENALTY_SPOT.x,
  restY: PENALTY_SPOT.y + 90,
  plantY: PENALTY_SPOT.y + 40,
  colorPrimary: "#ffe36a",
  colorSecondary: "#fcb045",
  state: "idle",
  progress: 0,
  offset: 0,
  lean: 0,
  swing: 0,
  breathing: 0,
  fired: false,
  recoverTimer: 0,
};

const keeper = {
  x: GOAL.x,
  y: GOAL.y + GOAL.height - 35,
  baseX: GOAL.x,
  baseY: GOAL.y + GOAL.height - 35,
  colorPrimary: "#6bdcff",
  colorSecondary: "#1a9af7",
  diveAngle: 0,
  diveSpeed: 0,
  diveActive: false,
  reactionTimer: 0,
  idlePhase: 0,
  stretch: 0,
};

const ball = {
  x: PENALTY_SPOT.x,
  y: PENALTY_SPOT.y,
  radius: 11,
  vx: 0,
  vy: 0,
  vz: 0,
  z: 0,
  rotation: 0,
  rotationSpeed: 0,
  active: false,
  owner: "player", // or "ai"
  trail: [],
};

const templates = {
  striker: document.getElementById("strikerControls"),
  keeper: document.getElementById("keeperControls"),
};

init();

function init() {
  attachControls();
  addCommentary("Step up to the spot. Pick your angle and power, then rip it past the keeper!");
  updateScoreboard();
  render(0);
}

function attachControls() {
  controlsContainer.innerHTML = "";
  const template =
    gameState.phase === "playerShoot" ? templates.striker : templates.keeper;
  controlsContainer.appendChild(template.content.cloneNode(true));

  if (gameState.phase === "playerShoot") {
    document.getElementById("shootButton").addEventListener("click", handlePlayerShot);
  } else {
    document.getElementById("diveButton").addEventListener("click", handlePlayerDive);
  }
}

function handlePlayerShot() {
  const aimSlider = document.getElementById("aimSlider");
  const powerSlider = document.getElementById("powerSlider");
  const aimValue = Number(aimSlider.value);
  const powerValue = Number(powerSlider.value);

  if (ball.active || striker.state === "runUp") return;

  const aimNormalized = aimValue / 40; // -1..1
  const targetX = GOAL.x + aimNormalized * (GOAL.width / 2 - 18);
  const targetY = GOAL.y + 10;
  const jitter = (Math.random() - 0.5) * 8;
  const dx = targetX - PENALTY_SPOT.x + jitter;
  const dy = targetY - PENALTY_SPOT.y;
  const distance = Math.hypot(dx, dy);

  gameState.pendingShot = {
    aimNormalized,
    powerValue,
    targetX,
    targetY,
    jitter,
  };

  striker.state = "runUp";
  striker.progress = 0;
  striker.offset = aimNormalized * 42;
  striker.lean = 0;
  striker.swing = 0;
  striker.fired = false;

  disableCurrentButton();
  addCommentary(
    `You go high ${aimValue > 0 ? "to the right" : aimValue < 0 ? "to the left" : "through the middle"}. ${describePower(
      powerValue
    )}`
  );
}

function handlePlayerDive() {
  if (ball.active) return;

  const diveSlider = document.getElementById("diveSlider");
  const reachSlider = document.getElementById("reachSlider");
  const angleValue = Number(diveSlider.value);
  const reachValue = Number(reachSlider.value);

  prepareAiShot();

  keeper.diveAngle = (angleValue / 55) * (Math.PI / 2.2);
  keeper.diveSpeed = reachValue / 12;
  keeper.reactionTimer = 120;
  keeper.diveActive = false;

  ball.active = true;
  ball.owner = "ai";
  ball.x = PENALTY_SPOT.x;
  ball.y = PENALTY_SPOT.y;
  ball.z = 0;
  ball.trail = [];
  ball.rotation = 0;
  ball.rotationSpeed = 0.18;

  const { targetX, targetY, power } = gameState.aiShotPlan;
  const dx = targetX - PENALTY_SPOT.x;
  const dy = targetY - PENALTY_SPOT.y;
  const distance = Math.hypot(dx, dy);
  const speed = power / 1.55;
  ball.vx = (dx / distance) * speed;
  ball.vy = (dy / distance) * speed;
  ball.vz = Math.max(2.4, power / 28);

  gameState.activeShot = {
    type: "ai",
    started: performance.now(),
    resolution: null,
  };

  disableCurrentButton();
  addCommentary(
    `You set your stance and dive ${angleValue > 5 ? "to the right" : angleValue < -5 ? "left" : "straight"} with ${describeExplosiveness(
      reachValue
    )}.`
  );
}

function prepareAiShot() {
  const targetOffset = (Math.random() - 0.5) * 1.7;
  const highShot = Math.random() > 0.55;
  const targetX = GOAL.x + targetOffset * (GOAL.width / 2 - 20);
  const targetY = GOAL.y + (highShot ? 5 + Math.random() * 12 : 35 + Math.random() * 20);
  const power = 72 + Math.random() * 34;

  gameState.aiShotPlan = { targetX, targetY, power };
  addCommentary(
    `The opponent takes a breath and eyes the ${targetOffset > 0 ? "right" : targetOffset < 0 ? "left" : "center"} corner.`
  );
}

function launchPendingShot() {
  if (!gameState.pendingShot) return;
  const { aimNormalized, powerValue, targetX, targetY, jitter } = gameState.pendingShot;

  const dx = targetX - PENALTY_SPOT.x + jitter;
  const dy = targetY - PENALTY_SPOT.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = powerValue / 1.65;

  ball.vx = (dx / dist) * speed;
  ball.vy = (dy / dist) * speed;
  ball.vz = Math.max(2.8, powerValue / 26);
  ball.rotationSpeed = 0.22 + powerValue / 620;
  ball.x = PENALTY_SPOT.x;
  ball.y = PENALTY_SPOT.y;
  ball.z = 0;
  ball.trail = [];
  ball.rotation = 0;
  ball.active = true;
  ball.owner = "player";

  gameState.activeShot = {
    type: "player",
    started: performance.now(),
    resolution: null,
  };

  const reactionDelay = 180 + Math.max(0, 420 - powerValue * 3.2);
  const bias = aimNormalized + (Math.random() - 0.5) * 0.38;
  keeper.diveAngle = clamp(bias, -1, 1) * (Math.PI / 3.4);
  keeper.diveSpeed = 5.6 + Math.random() * 1.15 + powerValue / 55;
  keeper.reactionTimer = reactionDelay;
  keeper.diveActive = false;
  keeper.stretch = 0;

  gameState.pendingShot = null;
}

function disableCurrentButton() {
  const button = controlsContainer.querySelector("button.primary");
  if (button) {
    button.disabled = true;
  }
}

function resolveShot(outcome, detail) {
  if (!gameState.activeShot || gameState.activeShot.resolution) return;
  gameState.activeShot.resolution = outcome;

  if (outcome === "goal") {
    if (gameState.activeShot.type === "player") {
      gameState.playerGoals += 1;
    }
    addCommentary(detail || "Goal! The net ripples.");
    triggerCameraShake(20, 500);
  } else if (outcome === "save") {
    if (gameState.activeShot.type === "ai") {
      gameState.playerSaves += 1;
    }
    addCommentary(detail || "What a save! You keep it out.");
    triggerCameraShake(14, 420);
  } else {
    addCommentary(detail || "It's off target.");
    triggerCameraShake(8, 320);
  }

  updateScoreboard();
  ball.active = false;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.rotationSpeed = 0;
  keeper.diveActive = false;
  keeper.x = keeper.baseX;
  keeper.y = keeper.baseY;
  keeper.stretch = 0;
  keeper.reactionTimer = 0;
  keeper.idlePhase = 0;
  if (striker.state === "runUp") {
    striker.state = "recover";
    striker.recoverTimer = 420;
  }

  setTimeout(() => {
    nextPhase();
  }, 1400);
}

function updateScoreboard() {
  playerScoreEl.textContent = gameState.playerGoals;
  keeperScoreEl.textContent = gameState.playerSaves;
  roundIndicatorEl.textContent = `${gameState.round} / ${gameState.maxRounds}`;
  phaseLabelEl.textContent = gameState.phase === "playerShoot" ? "On the Spot" : "Guard the Line";
}

function nextPhase() {
  ball.trail = [];
  ball.x = PENALTY_SPOT.x;
  ball.y = PENALTY_SPOT.y;
  gameState.activeShot = null;
  gameState.aiShotPlan = null;

  if (gameState.phase === "playerShoot") {
    gameState.phase = "playerSave";
    addCommentary("Swap gloves! Set your dive angle then hit Dive when ready.");
  } else {
    if (gameState.round >= gameState.maxRounds) {
      finishGame();
      return;
    }
    gameState.round += 1;
    gameState.phase = "playerShoot";
    addCommentary("Back on the spot. Time to outsmart the keeper again.");
  }

  attachControls();
  updateScoreboard();
}

function finishGame() {
  const { playerGoals, playerSaves } = gameState;
  let verdict = "It's a balanced duel!";
  if (playerGoals + playerSaves >= 7) {
    verdict = "You dominate the shootout!";
  } else if (playerGoals >= 3 && playerSaves >= 2) {
    verdict = "You edge it with nerve and reflexes.";
  } else if (playerGoals < 2 && playerSaves < 2) {
    verdict = "The crowd wants more precision next time.";
  }

  addCommentary(
    `Shootout complete — ${playerGoals} goals scored and ${playerSaves} saves made. ${verdict}`
  );
  controlsContainer.innerHTML = "";
  phaseLabelEl.textContent = "Shootout Complete";
}

function addCommentary(text) {
  const p = document.createElement("p");
  p.textContent = text;
  commentaryEl.appendChild(p);
  commentaryEl.scrollTop = commentaryEl.scrollHeight;
}

function render(timestamp) {
  const delta = timestamp - gameState.lastTimestamp;
  gameState.lastTimestamp = timestamp;

  updatePhysics(delta);
  drawScene();

  gameState.animationId = requestAnimationFrame(render);
}

function updatePhysics(delta) {
  updateStriker(delta);
  updateAtmosphere(delta);
  updateCamera(delta);

  if (ball.active) {
    updateBall(delta);
  }

  updateKeeper(delta);

  if (ball.active) {
    evaluateShot();
  }
}

function updateStriker(delta) {
  const step = (delta / 16.67) || 1;
  striker.breathing += delta * 0.0025;

  if (striker.state === "runUp") {
    striker.progress += delta / 520;
    const eased = easeOutCubic(Math.min(striker.progress, 1));
    striker.y = striker.restY - (striker.restY - striker.plantY) * eased;
    striker.x = striker.baseX + striker.offset * easeOutQuad(Math.min(striker.progress, 1));
    striker.lean = striker.offset / 120 * eased;
    striker.swing = Math.sin(striker.progress * Math.PI * 1.2) * 34;

    if (!striker.fired && striker.progress >= 0.82) {
      striker.fired = true;
      launchPendingShot();
    }

    if (striker.progress >= 1.18) {
      striker.state = "recover";
      striker.recoverTimer = 380;
    }
  } else if (striker.state === "recover") {
    striker.recoverTimer -= delta;
    striker.swing *= 0.85;
    striker.lean *= 0.9;
    striker.y += (striker.restY - striker.y) * 0.12 * step;
    striker.x += (striker.baseX - striker.x) * 0.12 * step;
    if (striker.recoverTimer <= 0) {
      striker.state = "idle";
      striker.progress = 0;
    }
  } else {
    const idleBob = Math.sin(striker.breathing) * 4;
    striker.y = striker.restY + idleBob;
    striker.x = striker.baseX + Math.sin(striker.breathing * 1.6) * 6;
    striker.lean = Math.sin(striker.breathing * 0.9) * 0.15;
    striker.swing = Math.sin(striker.breathing * 1.2) * 12;
  }
}

function updateAtmosphere(delta) {
  gameState.lightsPhase = (gameState.lightsPhase + delta * 0.00032) % 1;
}

function updateCamera(delta) {
  const shake = gameState.cameraShake;
  if (shake.duration > 0) {
    shake.duration -= delta;
    const intensity = shake.intensity * (shake.duration / shake.maxDuration);
    shake.offsetX = (Math.random() - 0.5) * intensity;
    shake.offsetY = (Math.random() - 0.5) * intensity * 0.7;
  } else {
    shake.offsetX *= 0.88;
    shake.offsetY *= 0.88;
  }
}

function triggerCameraShake(intensity, duration) {
  const shake = gameState.cameraShake;
  shake.intensity = intensity / 10;
  shake.duration = duration;
  shake.maxDuration = duration;
}

function updateBall(delta) {
  const step = (delta / 16.67) || 1;
  ball.x += ball.vx * step;
  ball.y += ball.vy * step;
  ball.z += ball.vz * step;
  ball.vz -= 0.85 * step;

  if (ball.z < 0) {
    ball.z = 0;
    ball.vz *= -0.28;
  }

  ball.rotation += ball.rotationSpeed * step;
  if (ball.rotation > Math.PI * 2) {
    ball.rotation -= Math.PI * 2;
  }

  const renderY = ball.y - ball.z;

  ball.trail.push({ x: ball.x, y: renderY, life: 1 });
  if (ball.trail.length > 24) {
    ball.trail.shift();
  }

  ball.trail.forEach((spark) => {
    spark.life -= 0.04 * step;
  });
  ball.trail = ball.trail.filter((spark) => spark.life > 0);

  ball.vx *= 0.9985;
  ball.vy *= 0.9985;
}

function updateKeeper(delta) {
  const step = (delta / 16.67) || 1;
  keeper.idlePhase += delta * 0.002;
  keeper.stretch = Math.max(keeper.stretch - delta * 0.004, 0);

  if (keeper.reactionTimer > 0) {
    keeper.reactionTimer -= delta;
  }

  if (!keeper.diveActive && keeper.reactionTimer <= 0 && ball.active) {
    keeper.diveActive = true;
  }

  if (keeper.diveActive) {
    keeper.x += Math.sin(keeper.diveAngle) * keeper.diveSpeed * step;
    keeper.y += Math.cos(keeper.diveAngle) * keeper.diveSpeed * step;
    keeper.x = clamp(keeper.x, GOAL.x - GOAL.width / 2 + 35, GOAL.x + GOAL.width / 2 - 35);
    keeper.y = clamp(keeper.y, GOAL.y + GOAL.height * 0.35, GOAL.y + GOAL.height - 12);
    keeper.stretch = Math.min(1, keeper.stretch + 0.05 * step);
  } else {
    const sway = Math.sin(keeper.idlePhase) * 18;
    keeper.x = keeper.baseX + sway;
    keeper.y = keeper.baseY + Math.sin(keeper.idlePhase * 1.6) * 6;
  }
}

function evaluateShot() {
  const renderY = ball.y - ball.z;
  const withinPosts =
    ball.x > GOAL.x - GOAL.width / 2 + ball.radius &&
    ball.x < GOAL.x + GOAL.width / 2 - ball.radius;

  const goalLineY = GOAL.y + 6;
  const keeperRadius = 42 + keeper.stretch * 14;
  const distToKeeper = Math.hypot(ball.x - keeper.x, renderY - (keeper.y - 26));
  const saved = distToKeeper < keeperRadius;

  if (saved) {
    resolveShot("save", gameState.phase === "playerSave" ? "Glorious save! You get a strong glove on it." : "Keeper guesses right and parries it away.");
    return;
  }

  if (renderY <= GOAL.y && ball.z > 24 && withinPosts) {
    resolveShot("miss", "Off the bar! It rattles the woodwork and stays out.");
    return;
  }

  if (renderY <= goalLineY) {
    if (withinPosts) {
      if (gameState.phase === "playerShoot") {
        resolveShot("goal", "Bottom corner! The keeper can't get there.");
      } else {
        resolveShot("goal", "The taker tucks it home despite your dive.");
      }
    } else {
      resolveShot("miss", gameState.phase === "playerShoot" ? "It sails wide of the posts." : "They blaze it off target — relief!");
    }
  }

  if (renderY < GOAL.y - 60 || renderY > canvas.height + 40 || ball.x < -80 || ball.x > canvas.width + 80) {
    resolveShot("miss");
  }
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(gameState.cameraShake.offsetX, gameState.cameraShake.offsetY);

  drawCrowd();
  drawFloodlights();
  drawStadium();
  drawPitch();
  drawGoal();
  drawPenaltyMark();
  drawPlayers();
  drawBall();

  ctx.restore();
}

function drawCrowd() {
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, GOAL.y - 20);
  grad.addColorStop(0, "#13223c");
  grad.addColorStop(1, "#040812");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, GOAL.y - 20);

  const pulse = 0.45 + Math.sin(gameState.lightsPhase * Math.PI * 2) * 0.15;
  crowdSeats.forEach((seat) => {
    ctx.fillStyle = applyAlpha(seat.color, pulse);
    ctx.fillRect(seat.x, seat.y, seat.w, seat.h);
  });
  ctx.restore();
}

function drawFloodlights() {
  ctx.save();
  const glow = 0.55 + Math.sin(gameState.lightsPhase * Math.PI * 2) * 0.25;
  floodlights.forEach((light) => {
    const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.55 * glow})`);
    gradient.addColorStop(0.4, `rgba(${light.color}, ${0.2 * glow})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
    ctx.fill();

    const beamGradient = ctx.createLinearGradient(light.x, light.y, light.x, light.y + light.beamLength);
    beamGradient.addColorStop(0, `rgba(${light.color}, ${0.25 * glow})`);
    beamGradient.addColorStop(1, "rgba(10, 20, 30, 0)");
    ctx.fillStyle = beamGradient;
    ctx.beginPath();
    ctx.moveTo(light.x - light.beamSpread, light.y + 10);
    ctx.lineTo(light.x + light.beamSpread, light.y + 10);
    ctx.lineTo(light.x + light.beamSpread * 0.5, light.y + light.beamLength);
    ctx.lineTo(light.x - light.beamSpread * 0.5, light.y + light.beamLength);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawStadium() {
  ctx.save();
  const terraceGradient = ctx.createLinearGradient(0, GOAL.y - 40, 0, GOAL.y + GOAL.height + 40);
  terraceGradient.addColorStop(0, "rgba(10, 18, 28, 0.9)");
  terraceGradient.addColorStop(1, "rgba(3, 8, 16, 0.9)");
  ctx.fillStyle = terraceGradient;
  ctx.fillRect(0, GOAL.y - 20, canvas.width, GOAL.height + 60);

  const ledGlow = 0.45 + Math.sin(gameState.lightsPhase * Math.PI * 2) * 0.25;
  ctx.fillStyle = `rgba(68, 156, 255, ${0.4 + ledGlow * 0.25})`;
  ctx.fillRect(0, GOAL.y + GOAL.height + 8, canvas.width, 12);

  ctx.fillStyle = "rgba(8, 16, 28, 0.92)";
  ctx.fillRect(0, GOAL.y + GOAL.height + 20, canvas.width, 18);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, GOAL.y + GOAL.height + 20);
  ctx.lineTo(canvas.width, GOAL.y + GOAL.height + 20);
  ctx.stroke();

  ctx.restore();
}

function drawPitch() {
  ctx.save();
  const pitchTop = GOAL.y - 10;
  const gradient = ctx.createLinearGradient(0, pitchTop, 0, canvas.height);
  gradient.addColorStop(0, "#1c8a3c");
  gradient.addColorStop(0.45, "#0b5c25");
  gradient.addColorStop(1, "#063b18");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, pitchTop, canvas.width, canvas.height - pitchTop);

  const stripeWidth = canvas.width / 12;
  ctx.globalAlpha = 0.32;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#0f5a27" : "#146e2f";
    ctx.fillRect(i * stripeWidth, pitchTop, stripeWidth, canvas.height - pitchTop);
  }
  ctx.globalAlpha = 1;

  const pitchShadow = ctx.createLinearGradient(0, pitchTop, 0, pitchTop + 140);
  pitchShadow.addColorStop(0, "rgba(0, 0, 0, 0.35)");
  pitchShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = pitchShadow;
  ctx.fillRect(0, pitchTop, canvas.width, 140);

  ctx.restore();
}

function drawGoal() {
  ctx.save();
  const postGradient = ctx.createLinearGradient(GOAL.x - GOAL.width / 2, GOAL.y, GOAL.x + GOAL.width / 2, GOAL.y);
  postGradient.addColorStop(0, "#f7fbff");
  postGradient.addColorStop(0.5, "#ffffff");
  postGradient.addColorStop(1, "#f7fbff");
  ctx.strokeStyle = postGradient;
  ctx.lineWidth = 6;
  const goalLeft = GOAL.x - GOAL.width / 2;
  const goalRight = GOAL.x + GOAL.width / 2;
  const goalTop = GOAL.y;
  const goalBottom = GOAL.y + GOAL.height;

  // Posts & crossbar
  ctx.beginPath();
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(goalLeft, goalTop);
  ctx.lineTo(goalRight, goalTop);
  ctx.lineTo(goalRight, goalBottom);
  ctx.stroke();

  // Netting
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(200, 220, 255, 0.28)";
  for (let i = 0; i <= 10; i++) {
    const x = goalLeft + (GOAL.width / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, goalTop);
    ctx.lineTo(x - 28, goalBottom + 32);
    ctx.stroke();
  }
  for (let j = 0; j <= 8; j++) {
    const y = goalTop + (GOAL.height / 8) * j;
    ctx.beginPath();
    ctx.moveTo(goalLeft, y);
    ctx.lineTo(goalLeft - 28, y + 32);
    ctx.lineTo(goalRight - 28, y + 32);
    ctx.stroke();
  }

  const netShade = ctx.createLinearGradient(goalLeft - 30, goalTop, goalLeft + 30, goalBottom + 40);
  netShade.addColorStop(0, "rgba(8, 14, 30, 0.35)");
  netShade.addColorStop(1, "rgba(8, 14, 30, 0)");
  ctx.fillStyle = netShade;
  ctx.fillRect(goalLeft - 30, goalTop, GOAL.width + 60, GOAL.height + 40);

  ctx.restore();
}

function drawPenaltyMark() {
  ctx.save();
  ctx.strokeStyle = "#dff7ff";
  ctx.lineWidth = 2.2;

  const areaTop = canvas.height - 220;
  const areaBottom = canvas.height - 80;
  const areaLeft = GOAL.x - GOAL.width / 2 + 26;
  const areaRight = GOAL.x + GOAL.width / 2 - 26;

  ctx.strokeRect(areaLeft, areaTop, areaRight - areaLeft, areaBottom - areaTop);

  const sixYardWidth = GOAL.width - 140;
  const sixLeft = GOAL.x - sixYardWidth / 2;
  const sixTop = canvas.height - 170;
  ctx.strokeRect(sixLeft, sixTop, sixYardWidth, 54);

  ctx.beginPath();
  ctx.arc(PENALTY_SPOT.x, areaTop, 72, (Math.PI * 5) / 6, (Math.PI * 1) / 6, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(PENALTY_SPOT.x, PENALTY_SPOT.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#fefefe";
  ctx.shadowColor = "rgba(255, 255, 255, 0.55)";
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
}

function drawPlayers() {
  drawStriker();
  drawKeeper();
}

function drawStriker() {
  ctx.save();
  const shadowScale = clamp(1 - striker.progress * 0.35, 0.5, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(striker.x, striker.y + 46, 36 * shadowScale, 14 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(striker.x, striker.y);
  ctx.rotate(striker.lean * 0.6);

  const jerseyGradient = ctx.createLinearGradient(0, -74, 0, 24);
  jerseyGradient.addColorStop(0, striker.colorPrimary);
  jerseyGradient.addColorStop(1, striker.colorSecondary);
  ctx.fillStyle = jerseyGradient;
  ctx.beginPath();
  ctx.moveTo(-22, -60);
  ctx.lineTo(22, -60);
  ctx.quadraticCurveTo(30, -14, 18, 22);
  ctx.lineTo(-18, 22);
  ctx.quadraticCurveTo(-30, -14, -22, -60);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-18, -46);
  ctx.quadraticCurveTo(0, -58, 18, -46);
  ctx.stroke();

  const swingAngle = clamp(striker.swing / 52, -1.2, 1.2);

  // Left arm
  ctx.save();
  ctx.translate(-18, -34);
  ctx.rotate(-0.4 - swingAngle * 0.6);
  ctx.fillStyle = jerseyGradient;
  ctx.fillRect(-10, -8, 20, 42);
  ctx.fillStyle = "#f3d3b4";
  ctx.fillRect(-10, 34, 20, 12);
  ctx.restore();

  // Right arm
  ctx.save();
  ctx.translate(18, -34);
  ctx.rotate(0.4 - swingAngle * 0.6);
  ctx.fillStyle = jerseyGradient;
  ctx.fillRect(-10, -8, 20, 42);
  ctx.fillStyle = "#f3d3b4";
  ctx.fillRect(-10, 34, 20, 12);
  ctx.restore();

  // Head
  ctx.fillStyle = "#f2d4b5";
  ctx.beginPath();
  ctx.arc(0, -76, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f2438";
  ctx.fillRect(-22, -84, 44, 8);

  // Shorts
  ctx.fillStyle = "#161328";
  ctx.fillRect(-18, 18, 36, 28);

  const legSwing = clamp(striker.swing / 34, -1.4, 1.4);
  ctx.fillStyle = "#f0f2ff";

  ctx.save();
  ctx.translate(-10, 46);
  ctx.rotate(-0.3 + legSwing * 0.6);
  ctx.fillRect(-8, 0, 16, 48);
  ctx.fillStyle = "#111";
  ctx.fillRect(-10, 42, 20, 10);
  ctx.restore();

  ctx.fillStyle = "#f0f2ff";
  ctx.save();
  ctx.translate(12, 46);
  ctx.rotate(0.2 - legSwing * 0.5);
  ctx.fillRect(-8, 0, 16, 48);
  ctx.fillStyle = "#111";
  ctx.fillRect(-10, 42, 20, 10);
  ctx.restore();

  ctx.restore();
}

function drawKeeper() {
  ctx.save();
  const stretch = keeper.diveActive ? 1 + keeper.stretch * 0.6 : 1;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(keeper.x, keeper.y + 44, 42 * stretch, 16 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(keeper.x, keeper.y);
  const diveRotation = keeper.diveActive ? keeper.diveAngle * 0.55 : Math.sin(keeper.idlePhase * 0.6) * 0.15;
  ctx.rotate(diveRotation);

  const kitGradient = ctx.createLinearGradient(0, -70, 0, 30);
  kitGradient.addColorStop(0, keeper.colorPrimary);
  kitGradient.addColorStop(1, keeper.colorSecondary);

  ctx.fillStyle = kitGradient;
  ctx.beginPath();
  ctx.moveTo(-24, -58);
  ctx.lineTo(24, -58);
  ctx.quadraticCurveTo(36, -16, 22, 26);
  ctx.lineTo(-22, 26);
  ctx.quadraticCurveTo(-36, -16, -24, -58);
  ctx.closePath();
  ctx.fill();

  // Arms
  const reachAngle = keeper.diveActive ? 0.9 + keeper.stretch * 0.4 : 0.4;
  ctx.fillStyle = kitGradient;
  ctx.save();
  ctx.translate(-22, -32);
  ctx.rotate(-reachAngle);
  ctx.fillRect(-10, -6, 20, 52);
  ctx.fillStyle = "#e6f3ff";
  ctx.beginPath();
  ctx.arc(0, 52, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = kitGradient;
  ctx.save();
  ctx.translate(22, -32);
  ctx.rotate(reachAngle - 0.3);
  ctx.fillRect(-10, -6, 20, 52);
  ctx.fillStyle = "#e6f3ff";
  ctx.beginPath();
  ctx.arc(0, 52, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Head
  ctx.fillStyle = "#f2d4b5";
  ctx.beginPath();
  ctx.arc(0, -72, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111726";
  ctx.beginPath();
  ctx.arc(0, -78, 16, 0, Math.PI * 2);
  ctx.fill();

  // Shorts & legs
  ctx.fillStyle = "#071b2c";
  ctx.fillRect(-20, 20, 40, 28);
  ctx.fillStyle = "#0c2e4b";

  ctx.save();
  ctx.translate(-10, 44);
  ctx.rotate(-0.1 - keeper.stretch * 0.4);
  ctx.fillRect(-8, 0, 16, 46);
  ctx.fillStyle = "#061221";
  ctx.fillRect(-10, 40, 20, 10);
  ctx.restore();

  ctx.fillStyle = "#0c2e4b";
  ctx.save();
  ctx.translate(12, 44);
  ctx.rotate(0.12 + keeper.stretch * 0.4);
  ctx.fillRect(-8, 0, 16, 46);
  ctx.fillStyle = "#061221";
  ctx.fillRect(-10, 40, 20, 10);
  ctx.restore();

  ctx.restore();
}

function drawBall() {
  ctx.save();
  const renderY = ball.y - ball.z;

  for (const spark of ball.trail) {
    ctx.globalAlpha = Math.max(0, spark.life * 0.75);
    ctx.fillStyle = "#c3f3ff";
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 8 * spark.life, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  const shadowScale = clamp(1 - ball.z / 90, 0.3, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + 4, ball.radius * 1.7, ball.radius * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    ball.x - ball.radius * 0.4,
    renderY - ball.radius * 0.6,
    4,
    ball.x,
    renderY,
    ball.radius
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.6, "#f1f4ff");
  gradient.addColorStop(1, "#d4d7e2");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, renderY, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ball.x, renderY);
  ctx.rotate(ball.rotation);
  ctx.strokeStyle = "#0f1b2b";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos((Math.PI * 2 * i) / 6) * ball.radius * 0.88,
      Math.sin((Math.PI * 2 * i) / 6) * ball.radius * 0.88
    );
  }
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function describePower(powerValue) {
  if (powerValue > 100) return "You absolutely hammer it.";
  if (powerValue > 85) return "Plenty of venom on the strike.";
  if (powerValue < 65) return "You try to place it with finesse.";
  return "Clean contact with good pace.";
}

function describeExplosiveness(reachValue) {
  if (reachValue > 110) return "maximum spring";
  if (reachValue > 95) return "explosive intent";
  if (reachValue < 75) return "a composed hop";
  return "sharp reactions";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyAlpha(color, multiplier) {
  const match = color.match(/rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/);
  if (!match) return color;
  const [, r, g, b, a] = match;
  const alpha = Math.min(1, parseFloat(a) * multiplier);
  return `rgba(${parseFloat(r)}, ${parseFloat(g)}, ${parseFloat(b)}, ${alpha})`;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function createCrowd() {
  const seats = [];
  for (let y = 24; y < GOAL.y - 20; y += 20) {
    for (let x = 20; x < canvas.width; x += 34) {
      const brightness = 60 + Math.random() * 40;
      const offsetX = (Math.random() - 0.5) * 10;
      const offsetY = (Math.random() - 0.5) * 6;
      seats.push({
        x: x + offsetX,
        y: y + offsetY,
        w: 18,
        h: 10,
        color: `rgba(${brightness}, ${brightness + 28}, ${brightness + 50}, 0.38)`,
      });
    }
  }
  return seats;
}

function createFloodlights() {
  const margin = 120;
  return [
    { x: margin, y: 18, radius: 160, beamLength: 260, beamSpread: 80, color: "120, 180, 255" },
    { x: canvas.width - margin, y: 18, radius: 160, beamLength: 260, beamSpread: 80, color: "120, 180, 255" },
    { x: canvas.width / 2 - 220, y: 26, radius: 140, beamLength: 220, beamSpread: 70, color: "110, 190, 255" },
    { x: canvas.width / 2 + 220, y: 26, radius: 140, beamLength: 220, beamSpread: 70, color: "110, 190, 255" },
  ];
}
