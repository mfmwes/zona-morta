import { memo } from "react";

/** The sixteen cells share one cached image; SVG crops avoid sixteen downloads. */
export const MapHexArt = memo(function MapHexArt({ index, x, y }: { index: number | null; x: number; y: number }) {
  if (index === null) return <g className="map-unknown-art" aria-hidden="true">
    <path d={`M${x-32},${y+6}l16,-9 18,10 20,-12 12,7 M${x-23},${y-5}v-16l13,-7 13,7v15 M${x+10},${y-9}v-17l13,-7 12,7v18`} fill="none" stroke="currentColor" strokeWidth="1" />
  </g>;
  return <svg x={x-45} y={y-47} width="90" height="90" viewBox={`${(index%4)*512} ${Math.floor(index/4)*512} 512 512`} overflow="hidden" aria-hidden="true" className="map-hex-art">
    <image href="/map/sector-atlas.png" width="2048" height="2048" />
  </svg>;
});
