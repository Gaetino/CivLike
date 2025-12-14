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
    `Type : ${unit.type}\n` +
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
