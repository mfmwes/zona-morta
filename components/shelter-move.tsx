"use client";

import { useState } from "react";
import { House, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Counter } from "@/components/game-controls";
import { abandonShelter, establishShelter, type GameState, type ShelterManifest, type ShelterState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
const keys: { key: keyof NonNullable<ShelterManifest["stocks"]>; label: string }[] = [
  { key: "food", label: "Comida · porções" }, { key: "water", label: "Água · porções" },
  { key: "medications", label: "Medicamentos" }, { key: "pistolAmmo", label: "Munição de pistola" },
  { key: "fuel", label: "Combustível" }, { key: "parts", label: "Peças" },
];

export function ShelterMoveDialog({ game, edit, mode, destination }: {
  game: GameState; edit: Edit; mode: "relocate" | "abandon"; destination?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stocks, setStocks] = useState<NonNullable<ShelterManifest["stocks"]>>({});
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [residents, setResidents] = useState(0);
  const old = game.shelter;
  const target = destination ? game.hexes[destination]?.sector?.name ?? `hex ${destination}` : "a estrada";
  const itemLoad = (old.inventory ?? []).filter(item => itemIds.includes(item.id)).reduce((sum, item) => sum + item.load * item.qty, 0);
  const estimatedLoad = itemLoad + Math.ceil((stocks.food ?? 0) / 4) + Math.ceil((stocks.water ?? 0) / 4)
    + (stocks.medications ?? 0) + (stocks.pistolAmmo ?? 0) + (stocks.fuel ?? 0) + (stocks.parts ?? 0);
  function onOpen(value: boolean) {
    setOpen(value);
    if (value) { setStocks({}); setItemIds([]); setResidents(0); }
  }
  function confirm() {
    let succeeded = false;
    const manifest: ShelterManifest = { stocks, itemIds, residents };
    edit(draft => { succeeded = mode === "abandon" ? abandonShelter(draft, manifest) : establishShelter(draft, destination!, manifest); });
    if (!succeeded) { toast.error("Confira a posição, as reservas e a seleção antes de confirmar."); return; }
    toast.success(mode === "abandon" ? "Base deixada; o depósito antigo continua no mapa." : "Abrigo estabelecido; o que ficou atrás continua registrado.");
    setOpen(false);
  }
  return <Dialog open={open} onOpenChange={onOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" className={mode === "abandon" ? "mt-5" : "mt-3"}>
      {mode === "abandon" ? "Deixar o abrigo" : <><House size={16} /> Mudar abrigo para cá</>}
    </Button></DialogTrigger>
    <DialogContent className="shelter-move-dialog"><DialogHeader>
      <DialogTitle>{mode === "abandon" ? "Deixar a base atual" : `Montar abrigo em ${target}`}</DialogTitle>
      <DialogDescription>Escolha o que já foi transportado para {target}. Os itens, moradores e mantimentos não selecionados ficam registrados na antiga base em {old.hex}. As melhorias permanecem no prédio antigo.</DialogDescription>
    </DialogHeader>
      <div className="shelter-move-section"><b>Reservas transportadas</b><div className="shelter-move-grid">
        {keys.map(({ key, label }) => <Counter key={key} compact editable quickStep={key === "food" || key === "water" ? 4 : undefined}
          label={label} value={stocks[key] ?? 0} max={old[key as keyof ShelterState] as number}
          onChange={value => setStocks(current => ({ ...current, [key]: value }))} />)}
      </div></div>
      <div className="shelter-move-section"><b>Itens e pessoas</b>
        <Counter compact label="Moradores que acompanharam" value={residents} max={old.residents} onChange={setResidents} />
        {(old.inventory ?? []).length ? <div className="shelter-move-items">{old.inventory!.map(item => <label key={item.id}>
          <input type="checkbox" checked={itemIds.includes(item.id)} onChange={event => setItemIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
          <span>{item.qty}× {item.name}</span><small>{item.load * item.qty} carga</small>
        </label>)}</div> : <p className="text-sm subtle">Nenhum objeto guardado na base.</p>}
      </div>
      <p className="inventory-preview"><Package size={18} aria-hidden="true" /> Selecionado: cerca de {estimatedLoad} espaço(s) de carga, além de {residents} pessoa(s). Confirme veículos, trajetos e capacidade na ficção; os contadores de cada sobrevivente continuam separados.</p>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={confirm}>{mode === "abandon" ? "Deixar base" : "Montar novo abrigo"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
