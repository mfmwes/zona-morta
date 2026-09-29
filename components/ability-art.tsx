import type { CSSProperties } from "react";
import { abilityArtFor } from "@/lib/ability-art";

type Props = { abilityId: string; size?: "tiny" | "small" | "large"; className?: string };

export function AbilityArt({ abilityId, size, className = "" }: Props) {
  const art = abilityArtFor(abilityId);
  if (!art) return null;
  const column = art.cell % 4;
  const row = Math.floor(art.cell / 4);
  const style: CSSProperties = {
    backgroundImage: `url(/ability-art/${art.sheet}.webp)`,
    backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
  };
  return <span className={`ability-art ${size ? `ability-art--${size}` : ""} ${className}`} aria-hidden="true">
    <span className="ability-art-visual" style={style} />
  </span>;
}
