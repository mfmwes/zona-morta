"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Footprints } from "lucide-react";

type Member = { id: string; name: string; portrait?: string };

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function MapGroupMarker({
  hexId,
  x,
  y,
  members,
  main,
  active,
  onSelect,
}: {
  hexId: string;
  x: number;
  y: number;
  members: Member[];
  main: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  if (!members.length) return null;

  const markerX = x - 29;
  const markerY = y + 30;
  const names = members.map(member => member.name).join(", ");
  const label = `${main ? "Grupo principal" : members.length === 1 ? "Sobrevivente isolado" : "Subgrupo"} no hex ${hexId}: ${names}. Clique para selecionar este grupo.`;

  function select(event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>) {
    event.stopPropagation();
    onSelect();
  }

  if (main) {
    return <g
      role="button"
      tabIndex={0}
      className={`map-group-marker map-group-marker-main ${active ? "is-active" : ""}`}
      aria-label={label}
      onClick={select}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(event);
        }
      }}
    >
      <title>{label}</title>
      {active && <circle className="map-group-active-ring" cx={markerX} cy={markerY} r="18" />}
      <path className="map-group-main-pointer" d={`M ${markerX - 5} ${markerY + 10} L ${markerX} ${markerY + 17} L ${markerX + 5} ${markerY + 10} Z`} />
      <circle className="map-group-main-disc" cx={markerX} cy={markerY} r="14" />
      <circle className="map-group-main-inner" cx={markerX} cy={markerY} r="10.5" />
      <Footprints x={markerX - 8} y={markerY - 8} width={16} height={16} strokeWidth={2.5} aria-hidden="true" />
    </g>;
  }

  const visible = members.slice(0, 3);
  const single = visible.length === 1;
  const spacing = single ? 0 : 14;
  const startX = markerX - ((visible.length - 1) * spacing) / 2;
  const overflow = Math.max(0, members.length - visible.length);
  const overflowX = startX + (visible.length - 1) * spacing + (overflow ? 15 : 0);
  const left = startX - 13;
  const right = overflow ? overflowX + 10 : startX + (visible.length - 1) * spacing + 13;
  const width = right - left;

  return <g
    role="button"
    tabIndex={0}
    className={`map-group-marker map-group-marker-stack ${single ? "is-single" : "is-party"} ${active ? "is-active" : ""}`}
    aria-label={label}
    onClick={select}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(event);
      }
    }}
  >
    <title>{label}</title>
    {active && <rect className="map-group-active-ring" x={left - 4} y={markerY - 16} width={width + 8} height="32" rx="16" />}
    {!single && <rect className="map-group-stack-backdrop" x={left - 2} y={markerY - 13} width={width + 4} height="26" rx="13" />}
    {single && <path className="map-group-single-pointer" d={`M ${markerX - 4} ${markerY + 10} L ${markerX} ${markerY + 16} L ${markerX + 4} ${markerY + 10} Z`} />}

    {visible.map((member, index) => {
      const cx = startX + index * spacing;
      const clipId = `group-${safeId(hexId)}-${safeId(member.id)}`;
      const radius = single ? 11 : 10;
      return <g key={member.id}>
        <circle className="map-group-avatar-shadow" cx={cx} cy={markerY} r={radius + 1.5} />
        {member.portrait ? <>
          <defs><clipPath id={clipId}><circle cx={cx} cy={markerY} r={radius - .5} /></clipPath></defs>
          <image
            href={member.portrait}
            x={cx - radius}
            y={markerY - radius}
            width={radius * 2}
            height={radius * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </> : <>
          <circle className="map-group-avatar-fallback" cx={cx} cy={markerY} r={radius - .5} />
          <text className="map-group-avatar-initial" x={cx} y={markerY + 3.5} textAnchor="middle">
            {member.name.charAt(0).toUpperCase()}
          </text>
        </>}
        <circle className="map-group-avatar-border" cx={cx} cy={markerY} r={radius} />
      </g>;
    })}

    {overflow > 0 && <>
      <circle className="map-group-overflow" cx={overflowX} cy={markerY} r="9" />
      <text className="map-group-overflow-text" x={overflowX} y={markerY + 3.2} textAnchor="middle">+{overflow}</text>
    </>}
  </g>;
}
