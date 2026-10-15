import { defaultState, initialSurvivor, content } from "@/lib/game";
import { createSceneBoardScene, createSceneBoardObject, createFixtureOnWall } from "@/lib/scene-board";
import { createConflictScene, resolveSurvivorDamageTier } from "@/lib/conflict";
import { requestTableRest } from "@/lib/table-rest";

export function previewFixture(options: { base?: boolean; conflict?: boolean; rest?: boolean; objects?: number } = {}) {
  const game = defaultState({ withShelter: options.base, startSectorId: "morro" });
  game.campaignId = "visual-sandbox";
  const archetype = content.archetypes[0];
  game.survivors = ["Nina", "Rafael de Albuquerque"].map((name, index) => ({ ...initialSurvivor({ name, origin: content.origins[0].name, past: "", archetype: archetype.name,
    specialty: archetype.specialties[0].name, freeExperience: "Resgates", techniques: [], attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: "Faca resistente", secondary: "", protection: "Roupa reforçada", personal: "Mochila urbana" }), id: `person-${index}` }));
  game.npcs = [{ id: "npc-elias", name: "Elias", role: "Vigia", description: "Conhece os caminhos do bairro.", notes: "Nota privada do mestre", publicNotes: "Ajuda na guarda.", hex: "0,0", status: "Bem", infection: "Saudável", disposition: "Aliado", skills: ["Vigilância"], active: true, visibleToPlayers: true }];
  const scene = createSceneBoardScene("Casa do reservatório"); scene.id = "sandbox-scene"; scene.visibleToPlayers = true;
  const room = createSceneBoardObject("zone", "Sala principal", "room"); room.id = "room"; room.x = 100; room.y = 100;
  const wall = createSceneBoardObject("wall", "Parede"); wall.id = "wall"; wall.x = 100; wall.y = 100;
  const door = createFixtureOnWall("door", wall, { x: 200, y: 100 }); door.id = "door";
  scene.objects = [room, wall, door];
  for (let i = 0; i < (options.objects ?? 3); i++) {
    const piece = createSceneBoardObject("furniture", `Mesa ${i + 1}`, "table");
    piece.id = `table-${i}`; piece.x = 140 + (i % 12) * 100; piece.y = 160 + Math.floor(i / 12) * 50; scene.objects.push(piece);
  }
  game.sceneBoard = { scenes: [scene], activeSceneId: scene.id };
  if (options.rest) requestTableRest(game, "short", game.survivors[0].id);
  if (options.conflict) {
    game.conflict = createConflictScene({ name: "Encontro no reservatório", sceneNumber: game.scene ?? 1, day: game.day, time: "08:00", survivorIds: game.survivors.map(s => s.id) });
    game.conflict.damageRequests = [{ id: "damage-1", sourceThreatId: "threat", targetSurvivorId: game.survivors[0].id, sourceName: "Invasor", attackName: "Golpe", damage: 5, damageType: "Físico", tier: resolveSurvivorDamageTier(8,14,5), status: "pending", createdDay: game.day, createdTime: "08:00" }];
  }
  return game;
}
