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

    // 1) Mode "attaque" en cours ?
    if (game.pendingAction && game.pendingAction.type === "attack") {
      const attacker = game.units.find(
        (u) => u.id === game.pendingAction.unitId
      );
      game.pendingAction = null;

      if (!attacker) return;

      const target = unitAtTile;
      if (!target || target.owner === attacker.owner) {
        // pas de cible valide
        hideUnitMenu();
        return;
      }

      const dx = Math.abs(attacker.x - tile.x);
      const dy = Math.abs(attacker.y - tile.y);
      if (dx + dy === 1 && attacker.moves > 0) {
        // résolution ultra-simple : la cible meurt
        game.units = game.units.filter((u) => u !== target);
        attacker.moves -= 1;
        updateUnitInfo(attacker);
      }

      hideUnitMenu();
      return;
    }

    // 2) Sélection / menu d'actions si unité du joueur courant
    if (unitAtTile && unitAtTile.owner === game.currentPlayer.id) {
      game.selectedUnit = unitAtTile;
      updateUnitInfo(unitAtTile);
      showUnitMenu(unitAtTile, e.clientX, e.clientY);
      return;
    }

    // 3) Clic ailleurs : fermer le menu
    hideUnitMenu();

    // 4) Mouvement classique
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