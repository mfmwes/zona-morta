import type { CSSProperties } from "react";
import { itemArtFor } from "@/lib/item-art";

type Props = { name: string; category?: string; size?: "small" | "large"; className?: string };

export function ItemArt({ name, category, size, className = "" }: Props) {
  const { sheet, cell } = itemArtFor(name, category);
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  const style: CSSProperties = {
    backgroundImage: `url(/item-art/${sheet}.${sheet.startsWith("custom-") ? "svg" : "webp"})`,
    backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
  };
  return <span className={`item-art ${size ? `item-art--${size}` : ""} ${className}`} data-sheet={sheet} aria-hidden="true">
    <span className="item-art-visual" style={style} />
  </span>;
}

export function EmptyItemArt({ size = "small" }: { size?: "small" | "large" }) {
  return <span className={`item-art item-art--${size} item-art--empty`} aria-hidden="true" />;
}
