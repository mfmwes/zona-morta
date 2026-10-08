import { validCampaignSessions } from "./campaign-sessions";
import { validActivities } from "@/lib/activity-timeline-validation";
import { validPlayerActionState } from "@/lib/player-actions-types";
import { validPortraitFrame } from "@/lib/portrait-frame";
import { ammunitionTypes, type AmmunitionType, type GameState } from "@/lib/game";
import { validWorld } from "@/lib/world";
import { validExplorationPreferences } from "@/lib/hex-automation-validation";
import { validSceneBoardState } from "@/lib/scene-board";
import { validHexEventOrigin } from "@/lib/hex-event-links";

function validThreat(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const threat = value as Record<string, unknown>;
  const attack = threat.attack as Record<string, unknown> | null | undefined;
  const features = threat.features;
  return typeof threat.id === "string" && threat.id.length <= 120
    && typeof threat.name === "string" && threat.name.length <= 100
    && Number.isInteger(threat.tier) && Number(threat.tier) >= 1 && Number(threat.tier) <= 4
    && typeof threat.role === "string" && threat.role.length <= 60
    && (threat.image === undefined || (typeof threat.image === "string" && threat.image.length <= 12000))
    && typeof threat.description === "string" && threat.description.length <= 2000
    && typeof threat.motivations === "string" && threat.motivations.length <= 1200
    && Number.isInteger(threat.difficulty) && Number(threat.difficulty) >= 1 && Number(threat.difficulty) <= 99
    && (threat.majorThreshold === null || (Number.isInteger(threat.majorThreshold) && Number(threat.majorThreshold) >= 1 && Number(threat.majorThreshold) <= 999))
    && (threat.severeThreshold === null || (Number.isInteger(threat.severeThreshold) && Number(threat.severeThreshold) >= 1 && Number(threat.severeThreshold) <= 999))
    && (threat.maxHp === null || (Number.isInteger(threat.maxHp) && Number(threat.maxHp) >= 1 && Number(threat.maxHp) <= 99))
    && (threat.maxStress === null || (Number.isInteger(threat.maxStress) && Number(threat.maxStress) >= 0 && Number(threat.maxStress) <= 99))
    && (attack === null || Boolean(attack && typeof attack.name === "string" && attack.name.length <= 100
      && Number.isInteger(attack.bonus) && Number(attack.bonus) >= -20 && Number(attack.bonus) <= 20
      && typeof attack.range === "string" && attack.range.length <= 80
      && typeof attack.damage === "string" && attack.damage.length <= 80
      && typeof attack.damageType === "string" && attack.damageType.length <= 40))
    && Array.isArray(features) && features.length <= 20
    && features.every(feature => {
      if (!feature || typeof feature !== "object") return false;
      const row = feature as Record<string, unknown>;
      return typeof row.id === "string" && row.id.length <= 120
        && typeof row.name === "string" && row.name.length <= 100
        && ["Passiva", "Ação", "Reação", "Outro"].includes(String(row.kind))
        && typeof row.effect === "string" && row.effect.length <= 2000;
    })
    && Array.isArray(threat.tags) && threat.tags.length <= 12
    && threat.tags.every(tag => typeof tag === "string" && tag.length <= 40)
    && ["base", "custom"].includes(String(threat.source));
}

function validConflict(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const conflict = value as Record<string, unknown>;
  const spotlight = conflict.spotlight as Record<string, unknown> | null | undefined;
  const threats = conflict.threats;
  const history = conflict.spotlightHistory;
  const participant = (row: Record<string, unknown>) =>
    ["survivor", "threat"].includes(String(row.kind))
    && typeof row.id === "string" && row.id.length <= 120;
  return typeof conflict.id === "string" && conflict.id.length <= 120
    && typeof conflict.name === "string" && conflict.name.length <= 100
    && typeof conflict.active === "boolean"
    && Number.isInteger(conflict.sceneNumber) && Number(conflict.sceneNumber) >= 1 && Number(conflict.sceneNumber) <= 999999
    && Number.isInteger(conflict.startedDay) && Number(conflict.startedDay) >= 1 && Number(conflict.startedDay) <= 99999
    && typeof conflict.startedTime === "string" && conflict.startedTime.length <= 20
    && (conflict.endedDay === undefined || (Number.isInteger(conflict.endedDay) && Number(conflict.endedDay) >= 1 && Number(conflict.endedDay) <= 99999))
    && (conflict.endedTime === undefined || (typeof conflict.endedTime === "string" && conflict.endedTime.length <= 20))
    && Array.isArray(conflict.survivorIds) && conflict.survivorIds.length <= 30
    && conflict.survivorIds.every(id => typeof id === "string" && id.length <= 120)
    && Array.isArray(threats) && threats.length <= 80
    && threats.every(instance => {
      if (!instance || typeof instance !== "object") return false;
      const row = instance as Record<string, unknown>;
      return typeof row.id === "string" && row.id.length <= 120
        && typeof row.templateId === "string" && row.templateId.length <= 120
        && validHexEventOrigin(row.eventOrigin)
        && validThreat(row.templateSnapshot)
        && typeof row.name === "string" && row.name.length <= 100
        && Number.isInteger(row.hpMarked) && Number(row.hpMarked) >= 0 && Number(row.hpMarked) <= 99
        && Number.isInteger(row.stressMarked) && Number(row.stressMarked) >= 0 && Number(row.stressMarked) <= 99
        && Array.isArray(row.conditions) && row.conditions.length <= 20
        && row.conditions.every(condition => typeof condition === "string" && condition.length <= 100)
        && typeof row.notes === "string" && row.notes.length <= 2000
        && typeof row.defeated === "boolean";
    })
    && (spotlight === null || spotlight === undefined || participant(spotlight))
    && Array.isArray(history) && history.length <= 120
    && history.every(event => {
      if (!event || typeof event !== "object") return false;
      const row = event as Record<string, unknown>;
      return participant(row)
        && typeof row.eventId === "string" && row.eventId.length <= 120
        && typeof row.name === "string" && row.name.length <= 100
        && Number.isInteger(row.day) && Number(row.day) >= 1 && Number(row.day) <= 99999
        && typeof row.time === "string" && row.time.length <= 20;
    })
    && (conflict.spotlightRequests === undefined || (Array.isArray(conflict.spotlightRequests) && conflict.spotlightRequests.length <= 30
      && conflict.spotlightRequests.every(id => typeof id === "string" && id.length <= 120)))
    && (conflict.appliedAttackLogIds === undefined || (Array.isArray(conflict.appliedAttackLogIds) && conflict.appliedAttackLogIds.length <= 160
      && conflict.appliedAttackLogIds.every(id => typeof id === "string" && id.length <= 120)))
    && (conflict.damageRequests === undefined || (Array.isArray(conflict.damageRequests) && conflict.damageRequests.length <= 120
      && conflict.damageRequests.every(request => {
        if (!request || typeof request !== "object") return false;
        const row = request as Record<string, unknown>;
        const tier = row.tier as Record<string, unknown> | undefined;
        return typeof row.id === "string" && row.id.length <= 120
          && typeof row.targetSurvivorId === "string" && row.targetSurvivorId.length <= 120
          && typeof row.sourceThreatId === "string" && row.sourceThreatId.length <= 120
          && typeof row.sourceName === "string" && row.sourceName.length <= 100
          && typeof row.attackName === "string" && row.attackName.length <= 100
          && Number.isInteger(row.damage) && Number(row.damage) >= 0 && Number(row.damage) <= 5000
          && typeof row.damageType === "string" && row.damageType.length <= 40
          && Boolean(tier && ["none", "minor", "major", "severe"].includes(String(tier.key))
            && ["Sem dano", "Menor", "Maior", "Severo"].includes(String(tier.label))
            && Number.isInteger(tier.hpMarks) && Number(tier.hpMarks) >= 0 && Number(tier.hpMarks) <= 3)
          && Number.isInteger(row.createdDay) && Number(row.createdDay) >= 1 && Number(row.createdDay) <= 99999
          && typeof row.createdTime === "string" && row.createdTime.length <= 20
          && ["pending", "resolved"].includes(String(row.status))
          && (row.resolution === undefined || ["hp", "armor"].includes(String(row.resolution)))
          && (row.appliedHpMarks === undefined || (Number.isInteger(row.appliedHpMarks) && Number(row.appliedHpMarks) >= 0 && Number(row.appliedHpMarks) <= 3))
          && (row.armorMarked === undefined || (Number.isInteger(row.armorMarked) && Number(row.armorMarked) >= 0 && Number(row.armorMarked) <= 1))
          && (row.resolvedDay === undefined || (Number.isInteger(row.resolvedDay) && Number(row.resolvedDay) >= 1 && Number(row.resolvedDay) <= 99999))
          && (row.resolvedTime === undefined || (typeof row.resolvedTime === "string" && row.resolvedTime.length <= 20));
      })))
    && typeof conflict.notes === "string" && conflict.notes.length <= 4000;
}

function validPresentation(value: GameState["presentation"] | undefined) {
  return value === undefined || Boolean(value
    && typeof value.id === "string" && value.id.length <= 120
    && typeof value.image === "string" && value.image.length > 0 && value.image.length <= 100000
    && (value.title === undefined || (typeof value.title === "string" && value.title.length <= 120))
    && (value.caption === undefined || (typeof value.caption === "string" && value.caption.length <= 500))
    && typeof value.active === "boolean");
}

function validParallelTime(value: GameState["parallelTime"] | undefined, state: Partial<GameState>) {
  if (value === undefined) return true;
  if (!value || value.day !== state.day || !value.survivorMinutes || typeof value.survivorMinutes !== "object"
    || Array.isArray(value.survivorMinutes)) return false;
  const survivors = Array.isArray(state.survivors) ? state.survivors.filter(person => person && typeof person.id === "string") : [];
  const ids = new Set(survivors.map(person => person.id));
  const entries = Object.entries(value.survivorMinutes);
  return entries.length <= survivors.length
    && entries.every(([id, minute]) => ids.has(id) && Number.isInteger(minute)
      && Number(minute) >= 0 && Number(minute) <= Number(state.minutes));
}

export function validState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GameState>;
  const shelter = state.shelter as Partial<GameState["shelter"]> | undefined;
  return Number.isInteger(state.day) && state.day! > 0 && state.day! < 100000
    && Number.isInteger(state.minutes) && state.minutes! >= 0 && state.minutes! < 1440
    && validCampaignSessions(state.sessions)
    && validParallelTime(state.parallelTime, state)
    && validActivities(state.activities, state)
    && state.publicActivities === undefined
    && Number.isInteger(state.fear) && state.fear! >= 0 && state.fear! <= 12
    && Number.isInteger(state.noise) && state.noise! >= 0 && state.noise! <= 5
    && typeof state.partyHex === "string" && /^-?\d+,-?\d+$/.test(state.partyHex)
    && validWorld(state.hexes) && Boolean(state.hexes[state.partyHex!])
    && validExplorationPreferences(state.explorationPreferences)
    && Array.isArray(state.survivors) && state.survivors.length <= 30
    && (state.npcs === undefined || (Array.isArray(state.npcs) && state.npcs.length <= 300
      && state.npcs.every(npc => npc && typeof npc.id === "string" && typeof npc.name === "string"
        && validHexEventOrigin(npc.eventOrigin)
        && (npc.visibleToPlayers === undefined || typeof npc.visibleToPlayers === "boolean")
        && (npc.portraitFrame === undefined || validPortraitFrame(npc.portraitFrame))
        && (npc.portrait === undefined || (typeof npc.portrait === "string" && npc.portrait.length <= 12000))
        && typeof npc.hex === "string" && Array.isArray(npc.skills))))
    && (state.threats === undefined || (Array.isArray(state.threats) && state.threats.length <= 120
      && state.threats.every(validThreat)))
    && validConflict(state.conflict)
    && validSceneBoardState(state.sceneBoard)
    && validPlayerActionState(state.playerActions)
    && state.publicPlayerActions === undefined
    && state.publicShelterCommunity === undefined
    && state.publicConflict === undefined
    && validPresentation(state.presentation)
    && state.survivors.every(s => Number.isInteger(s.armorMarked) && s.armorMarked >= 0 && s.armorMarked <= 20
      && (s.hex === undefined || (typeof s.hex === "string" && Boolean(state.hexes?.[s.hex])))
      && (s.home === undefined || (typeof s.home === "string" && Boolean(state.hexes?.[s.home])))
      && (s.outfit === undefined || typeof s.outfit === "string")
      && (s.transport === undefined || typeof s.transport === "string")
      && (s.ammoSpentScene === undefined || (Number.isInteger(s.ammoSpentScene) && s.ammoSpentScene >= 1))
      && (s.ammoSpentType === undefined || typeof s.ammoSpentType === "string")
      && (s.ammoSpentTypes === undefined || (Array.isArray(s.ammoSpentTypes) && s.ammoSpentTypes.length <= ammunitionTypes.length
        && s.ammoSpentTypes.every(type => ammunitionTypes.includes(type as AmmunitionType)))))
    && Boolean(shelter && typeof shelter === "object")
    && (shelter?.ammoStocks === undefined || (typeof shelter.ammoStocks === "object" && shelter.ammoStocks !== null
      && Object.entries(shelter.ammoStocks).every(([key, value]) =>
        ammunitionTypes.includes(key as AmmunitionType)
        && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 99)))
    && (shelter?.hex === undefined || shelter.hex === null ||
      (typeof shelter.hex === "string" && state.hexes?.[shelter.hex]?.discovery === "explorado"))
    && (shelter?.projects === undefined || (Array.isArray(shelter.projects) && shelter.projects.length <= 80
      && shelter.projects.every(project => project && typeof project.id === "string" && typeof project.key === "string"
        && typeof project.name === "string" && typeof project.state === "string"
        && Number.isInteger(project.progress) && Number.isInteger(project.requiredProgress)
        && Array.isArray(project.requiredCapabilities) && Array.isArray(project.effects))))
    && (shelter?.posts === undefined || (Array.isArray(shelter.posts) && shelter.posts.length <= 20
      && shelter.posts.every(post => post && typeof post.key === "string" && (post.helperIds === undefined || Array.isArray(post.helperIds)))))
    && Array.isArray(state.log) && state.log.length <= 200;
}
