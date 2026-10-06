import { applyPlayerChange, playerEditPayload, projectPlayerGame } from './collaboration';
import { applyPlayerAction } from './player-actions';
import { cancelConflictSpotlightRequest, requestConflictSpotlight, resolveSurvivorDamageRequest, resolveThreatAttack } from './conflict';
import { addLog, displayTime, survivorIsDown, survivorStats, type GameState } from './game';

export function playerTeamPeers(state: GameState) {
  return state.survivors.map(person => {
    const stats = survivorStats(person);
    return { id: person.id, name: person.name, portrait: person.portrait, archetype: person.archetype,
      specialty: person.specialty, hex: person.hex ?? state.partyHex, infection: person.infection,
      hp: Math.max(0, Math.min(stats.hp, person.hp)), hpMax: stats.hp, stress: person.stress, hope: person.hope };
  });
}

// Own the full simulation snapshot; only its public projection reaches the UI.
export class PlayerPreviewSession {
  private state: GameState;
  constructor(source: GameState, readonly actorId: string) {
    if (!source.survivors.some(person => person.id === actorId)) throw new Error('Escolha um sobrevivente para a prévia.');
    this.state = structuredClone(source);
  }
  get view() { return projectPlayerGame(this.state, this.actorId); }
  get peers() { return playerTeamPeers(this.state); }
  edit(mutate: (draft: GameState) => void) {
    const before = this.view, after = structuredClone(before);
    mutate(after);
    const payload = playerEditPayload(before, after);
    const next = payload && applyPlayerChange(this.state, this.actorId, payload.before, payload.after,
      payload.fearDelta, payload.logs, payload.noiseDelta, payload.shelterWorkActions);
    if (!next) throw new Error('Esta ação precisa ser registrada pelo mestre.');
    this.state = next;
  }
  action(payload: unknown) {
    const result = applyPlayerAction(this.state, this.actorId, payload);
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
  }
  spotlight(action: 'request' | 'cancel') {
    const scene = this.state.conflict;
    const person = this.state.survivors.find(row => row.id === this.actorId)!;
    if (!scene?.active || !scene.survivorIds.includes(this.actorId) || survivorIsDown(person)) throw new Error('Seu sobrevivente não pode pedir Spotlight nesta cena.');
    if (action === 'request') requestConflictSpotlight(scene, this.actorId);
    else cancelConflictSpotlightRequest(scene, this.actorId);
  }
  damage(requestId: string, resolution: 'hp' | 'armor') {
    const scene = this.state.conflict;
    const person = this.state.survivors.find(row => row.id === this.actorId)!;
    if (!scene?.active) throw new Error('Não há conflito ativo.');
    const result = resolveSurvivorDamageRequest(scene, requestId, person, survivorStats(person), resolution, this.state.day, displayTime(this.state.minutes));
    if (!result.ok) throw new Error('Este dano não pode ser resolvido com a opção escolhida.');
    addLog(this.state, 'dano', `${person.name} resolveu o dano de ${result.sourceName}: ${result.hpMarks} PV marcados.`, person.id);
    return result;
  }
  target(targetId: string, attackTotal: number, critical: boolean, damageTotal: number) {
    const target = this.state.conflict?.active ? this.state.conflict.threats.find(row => row.id === targetId && !row.defeated) : undefined;
    if (!target) throw new Error('O alvo não está disponível nesta cena.');
    return resolveThreatAttack(target, attackTotal, critical, damageTotal);
  }
}
