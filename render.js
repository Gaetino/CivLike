// -----------------------------------------------------------------------------
// Rendu & interaction
// -----------------------------------------------------------------------------
let canvas, ctx;
let game;

function initGame() {
  canvas = document.getElementById("game-canvas");
  ctx = canvas.getContext("2d");

  const seed = getSeedFromURL();
  game = new GameState(seed);

  setupUnitMenu();
  setupInput();
  updateUI();


  // Si tu veux voir la seed dans le debug :
  // debug({ seed });
}


function gameLoop() {
  render();
  requestAnimationFrame(gameLoop);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      drawTile(game.map[y][x]);
    }
  }

  if (game.hoverTile) {
    drawTileOutline(game.hoverTile, "rgba(255,255,0,0.6)");
  }

  for (const unit of game.units) drawUnit(unit);

  if (game.selectedUnit) {
    drawTileOutline(
      game.getTile(game.selectedUnit.x, game.selectedUnit.y),
      "rgba(0,255,255,0.8)"
    );
  }
}

function isoToScreen(x, y) {
  const screenX = (x - y) * (TILE_WIDTH / 2) + canvas.width / 2 + cameraX;
  const screenY = (x + y) * (TILE_HEIGHT / 2) + cameraY;
  return { x: screenX, y: screenY };
}

function screenToIso(screenX, screenY) {
  const cx = screenX - canvas.width / 2 - cameraX;
  const cy = screenY - cameraY;
  const isoX = Math.floor((cy / (TILE_HEIGHT / 2) + cx / (TILE_WIDTH / 2)) / 2);
  const isoY = Math.floor((cy / (TILE_HEIGHT / 2) - cx / (TILE_WIDTH / 2)) / 2);
  return { x: isoX, y: isoY };
}

function drawTile(tile) {
  const terrain = tile.terrain;
  const { x, y } = isoToScreen(tile.x, tile.y);

  if (!terrain) {
    ctx.fillStyle = "#555";
    drawDiamond(x, y, TILE_WIDTH, TILE_HEIGHT);
    return;
  }

  // Base
  const baseSx = SPRITE_OFFSET_X + terrain.sx * SPRITE_STEP_X;
  const baseSy = SPRITE_OFFSET_Y + terrain.sy * SPRITE_STEP_Y;

  ctx.drawImage(
    tileset,
    baseSx, baseSy, SPRITE_WIDTH, SPRITE_HEIGHT,
    x - SPRITE_WIDTH / 2,
    y - SPRITE_HEIGHT / 2,
    SPRITE_WIDTH,
    SPRITE_HEIGHT
  );

  // Overlay éventuel (forêt, collines, montagnes)
  if (terrain.overlay) {
    const ovSx = SPRITE_OFFSET_X + terrain.overlay.sx * SPRITE_STEP_X;
    const ovSy = SPRITE_OFFSET_Y + terrain.overlay.sy * SPRITE_STEP_Y;

    ctx.drawImage(
      tileset,
      ovSx, ovSy, SPRITE_WIDTH, SPRITE_HEIGHT,
      x - SPRITE_WIDTH / 2,
      y - SPRITE_HEIGHT / 2,
      SPRITE_WIDTH,
      SPRITE_HEIGHT
    );
  }
    // Ville (si présente)
  if (tile.cityOwner) {
    ctx.save();
    ctx.fillStyle = tile.cityOwner === 1 ? "#4ac0ff" : "#ff5555";
    ctx.strokeStyle = "#000";
    const w = 16;
    const h = 10;
    ctx.fillRect(
      x - w / 2,
      y - TILE_HEIGHT / 2 - h - 2,
      w,
      h
    );
    ctx.strokeRect(
      x - w / 2,
      y - TILE_HEIGHT / 2 - h - 2,
      w,
      h
    );
    ctx.restore();
  }
}


function drawDiamond(cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
  ctx.fill();
}

function drawTileOutline(tile, color) {
  const { x, y } = isoToScreen(tile.x, tile.y);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - TILE_HEIGHT / 2);
  ctx.lineTo(x + TILE_WIDTH / 2, y);
  ctx.lineTo(x, y + TILE_HEIGHT / 2);
  ctx.lineTo(x - TILE_WIDTH / 2, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawUnit(unit) {
  const tile = game.getTile(unit.x, unit.y);
  if (!tile) return;
  if (!unitsImage.complete) return; // unité pas encore chargée

  const { x, y } = isoToScreen(tile.x, tile.y);
  const { sx, sy, sw, sh } = getUnitSpriteSource(
    typeof unit.spriteIndex === "number" ? unit.spriteIndex : 0
  );

  // On veut que le bas du sprite colle au bas de la tuile 64x32.
  // Le centre de la tuile est à (x, y), le bas du losange est à y + TILE_HEIGHT/2.
  // On centre horizontalement sur la tuile.
  const dx = x - UNIT_WIDTH / 2;
  const dy = y + TILE_HEIGHT / 2 - UNIT_HEIGHT;

  ctx.drawImage(unitsImage, sx, sy, sw, sh, dx, dy, sw, sh);
}


function getUnitSpriteSource(spriteIndex) {
  const col = spriteIndex % UNIT_SPRITES_PER_ROW;
  const row = Math.floor(spriteIndex / UNIT_SPRITES_PER_ROW);

  const sx = UNIT_OFFSET_X + col * UNIT_STEP_X;
  const sy = UNIT_OFFSET_Y + row * UNIT_STEP_Y;

  return { sx, sy, sw: UNIT_WIDTH, sh: UNIT_HEIGHT };
}

let unitMenuEl = null;

function setupUnitMenu() {
  unitMenuEl = document.createElement("div");
  unitMenuEl.id = "unit-menu";
  Object.assign(unitMenuEl.style, {
    position: "absolute",
    display: "none",
    padding: "4px 6px",
    border: "1px solid #444",
    backgroundColor: "#222",
    color: "#fff",
    fontFamily: "sans-serif",
    fontSize: "12px",
    borderRadius: "4px",
    zIndex: "1000",
    minWidth: "140px",
  });
  document.body.appendChild(unitMenuEl);

  // clic global pour fermer le menu si on clique ailleurs
  document.addEventListener("click", (e) => {
    if (!unitMenuEl) return;
    if (
      e.target === unitMenuEl ||
      unitMenuEl.contains(e.target) ||
      (canvas && canvas.contains(e.target))
    ) {
      return;
    }
    hideUnitMenu();
  });
}

function getActionsForUnit(unit) {
  if (!unit) return [];
  if (unit.type === UNIT_TYPES.SETTLER) {
    return ["Construire ville"];
  }
  return ["Attaquer"];
}

function showUnitMenu(unit, clientX, clientY) {
  if (!unitMenuEl) return;

  unitMenuEl.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = `Unité #${unit.id}`;
  title.style.fontWeight = "bold";
  title.style.marginBottom = "4px";
  unitMenuEl.appendChild(title);

  const actions = getActionsForUnit(unit);
  actions.forEach((actionName) => {
    const btn = document.createElement("button");
    btn.textContent = actionName;
    Object.assign(btn.style, {
      display: "block",
      width: "100%",
      margin: "2px 0",
      cursor: "pointer",
      fontSize: "12px",
    });
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      handleUnitAction(unit, actionName);
      hideUnitMenu();
    });
    unitMenuEl.appendChild(btn);
  });

  unitMenuEl.style.left = clientX + 8 + "px";
  unitMenuEl.style.top = clientY + 8 + "px";
  unitMenuEl.style.display = "block";
}

function hideUnitMenu() {
  if (unitMenuEl) unitMenuEl.style.display = "none";
}

function handleUnitAction(unit, actionName) {
  if (actionName === "Construire ville") {
    buildCityAtUnitPosition(unit);
  } else if (actionName === "Attaquer") {
    // On se met en mode "attaque" : prochain clic choisira la cible
    game.pendingAction = { type: "attack", unitId: unit.id };
  }
}

function buildCityAtUnitPosition(unit) {
  const tile = game.getTile(unit.x, unit.y);
  if (!tile) return;

  // Marque la ville
  tile.cityOwner = unit.owner;

  // Le colon est consommé
  game.units = game.units.filter((u) => u !== unit);
  if (game.selectedUnit === unit) {
    game.selectedUnit = null;
  }

  updateUnitInfo(game.selectedUnit);
}