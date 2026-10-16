import { defaultState, initialSurvivor, content } from "@/lib/game";
import { createSceneBoardScene, createSceneBoardObject, createFixtureOnWall } from "@/lib/scene-board";
import { createConflictScene, resolveSurvivorDamageTier } from "@/lib/conflict";
import { requestTableRest } from "@/lib/table-rest";
import { assignCustomSector } from "@/lib/sectors";
import { prepareLocationForExploration } from "@/lib/hex-automation";
import { expandWorld, setWorldConnection } from "@/lib/world";

export function previewFixture(options: { base?: boolean; conflict?: boolean; rest?: boolean; roads?: boolean; objects?: number } = {}) {
  const game = defaultState({ withShelter: options.base, startSectorId: "morro" });
  game.campaignId = "visual-sandbox";
  for (const [id, name] of [['0,0','Bairro residencial'],['0,-1','Reservatórios'],['1,0','Praça central'],['-1,0','Oficinas'],['0,1','Mercado velho'],['1,-1','Estação ferroviária'],['-1,1','Margem do canal']]) {
    assignCustomSector(game,id,name); game.hexes[id].discovery='explorado'; game.hexes[id].points=[]; game.hexes[id].events=[];
  }
  game.hexes['0,0'].points=[
    {id:'market',name:'Mercado da praça',kind:'comércio',signal:'Uma porta lateral entreaberta.',access:'',notes:'Nota reservada',revealed:true,lootTable:content.lootTables[1].name,searches:[]},
    {id:'house',name:'Casa de esquina',kind:'local',signal:'Janelas cobertas.',access:'',notes:'',revealed:true,searches:[]},
    {id:'secret',name:'Depósito secreto',kind:'local',signal:'',access:'',notes:'',revealed:false,searches:[]},
  ];
  prepareLocationForExploration(game,'0,0','market');
  const previewPreparation=game.hexes['0,0'].points[0].preparation!;
  previewPreparation.stock=[];
  for(const area of previewPreparation.areas) area.visibleOutcome='none';
  game.hexes['0,0'].events=[{id:'rooftop',text:'Sinais no telhado: uma silhueta observa a rua.',trigger:'',revealed:true,status:'active'},{id:'hidden-event',text:'Emboscada secreta',trigger:'',revealed:false,status:'pending'}];
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
  if (options.roads) prepareRoadJourney(game);
  return game;
}

function prepareRoadJourney(game: ReturnType<typeof defaultState>) {
  for (const hex of Object.values(game.hexes)) hex.region = "Santa Aurora";
  assignCustomSector(game, "2,0", "Saída leste"); game.hexes["2,0"].discovery = "explorado";
  expandWorld(game, { origin: "2,0", mode: "direction", direction: 1, length: 8, terrain: "rural", passage: "road", connect: true });
  for (let q = 3; q <= 10; q++) {
    const id = `${q},0`;
    assignCustomSector(game, id, q === 3 ? "Posto da rodovia" : q === 6 ? "Ponte bloqueada" : q >= 9 ? "Entrada de Vale Seco" : "Trecho de rodovia");
    Object.assign(game.hexes[id], { discovery: "explorado", terrain: q >= 9 ? "urban" : q === 4 || q === 8 ? "forest" : "rural", region: q >= 9 ? "Vale Seco" : "Rodovia entre cidades" });
  }
  setWorldConnection(game.hexes, "0,0", "1,0", "road"); setWorldConnection(game.hexes, "1,0", "2,0", "road");
  setWorldConnection(game.hexes, "5,0", "6,0", "road", true);
  for (const [origin, name] of [["5,0", "Sítio abandonado"], ["6,0", "Desvio pela mata"]]) {
    const [q] = origin.split(",");
    expandWorld(game, { origin, mode: "neighbor", direction: 2, length: 1, terrain: q === "5" ? "rural" : "forest", passage: "trail" });
    assignCustomSector(game, `${q},1`, name); game.hexes[`${q},1`].discovery = "explorado";
  }
  setWorldConnection(game.hexes, "5,0", "5,1", "trail"); setWorldConnection(game.hexes, "5,1", "6,1", "trail"); setWorldConnection(game.hexes, "6,1", "7,0", "trail");
  const cityNames = ["Estação de Vale Seco", "Distrito industrial", "Bairro sul", "Praça de Vale Seco", "Acesso oeste", "Hospital de Vale Seco"];
  for (let direction = 0; direction < 6; direction++) {
    const added = expandWorld(game, { origin: "10,0", mode: "neighbor", direction, length: 1, terrain: "urban", passage: "road", connect: true, region: "Vale Seco" });
    for (const id of added) { assignCustomSector(game, id, cityNames[direction]); game.hexes[id].discovery = "avistado"; }
  }
  for (let q = 4; q <= 8; q++) {
    const added = expandWorld(game, { origin: `${q},0`, mode: "neighbor", direction: 5, length: 1, terrain: q % 2 ? "rural" : "forest", passage: "none" });
    for (const id of added) { assignCustomSector(game, id, q % 2 ? "Campos abertos" : "Mata à margem"); game.hexes[id].discovery = "avistado"; }
  }
  game.survivors.push(...["Bia", "Caio"].map((name, index) => ({ ...structuredClone(game.survivors[0]), id: `road-person-${index}`, name })));
}
