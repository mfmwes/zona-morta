import type { GameState } from "@/lib/game";
import { hexCenter, parseHex, visibleWorldConnections } from "@/lib/world";

/** Overlay after terrain artwork, before interaction: roads never capture hex clicks. */
export function MapRoads({ hexes, plannedPath, showRoads = true }: { hexes: GameState["hexes"]; plannedPath: string[]; showRoads?: boolean }) {
  const edges = showRoads ? visibleWorldConnections(hexes) : [];
  const path = plannedPath.map((id, index) => {
    const coordinate = parseHex(id)!; const { x, y } = hexCenter(coordinate);
    return `${index ? "L" : "M"}${x},${y}`;
  }).join(" ");
  return <g className="map-road-overlay" pointerEvents="none" aria-hidden="true">
    {edges.map(edge => {
      const a = hexCenter(parseHex(edge.from)!), b = hexCenter(parseHex(edge.to)!);
      const d = `M${a.x},${a.y}L${b.x},${b.y}`;
      return <g key={`${edge.from}:${edge.to}`} data-road-from={edge.from} data-road-to={edge.to} data-blocked={edge.blocked}>
        <path d={d} className="map-road-edge" />
        <path d={d} className={`map-road-surface map-road-${edge.kind}`} />
      </g>;
    })}
    {path && <path d={path} className="map-planned-route" />}
    {edges.filter(edge => edge.blocked).map(edge => {
      const a = hexCenter(parseHex(edge.from)!), b = hexCenter(parseHex(edge.to)!);
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      return <g key={`blocked:${edge.from}:${edge.to}`}><circle cx={x} cy={y} r="7" className="map-road-blocked" /><path d={`M${x - 2.5},${y - 2.5}l5,5m0,-5l-5,5`} stroke="#fff0e9" strokeWidth="1.5" /></g>;
    })}
  </g>;
}
