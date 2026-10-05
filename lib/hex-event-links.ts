/** Validação limitada ao formato: vínculos removidos continuam como histórico do mestre. */
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function id(value: unknown) { return typeof value === "string" && value.trim().length > 0 && value.length <= 120; }

export function validHexEventOrigin(value: unknown): boolean {
  if (value === undefined) return true;
  return record(value) && id(value.hexId) && /^-?\d+,-?\d+$/.test(String(value.hexId)) && id(value.eventId)
    && ["point", "npc", "threat", "clue"].includes(String(value.action))
    && Object.keys(value).every(key => ["hexId", "eventId", "action"].includes(key));
}

export function validEventActionLinks(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value) || !Object.keys(value).every(key => ["pointId", "npcId", "cluePointId", "threat"].includes(key))) return false;
  if (["pointId", "npcId", "cluePointId"].some(key => value[key] !== undefined && !id(value[key]))) return false;
  const threat = value.threat;
  return threat === undefined || (record(threat) && id(threat.conflictId) && Array.isArray(threat.threatIds)
    && threat.threatIds.length > 0 && threat.threatIds.length <= 20 && threat.threatIds.every(id)
    && new Set(threat.threatIds).size === threat.threatIds.length
    && Object.keys(threat).every(key => ["conflictId", "threatIds"].includes(key)));
}
