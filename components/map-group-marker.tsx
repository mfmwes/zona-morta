"use client";

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

  const markerX = x - 28;
  const markerY = y + 29;
  const names = members.map(member => member.name).join(", ");
  const label = `${main ? "Grupo principal" : "Subgrupo"} no hex ${hexId}: ${names}. Clique para selecionar este grupo.`;

  function select(event: React.MouseEvent<SVGGElement> | React.KeyboardEvent<SVGGElement>) {
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
      {active && <circle className="map-group-active-ring" cx={markerX} cy={markerY} r="17" />}
      <circle className="map-group-main-disc" cx={markerX} cy={markerY} r="13" />
      <Footprints x={markerX - 8} y={markerY - 8} width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
    </g>;
  }

  const visible = members.slice(0, 3);
  const spacing = 13;
  const startX = markerX - ((visible.length - 1) * spacing) / 2;
  const overflow = Math.max(0, members.length - visible.length);
  const overflowX = startX + (visible.length - 1) * spacing + (overflow ? 14 : 0);
  const left = startX - 12;
  const right = overflow ? overflowX + 9 : startX + (visible.length - 1) * spacing + 12;

  return <g
    role="button"
    tabIndex={0}
    className={`map-group-marker map-group-marker-stack ${active ? "is-active" : ""}`}
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
    {active && <rect className="map-group-active-ring" x={left - 3} y={markerY - 14} width={right - left + 6} height="28" rx="14" />}

    {visible.map((member, index) => {
      const cx = startX + index * spacing;
      const clipId = `group-${safeId(hexId)}-${safeId(member.id)}`;
      return <g key={member.id}>
        <circle className="map-group-avatar-shadow" cx={cx} cy={markerY} r="11" />
        {member.portrait ? <>
          <defs><clipPath id={clipId}><circle cx={cx} cy={markerY} r="9.5" /></clipPath></defs>
          <image
            href={member.portrait}
            x={cx - 10}
            y={markerY - 10}
            width="20"
            height="20"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </> : <>
          <circle className="map-group-avatar-fallback" cx={cx} cy={markerY} r="9.5" />
          <text className="map-group-avatar-initial" x={cx} y={markerY + 3.5} textAnchor="middle">
            {member.name.charAt(0).toUpperCase()}
          </text>
        </>}
        <circle className="map-group-avatar-border" cx={cx} cy={markerY} r="10" />
      </g>;
    })}

    {overflow > 0 && <>
      <circle className="map-group-overflow" cx={overflowX} cy={markerY} r="8.5" />
      <text className="map-group-overflow-text" x={overflowX} y={markerY + 3.2} textAnchor="middle">+{overflow}</text>
    </>}
  </g>;
}
