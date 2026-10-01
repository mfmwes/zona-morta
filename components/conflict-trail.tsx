"use client";

import { useEffect, useMemo, useRef } from "react";
import { Crosshair, Skull, Target, UserRound } from "lucide-react";
import type { ConflictParticipantRef, PublicConflictThreat, PublicConflictSurvivor } from "@/lib/conflict";

type Props = {
  survivors: Array<PublicConflictSurvivor & { requested?: boolean }>;
  threats: PublicConflictThreat[];
  spotlight: ConflictParticipantRef | null;
  selfId?: string | null;
  targetId?: string | null;
  mode?: "player" | "master";
  onThreatTarget?: (id: string) => void;
  onParticipantSpotlight?: (ref: ConflictParticipantRef, name: string) => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts.at(-1)![0]).toUpperCase();
}

function threatShortLabel(threat: PublicConflictThreat) {
  const prefix = threat.groupName.trim();
  if (prefix && threat.name.startsWith(prefix)) {
    const suffix = threat.name.slice(prefix.length).trim();
    if (suffix) return suffix.slice(0, 3).toUpperCase();
  }
  return initials(threat.name);
}

export function ConflictTrail({
  survivors,
  threats,
  spotlight,
  selfId = null,
  targetId = null,
  mode = "player",
  onThreatTarget,
  onParticipantSpotlight,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const threatGroups = useMemo(() => {
    const map = new Map<string, PublicConflictThreat[]>();
    for (const threat of threats) map.set(threat.groupName, [...(map.get(threat.groupName) ?? []), threat]);
    return [...map.entries()];
  }, [threats]);

  function reveal(kind: "survivor" | "threat", id: string) {
    const node = rootRef.current?.querySelector<HTMLElement>(`[data-trail-key="${kind}:${id}"]`);
    node?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  useEffect(() => {
    if (spotlight) reveal(spotlight.kind, spotlight.id);
  }, [spotlight?.kind, spotlight?.id]);

  useEffect(() => {
    if (targetId) reveal("threat", targetId);
  }, [targetId]);

  return <div className="conflict-trail-shell">
    <div className="conflict-trail-scroll" ref={rootRef} aria-label="Trilha de Conflito">
      <div className="conflict-trail-group conflict-trail-survivors">
        <span className="conflict-trail-group-label">Sobreviventes</span>
        <div className="conflict-trail-nodes">
          {survivors.map(person => {
            const isSelf = person.id === selfId;
            const isSpotlight = spotlight?.kind === "survivor" && spotlight.id === person.id;
            const interactive = mode === "master" && Boolean(onParticipantSpotlight);
            const title = `${person.name}${isSelf ? " · você" : ""}${isSpotlight ? " · Spotlight" : ""}${person.requested ? " · quer o Spotlight" : ""}`;
            const body = <>
              <span className="conflict-trail-node-core">
                {person.portrait ? <img src={person.portrait} alt="" /> : <span className="conflict-trail-initials">{initials(person.name)}</span>}
                {isSpotlight && <span className="conflict-trail-spotlight-mark"><Crosshair size={11} /></span>}
                {person.requested && !isSpotlight && <span className="conflict-trail-request-dot" aria-hidden="true" />}
              </span>
              <span className="conflict-trail-node-label">{isSelf ? "VOCÊ" : person.name.split(/\s+/)[0]}</span>
            </>;
            return interactive
              ? <button type="button" key={person.id} data-trail-key={`survivor:${person.id}`} className={`conflict-trail-node is-survivor${isSelf ? " is-self" : ""}${isSpotlight ? " is-spotlight" : ""}${person.requested ? " has-request" : ""}`} onClick={() => onParticipantSpotlight?.({ kind: "survivor", id: person.id }, person.name)} title={title} aria-label={`Dar Spotlight a ${person.name}${person.requested ? ", que pediu o Spotlight" : ""}`}>{body}</button>
              : <span tabIndex={0} key={person.id} data-trail-key={`survivor:${person.id}`} className={`conflict-trail-node is-survivor${isSelf ? " is-self" : ""}${isSpotlight ? " is-spotlight" : ""}${person.requested ? " has-request" : ""}`} title={title} aria-label={title}>{body}</span>;
          })}
        </div>
      </div>

      {threatGroups.map(([groupName, groupThreats]) => <div className="conflict-trail-group" key={groupName}>
        <span className="conflict-trail-group-label">{groupName}<b>{groupThreats.length}</b></span>
        <div className="conflict-trail-nodes">
          {groupThreats.map(threat => {
            const isSpotlight = spotlight?.kind === "threat" && spotlight.id === threat.id;
            const isTarget = threat.id === targetId;
            const interactive = !threat.defeated && (mode === "master" ? Boolean(onParticipantSpotlight) : Boolean(onThreatTarget));
            const title = `${threat.name}${threat.defeated ? " · derrotada" : ""}${isSpotlight ? " · Spotlight" : ""}${isTarget ? " · seu alvo" : ""}${threat.conditions.length ? ` · ${threat.conditions.join(", ")}` : ""}`;
            return <button
              type="button"
              key={threat.id}
              data-trail-key={`threat:${threat.id}`}
              className={`conflict-trail-node is-threat${isSpotlight ? " is-spotlight" : ""}${isTarget ? " is-target" : ""}${threat.defeated ? " is-defeated" : ""}`}
              disabled={!interactive}
              onClick={() => {
                if (mode === "master") onParticipantSpotlight?.({ kind: "threat", id: threat.id }, threat.name);
                else onThreatTarget?.(threat.id);
              }}
              title={title}
              aria-label={mode === "master"
                ? `${threat.name}. ${threat.defeated ? "Derrotada." : "Clique para dar Spotlight."}`
                : `${threat.name}. ${threat.defeated ? "Derrotada e indisponível como alvo." : isTarget ? "Alvo selecionado." : "Clique para selecionar como alvo."}`}
            >
              <span className="conflict-trail-node-core">
                {threat.defeated ? <Skull size={17} /> : <span className="conflict-trail-initials">{threatShortLabel(threat)}</span>}
                {isSpotlight && <span className="conflict-trail-spotlight-mark"><Crosshair size={11} /></span>}
                {isTarget && <span className="conflict-trail-target-mark"><Target size={11} /></span>}
              </span>
              <span className="conflict-trail-node-label">{threatShortLabel(threat)}</span>
            </button>;
          })}
        </div>
      </div>)}
    </div>
  </div>;
}
