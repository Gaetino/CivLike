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
// Sprites d'unités
// -----------------------------------------------------------------------------
// Chaque sprite fait 64x48, avec 1 px de marge et 65x49 de pas dans la feuille
const UNIT_WIDTH = 64;
const UNIT_HEIGHT = 48;
const UNIT_STEP_X = 65;
const UNIT_STEP_Y = 49;
const UNIT_OFFSET_X = 1;
const UNIT_OFFSET_Y = 1;
// nombre de sprites par ligne dans units.png (à adapter si besoin)
const UNIT_SPRITES_PER_ROW = 8;

const UNIT_TYPES = {
  SETTLER: "settler",  // colon
  WARRIOR: "warrior",  // unité militaire de base
};

const unitsImage = new Image();
unitsImage.src = "assets/units.png";



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
    this.cityOwner = null; // id du joueur si une ville est construit ici
  }

  get terrain() {
    return terrainById[this.terrainId];
  }
}


class Unit {
  constructor(id, x, y, owner, type = UNIT_TYPES.WARRIOR, spriteIndex = 1) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.type = type;
    this.spriteIndex = spriteIndex; // index dans la spritesheet units.png

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
	
	    // action en attente (ex: attaque)
    this.pendingAction = null;


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
      const playerId = this.players[i].id;

      // Le premier joueur commence avec un colon (SETTLER), sprite 0
      // le second avec une unité "militaire" générique, sprite 1
      const isFirst = i === 0;
      const type = isFirst ? UNIT_TYPES.SETTLER : UNIT_TYPES.WARRIOR;
      const spriteIndex = isFirst ? 0 : 1;

      const unit = new Unit(
        i + 1,
        pos.x,
        pos.y,
        playerId,
        type,
        spriteIndex
      );
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
