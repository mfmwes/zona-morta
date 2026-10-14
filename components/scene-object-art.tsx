"use client";

import { useId } from "react";
import type { SceneObjectArt as Artwork } from "@/lib/scene-object-art";

export function SceneObjectArt({ art, compact = false }: { art: Artwork; compact?: boolean }) {
  const clipId = `scene-art-${useId().replaceAll(":", "")}`;
  const [x, y, width, height] = art.region;
  const rotated = art.rotate === 90;
  const transform = rotated ? `translate(${height} 0) rotate(90) translate(${-x} ${-y})` : `translate(${-x} ${-y})`;

  return <span className={`scene-object-visual scene-object-art${compact ? " is-compact" : ""}`} aria-hidden="true">
    <svg viewBox={`0 0 ${rotated ? height : width} ${rotated ? width : height}`} preserveAspectRatio="xMidYMid meet" focusable="false">
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
      <g transform={transform}><image href={art.src} width={art.width} height={art.height} clipPath={`url(#${clipId})`} /></g>
    </svg>
  </span>;
}
