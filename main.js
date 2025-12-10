// Mini 4X en HTML5 avec tiles isométriques façon Civilization II.

// -----------------------------------------------------------------------------
// Constantes de rendu
// -----------------------------------------------------------------------------
const TILE_WIDTH = 64;   // taille "monde" d'une tuile
const TILE_HEIGHT = 32;

// Paramètres du spritesheet : 1 px de marge, 1 px de vide entre les tuiles
const SPRITE_WIDTH = 64;
const SPRITE_HEIGHT = 32;
const SPRITE_STEP_X = 65;   // 64 + 2 * 1px vide (gauche/droite)
const SPRITE_STEP_Y = 33;   // 32 + 2 * 1px vide (haut/bas)
const SPRITE_OFFSET_X = 1;  // première tuile à (1,1)
const SPRITE_OFFSET_Y = 1;

let cameraX = 0;
let cameraY = -100;

// Taille de la carte en cases
const MAP_WIDTH = 32;
const MAP_HEIGHT = 32;

// -----------------------------------------------------------------------------
// Chargement du tileset
// -----------------------------------------------------------------------------
const tileset = new Image();
tileset.src = "assets/terrain.png";
tileset.onload = () => {
  initGame();
  requestAnimationFrame(gameLoop);
};

// -----------------------------------------------------------------------------
// Types de terrain
// Les indices sx/sy correspondent à la grille 66x34 du spritesheet.
// -----------------------------------------------------------------------------
const TERRAIN_TYPES = [
  { id: "ocean",     name: "Océan",      sx: 0, sy: 7,  movementCost: 2 },
  { id: "grass",     name: "Prairie",    sx: 2, sy: 0,  movementCost: 1 },
  { id: "plains",    name: "Plaine",     sx: 1, sy: 0,  movementCost: 1 },
  { id: "desert",    name: "Désert",     sx: 0, sy: 0,  movementCost: 1 },
  { id: "forest",    name: "Forêt",      sx: 3, sy: 3,  movementCost: 2 },
  { id: "hill",      name: "Collines",   sx: 0, sy: 4,  movementCost: 2 },
  { id: "mountain",  name: "Montagne",   sx: 0, sy: 5,  movementCost: 3 },
];

const terrainById = Object.fromEntries(TERRAIN_TYPES.map(t => [t.id, t]));

// -----------------------------------------------------------------------------
// Structures de données
// -----------------------------------------------------------------------------
class Tile {
  constructor(x, y, terrainId) {
    this.x = x;
    this.y = y;
    this.terrainId = terrainId;
    this.exploredBy = new Set([1]);
  }

  get terrain() {
    return terrainById[this.terrainId];
  }
}

class Unit {
  constructor(id, x, y, owner) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.moves = 2;
    this.maxMoves = 2;
  }

  canMoveTo(tile) {
    if (!tile) return false;
    const terrain = tile.terrain;
    if (!terrain) return false;
    if (terrain.id === "mountain") return false;
    return this.moves >= terrain.movementCost;
  }

  moveTo(tile) {
    if (!this.canMoveTo(tile)) return false;
    this.x = tile.x;
    this.y = tile.y;
    this.moves -= tile.terrain.movementCost;
    return true;
  }
}

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

class GameState {
  constructor() {
    this.turn = 1;
    this.currentPlayerIndex = 0;
    this.players = [new Player(1, "Empire bleu"), new Player(2, "Empire rouge")];
    this.map = this.generateMap();
    this.units = [];
    this.selectedUnit = null;
    this.hoverTile = null;

    this.addStartingUnits();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  generateMap() {
    const tiles = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const n = Math.sin(x * 0.35) + Math.cos(y * 0.41);
        let terrainId;
        if (n < -0.7) terrainId = "ocean";
        else if (n < -0.1) terrainId = "plains";
        else if (n < 0.4) terrainId = "grass";
        else if (n < 0.7) terrainId = "hill";
        else terrainId = "mountain";
        if (Math.random() < 0.05) terrainId = "desert";
        row.push(new Tile(x, y, terrainId));
      }
      tiles.push(row);
    }
    return tiles;
  }

  addStartingUnits() {
    const startPositions = [
      { x: 5, y: 5 },
      { x: MAP_WIDTH - 6, y: MAP_HEIGHT - 6 },
    ];
    startPositions.forEach((pos, i) => {
      const unit = new Unit(i + 1, pos.x, pos.y, this.players[i].id);
      this.units.push(unit);
    });
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
    return this.map[y][x];
  }

  getUnitAt(x, y) {
    return this.units.find(u => u.x === x && u.y === y);
  }

  endTurn() {
    for (const unit of this.units) {
      if (unit.owner === this.currentPlayer.id) {
        unit.moves = unit.maxMoves;
      }
    }
    this.selectedUnit = null;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) this.turn++;
    updateUI();
  }
}

// -----------------------------------------------------------------------------
// Rendu & interaction
// -----------------------------------------------------------------------------
let canvas, ctx;
let game;

function initGame() {
  canvas = document.getElementById("game-canvas");
  ctx = canvas.getContext("2d");
  game = new GameState();

  setupInput();
  updateUI();
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

  if (terrain) {
    const sx = SPRITE_OFFSET_X + terrain.sx * SPRITE_STEP_X;
    const sy = SPRITE_OFFSET_Y + terrain.sy * SPRITE_STEP_Y;

    ctx.drawImage(
      tileset,
      sx, sy, SPRITE_WIDTH, SPRITE_HEIGHT,
      x - SPRITE_WIDTH / 2, y - SPRITE_HEIGHT / 2,
      SPRITE_WIDTH, SPRITE_HEIGHT
    );
  } else {
    ctx.fillStyle = "#555";
    drawDiamond(x, y, TILE_WIDTH, TILE_HEIGHT);
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
  const { x, y } = isoToScreen(tile.x, tile.y);

  const radius = 10;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y - 8, radius, 0, Math.PI * 2);
  ctx.fillStyle = unit.owner === 1 ? "#4ac0ff" : "#ff5555";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000";
  ctx.stroke();
  ctx.restore();
}

// -----------------------------------------------------------------------------
// Entrées
// -----------------------------------------------------------------------------
function setupInput() {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const iso = screenToIso(sx, sy);
    const tile = game.getTile(iso.x, iso.y);
    game.hoverTile = tile;
    updateTileInfo(tile);
  });

  canvas.addEventListener("mouseleave", () => {
    game.hoverTile = null;
    updateTileInfo(null);
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const iso = screenToIso(sx, sy);
    const tile = game.getTile(iso.x, iso.y);
    if (!tile) return;

    const unitAtTile = game.getUnitAt(tile.x, tile.y);

    if (unitAtTile && unitAtTile.owner === game.currentPlayer.id) {
      game.selectedUnit = unitAtTile;
      updateUnitInfo(unitAtTile);
      return;
    }

    if (game.selectedUnit) {
      const dx = Math.abs(game.selectedUnit.x - tile.x);
      const dy = Math.abs(game.selectedUnit.y - tile.y);
      if (dx + dy === 1 && game.selectedUnit.moveTo(tile)) {
        updateUnitInfo(game.selectedUnit);
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    const step = 32;
    switch (e.key) {
      case "ArrowUp":
      case "z":
      case "Z":
        cameraY += step;
        break;
      case "ArrowDown":
      case "s":
      case "S":
        cameraY -= step;
        break;
      case "ArrowLeft":
      case "q":
      case "Q":
        cameraX += step;
        break;
      case "ArrowRight":
      case "d":
      case "D":
        cameraX -= step;
        break;
    }
  });

  document.getElementById("end-turn-btn").addEventListener("click", () => {
    game.endTurn();
  });
}

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------
function updateTileInfo(tile) {
  const el = document.getElementById("tile-info");
  if (!tile) {
    el.textContent = "Survolez une case...";
    return;
  }
  const terrain = tile.terrain;
  el.textContent =
    `(${tile.x}, ${tile.y}) - ` +
    (terrain ? `${terrain.name} (coût ${terrain.movementCost})` : "Inconnu");
}

function updateUnitInfo(unit) {
  const el = document.getElementById("unit-info");
  if (!unit) {
    el.textContent = "Aucune unité.";
    return;
  }
  el.textContent =
    `Unité #${unit.id} du joueur ${unit.owner}\n` +
    `Position : (${unit.x}, ${unit.y})\n` +
    `Points de mouvement : ${unit.moves}/${unit.maxMoves}`;
}

function updateUI() {
  document.getElementById("turn-indicator").textContent = `Tour : ${game.turn}`;
  document.getElementById("player-indicator").textContent =
    `Joueur : ${game.currentPlayer.id} (${game.currentPlayer.name})`;
  updateUnitInfo(game.selectedUnit);
}

function debug(obj) {
  const el = document.getElementById("debug-output");
  el.textContent = JSON.stringify(obj, null, 2);
}
