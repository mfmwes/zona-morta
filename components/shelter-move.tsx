"use client";

import { useState } from "react";
import { House, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Counter } from "@/components/game-controls";
import { abandonShelter, ammunitionItemType, ammunitionLoad, establishShelter, residentNpcs, type GameState, type ShelterManifest, type ShelterState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
const keys: { key: keyof NonNullable<ShelterManifest["stocks"]>; label: string }[] = [
  { key: "food", label: "Comida · porções" }, { key: "water", label: "Água · porções" },
  { key: "medications", label: "Medicamentos" },
  { key: "fuel", label: "Combustível" }, { key: "parts", label: "Peças" },
];

export function ShelterMoveDialog({ game, edit, mode, destination, open, onOpenChange, hideTrigger = false }: {
  game: GameState; edit: Edit; mode: "relocate" | "abandon"; destination?: string;
  open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const visible = open ?? localOpen;
  const [stocks, setStocks] = useState<NonNullable<ShelterManifest["stocks"]>>({});
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [npcIds, setNpcIds] = useState<string[]>([]);
  const [residents, setResidents] = useState(0);
  const old = game.shelter;
  const residentPeople = residentNpcs(game, old.hex).filter(npc => old.hex ? npc.hex === old.hex : npc.hex === game.partyHex);
  const target = destination ? game.hexes[destination]?.sector?.name ?? `hex ${destination}` : "a estrada";
  const selectedItems = (old.inventory ?? []).filter(item => itemIds.includes(item.id));
  const itemLoad = selectedItems.filter(item => !ammunitionItemType(item)).reduce((sum, item) => sum + item.load * item.qty, 0);
  const ammoLoad = ammunitionLoad(selectedItems);
  const estimatedLoad = itemLoad + Math.ceil((stocks.food ?? 0) / 4) + Math.ceil((stocks.water ?? 0) / 4)
    + (stocks.medications ?? 0) + ammoLoad + (stocks.fuel ?? 0) + (stocks.parts ?? 0);
  function handleOpen(value: boolean) {
    if (open === undefined) setLocalOpen(value);
    onOpenChange?.(value);
    if (value) { setStocks({}); setItemIds([]); setNpcIds([]); setResidents(0); }
  }
  function confirm() {
    let succeeded = false;
    const manifest: ShelterManifest = { stocks, itemIds, residents, npcIds };
    edit(draft => { succeeded = mode === "abandon" ? abandonShelter(draft, manifest) : establishShelter(draft, destination!, manifest); });
    if (!succeeded) { toast.error("Confira a posição, as reservas e a seleção antes de confirmar."); return; }
    toast.success(mode === "abandon" ? "Base deixada; o depósito antigo continua no mapa." : "Abrigo estabelecido; o que ficou atrás continua registrado.");
    handleOpen(false);
  }
  return <Dialog open={visible} onOpenChange={handleOpen}>
    {!hideTrigger && <DialogTrigger asChild><Button size="sm" variant="outline" className={mode === "abandon" ? "mt-5" : "mt-3"}>
      {mode === "abandon" ? "Deixar o abrigo" : <><House size={16} /> Mudar abrigo para cá</>}
    </Button></DialogTrigger>}
    <DialogContent className="shelter-move-dialog"><DialogHeader>
      <DialogTitle>{mode === "abandon" ? "Deixar a base atual" : `Montar abrigo em ${target}`}</DialogTitle>
      <DialogDescription>Escolha o que já foi transportado para {target}. Os itens, moradores e mantimentos não selecionados ficam registrados na antiga base em {old.hex}. As melhorias permanecem no prédio antigo.</DialogDescription>
    </DialogHeader>
      <div className="shelter-move-section"><b>Reservas transportadas</b><div className="shelter-move-grid">
        {keys.map(({ key, label }) => <Counter key={key} compact editable quickStep={key === "food" || key === "water" ? 4 : undefined}
          label={label} value={stocks[key] ?? 0} max={old[key as keyof ShelterState] as number}
          onChange={value => setStocks(current => ({ ...current, [key]: value }))} />)}
      </div>
      <p className="text-sm subtle mt-3">Munição é transportada pela lista de itens abaixo, junto com os demais objetos físicos.</p></div>
      <div className="shelter-move-section"><b>Itens e pessoas</b>
        <Counter compact label="Moradores não identificados que acompanharam" value={residents} max={old.residents} onChange={setResidents} />
        {residentPeople.length > 0 && <div className="shelter-move-items">{residentPeople.map(npc => <label key={npc.id}>
          <input type="checkbox" checked={npcIds.includes(npc.id)} onChange={event => setNpcIds(current => event.target.checked ? [...current, npc.id] : current.filter(id => id !== npc.id))} />
          <span>{npc.name}{npc.role ? ` · ${npc.role}` : ""}</span><small>PNJ identificado</small>
        </label>)}</div>}
        {(old.inventory ?? []).length ? <div className="shelter-move-items">{old.inventory!.map(item => <label key={item.id}>
          <input type="checkbox" checked={itemIds.includes(item.id)} onChange={event => setItemIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
          <span>{item.qty}× {item.name}</span><small>{ammunitionItemType(item) ? `${Math.ceil(item.qty / 4)} carga · munição física` : `${item.load * item.qty} carga`}</small>
        </label>)}</div> : <p className="text-sm subtle">Nenhum objeto guardado na base.</p>}
      </div>
      <p className="inventory-preview"><Package size={18} aria-hidden="true" /> Selecionado: cerca de {estimatedLoad} espaço(s) de carga, além de {residents + npcIds.length} pessoa(s). Quem não for selecionado permanece registrado na antiga base.</p>
      <DialogFooter><Button variant="outline" onClick={() => handleOpen(false)}>Cancelar</Button>
        <Button onClick={confirm}>{mode === "abandon" ? "Deixar base" : "Montar novo abrigo"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
