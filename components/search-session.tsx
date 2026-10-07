import type { ReactNode } from "react";
import { ItemArt } from "@/components/item-art";
import { survivorStats, type Survivor } from "@/lib/game";

export type SearchTab = "explore" | "finds";
export function searchRoomLabel(state: string) {
  return ({ available: "Disponível", proposed: "Busca proposta", ongoing: "Em andamento", "deep-available": "Profunda disponível", "deep-ongoing": "Profunda em andamento", exhausted: "Esgotada", searched: "Vasculhada", narrative: "Exploração narrativa" } as Record<string, string>)[state] ?? state;
}
export function SearchTabs({ value, units, onChange }: { value: SearchTab; units: number; onChange: (tab: SearchTab) => void }) {
  return <nav className="search-session-tabs" aria-label="Exploração e achados">
    <button type="button" aria-pressed={value === "explore"} onClick={() => onChange("explore")}>Explorar</button>
    <button type="button" aria-pressed={value === "finds"} onClick={() => onChange("finds")}>Achados <span>{units}</span></button>
  </nav>;
}

export function SearchRooms({ rooms, selected, onChange }: { rooms: { id: string; name: string; state: string; units: number }[]; selected: string; onChange: (id: string) => void }) {
  return <aside className="search-session-rooms" aria-label="Áreas internas do local">
    <label className="search-session-room-picker">Cômodo
      <select aria-label="Cômodo" value={selected} onChange={event => onChange(event.target.value)}>{rooms.map(room => <option key={room.id} value={room.id}>{room.name} · {room.state}{room.units ? ` · ${room.units} achados` : ""}</option>)}</select>
    </label>
    <div className="search-session-room-list"><b>Cômodos</b>{rooms.map(room => <button type="button" key={room.id} aria-pressed={selected === room.id} onClick={() => onChange(room.id)}>
      <span>{room.name}</span><small>{room.state}{room.units > 0 && <> · {room.units} achados</>}</small>
    </button>)}</div>
  </aside>;
}

export function SearchCapacity({ person, preview }: { person: Survivor; preview?: Survivor }) {
  const current = survivorStats(person), next = preview ? survivorStats(preview) : current;
  return <span className="search-session-capacity"><b>{person.name}</b><span>Inventário {current.carried}{next.carried !== current.carried ? ` → ${next.carried}` : ""}/{current.capacity}</span>
    {current.cart && <span>Carrinho {current.cart.carried}{next.cart && next.cart.carried !== current.cart.carried ? ` → ${next.cart.carried}` : ""}/{current.cart.capacity}</span>}
  </span>;
}

export function SearchStockRow({ name, category, source, room, remaining, condition, battery, fuel, locked, children }: {
  name: string; category?: string; source: "apparent" | "search"; room: string; remaining: number; condition?: string; battery?: string; fuel?: boolean; locked?: boolean; children: ReactNode;
}) {
  return <article className={`search-session-stock${locked ? " is-locked" : ""}`} aria-label={`${name} · ${room}`}>
    <ItemArt name={name} category={category} size="large" />
    <div className="search-session-stock-info"><h3>{name}</h3><p><span>{source === "apparent" ? "À vista" : "Encontrado na busca"}</span> · {room}</p>
      <small>{remaining} {remaining === 1 ? "disponível" : "disponíveis"}{condition && condition !== "Íntegro" ? ` · ${condition}` : ""}{battery === "Descarregada" ? " · sem bateria" : ""}{fuel ? " · exige galão vazio" : ""}{locked ? " · acesso pendente" : ""}</small>
    </div>
    <div className="search-session-stock-controls">{children}</div>
  </article>;
}
