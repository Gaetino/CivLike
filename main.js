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
// Seed & bruit de Perlin 2D
// -----------------------------------------------------------------------------

const DEFAULT_SEED = 123456789;

// Seed depuis l'URL : ?seed=1234 ou ?seed=ma_carte
function getSeedFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("seed");
    if (!s) return DEFAULT_SEED;

    const n = Number(s);
    if (Number.isFinite(n)) return n | 0;

    // Hash très simple de chaîne → entier 32 bits
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash * 31 + s.charCodeAt(i)) | 0;
    }
    return hash;
  } catch (e) {
    return DEFAULT_SEED;
  }
}

// Petit PRNG déterministe (mulberry32)
function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bruit de Perlin 2D
function createPerlin2D(seed) {
  const rng = createRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Shuffle de la permutation
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const gradients = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const g = gradients[hash & 7];
    return g[0] * x + g[1] * y;
  }

  return function (x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[xi + perm[yi]];
    const ab = perm[xi + perm[yi + 1]];
    const ba = perm[xi + 1 + perm[yi]];
    const bb = perm[xi + 1 + perm[yi + 1]];

    const x1 = lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

    // On ramène dans [0,1] et on clamp un peu
    let value = (lerp(x1, x2, v) * 0.5) + 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    return value;
  };
}


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
// -----------------------------------------------------------------------------
// Types de terrain
// Les indices sx/sy correspondent à la grille du spritesheet.
// Première colonne (x = 0) de haut en bas :
// désert, prairie, grassland, forest (base), hills (base), mountains (base),
// tundra, arctic, swamp, jungle, ocean.
// Pour forêt, collines et montagnes : overlay en deuxième couche.
// -----------------------------------------------------------------------------
const TERRAIN_TYPES = [
  { id: "desert",    name: "Désert",      sx: 0, sy: 0, movementCost: 1 },
  { id: "prairie",   name: "Prairie",     sx: 0, sy: 1, movementCost: 1 },
  { id: "grassland", name: "Grassland",   sx: 0, sy: 2, movementCost: 1 },

  // Bases + overlays
  { id: "forest",    name: "Forêt",       sx: 0, sy: 3, movementCost: 2,
    overlay: { sx: 12, sy: 4 } }, // overlay forêt
  { id: "hill",      name: "Collines",    sx: 0, sy: 4, movementCost: 2,
    overlay: { sx: 12, sy: 8 } }, // overlay collines
  { id: "mountain",  name: "Montagnes",   sx: 0, sy: 5, movementCost: 3,
    overlay: { sx: 12, sy: 6 } }, // overlay montagnes

  { id: "tundra",    name: "Toundra",     sx: 0, sy: 6, movementCost: 2 },
  { id: "arctic",    name: "Arctique",    sx: 0, sy: 7, movementCost: 3 },
  { id: "swamp",     name: "Marais",      sx: 0, sy: 8, movementCost: 3 },
  { id: "jungle",    name: "Jungle",      sx: 0, sy: 9, movementCost: 3 },

  { id: "ocean",     name: "Océan",       sx: 0, sy: 10, movementCost: 2, isWater: true },
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

	  if (terrain.id === "mountain" || terrain.id === "ocean") {
		return false;
	  }
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
  constructor(seed = DEFAULT_SEED) {
    this.seed = seed | 0;

    // Un bruit 2D pour l'altitude
    this.elevationNoise = createPerlin2D(this.seed);
    // On réutilise le même bruit avec un offset pour l'humidité
    this.moistureNoise = (x, y) => this.elevationNoise(x + 100, y + 100);

    this.turn = 1;
    this.currentPlayerIndex = 0;
    this.players = [
      new Player(1, "Empire bleu"),
      new Player(2, "Empire rouge"),
    ];

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
  const elevationGrid = [];
  const moistureGrid = [];

  const elevationNoise = this.elevationNoise;
  const moistureNoise = this.moistureNoise;

  // Bruit fractal simple (2 octaves) pour des détails plus fins
  function fractalNoise(noiseFn, x, y, baseScale) {
    let value = 0;
    let amp = 1;
    let totalAmp = 0;
    let scale = baseScale;

    for (let o = 0; o < 15; o++) {
      value += noiseFn(x * scale, y * scale) * amp;
      totalAmp += amp;
      amp *= 0.5;
      scale *= 2;
    }

    return value / totalAmp; // ~0..1
  }

  // Plus la valeur est petite, plus les détails sont fins
  const elevationScale = 0.095;
  const moistureScale  = 0.04;

  // Sprinkles
  const hillNoiseScale   = 0.18;
  const swampNoiseScale  = 0.22;

  // Niveau de la mer : augmente pour avoir encore plus d'eau
  const seaLevel = 0.46;  // <--- plus haut = plus d'océan
  const coastMax = 0.54;  // bande côtière : seaLevel..coastMax

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row = [];
    const elevRow = [];
    const moistRow = [];

    // 0 = équateur (milieu de la map), 1 = pôles (haut et bas)
    const lat = Math.abs(y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2);
    // 1 en haut, 0 en bas
    const north = 1 - y / (MAP_HEIGHT - 1);

    for (let x = 0; x < MAP_WIDTH; x++) {
      const baseElev = fractalNoise(elevationNoise, x, y, elevationScale); // 0..1
      const moisture = fractalNoise(moistureNoise, x, y, moistureScale);   // 0..1

      // On favorise légèrement le relief vers le Nord
      let e = baseElev + north * 0.05; // +5% au Nord
      if (e > 1) e = 1;

      elevRow.push(e);
      moistRow.push(moisture);

      let terrainId;

      // -------------------------------------------------------------------
      // 1) Océans & côtes
      // -------------------------------------------------------------------
      if (e < seaLevel) {
        terrainId = "ocean";
      } else if (e < coastMax) {
        // bande côtière
        if (moisture > 0.72) {
          terrainId = "swamp";
        } else if (moisture < 0.25) {
          terrainId = "desert";
        } else {
          terrainId = "prairie";
        }
      }
      // -------------------------------------------------------------------
      // 2) Terres basses (plaines, forêts, jungle, désert)
      // -------------------------------------------------------------------
      else if (e < 0.62) {
        if (moisture < 0.20) {
          terrainId = "desert";
        } else if (moisture < 0.40) {
          terrainId = "prairie";
        } else {
          // Tropiques vs tempéré
          if (lat < 0.3) {
            // Tropiques
            if (moisture > 0.75) {
              terrainId = "jungle";
            } else {
              terrainId = "grassland";
            }
          } else {
            // Tempéré
            if (moisture > 0.50) {
              terrainId = "forest";   // <-- forêts bien présentes
            } else {
              terrainId = "grassland";
            }
          }
        }
      }
      // -------------------------------------------------------------------
      // 3) Hautes terres (collines, toundra)
      // -------------------------------------------------------------------
      else if (e < 0.64) {
        if (lat > 0.65 && moisture < 0.60) {
          terrainId = "tundra";
        } else {
          terrainId = "hill";  // hauteurs tempérées → collines
        }
      }
      // -------------------------------------------------------------------
      // 4) Très hautes altitudes (montagnes, arctique)
      // -------------------------------------------------------------------
      else {
        // On veut clairement des montagnes en haut de la height map
        if (north > 0.6 && moisture < 0.65) {
          // Nord froid et sec
          if (north > 0.8 && moisture < 0.55) {
            terrainId = "arctic";
          } else {
            terrainId = "mountain";   // <-- massifs visibles au Nord
          }
        } else {
          // ailleurs, encore des montagnes, mais un peu moins
          if (lat > 0.7 && moisture < 0.6) {
            terrainId = "arctic";
          } else {
            terrainId = "mountain";
          }
        }
      }

      // -------------------------------------------------------------------
      // 5) Collines sporadiques (petits îlots)
      // -------------------------------------------------------------------
      if (
        terrainId !== "ocean" &&
        terrainId !== "mountain" &&
        terrainId !== "arctic"
      ) {
        const hfHill = elevationNoise(
          x * hillNoiseScale + 200,
          y * hillNoiseScale + 200
        );
        if (
          hfHill > 0.84 &&        // assez rare
          e > seaLevel + 0.03 &&  // pas au ras de l'eau
          e < 0.85 &&             // pas dans les plus hautes zones déjà montagneuses
          terrainId !== "swamp" &&
          terrainId !== "desert" &&
          terrainId !== "tundra"
        ) {
          terrainId = "hill";
        }
      }

      // -------------------------------------------------------------------
      // 6) Marais sporadiques proches des côtes
      // -------------------------------------------------------------------
      if (
        terrainId !== "ocean" &&
        terrainId !== "mountain" &&
        terrainId !== "arctic"
      ) {
        if (moisture > 0.7) {
          let hasOceanNeighbor = false;
          const neigh = [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ];
          for (const [nx, ny] of neigh) {
            if (
              nx >= 0 &&
              ny >= 0 &&
              nx < MAP_WIDTH &&
              ny < MAP_HEIGHT &&
              tiles[ny] &&
              tiles[ny][nx] &&
              tiles[ny][nx].terrainId === "ocean"
            ) {
              hasOceanNeighbor = true;
              break;
            }
          }

          if (hasOceanNeighbor) {
            const hfSwamp = moistureNoise(
              x * swampNoiseScale + 300,
              y * swampNoiseScale + 300
            );
            if (hfSwamp > 0.80) {
              terrainId = "swamp";
            }
          }
        }
      }

      row.push(new Tile(x, y, terrainId));
    }

    tiles.push(row);
    elevationGrid.push(elevRow);
    moistureGrid.push(moistRow);
  }

  // Ici : plus AUCUNE limitation de la taille des massifs de montagnes
  // (si tu as encore une ancienne fonction limitMountainRegions() plus bas, supprime-la)

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

  const seed = getSeedFromURL();
  game = new GameState(seed);

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
