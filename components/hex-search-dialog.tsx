"use client";

import { useRef, useState } from "react";
import { Clock, Dice5, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { content, displayTime, type GameState } from "@/lib/game";
import { normalizedSector, recordSearch, searchAreaError, searchAreaLabel, searchAvailabilityError, searchError, type SearchInput } from "@/lib/exploration";
import { rollDie } from "@/lib/rolls";

export type HexSearchRequest = { hexId: string; pointId: string };

export function HexSearchDialog({ game, edit, request, onClose }: {
  game: GameState; edit: (fn: (draft: GameState) => void) => void; request: HexSearchRequest; onClose: () => void;
}) {
  const hex = game.hexes[request.hexId];
  const point = hex?.points.find(row => row.id === request.pointId);
  const [otherArea, setOtherArea] = useState(() => Boolean(point?.searches.some(row => normalizedSector(row.sector) === normalizedSector(point.name))));
  const [areaName, setAreaName] = useState("");
  const [mode, setMode] = useState<SearchInput["mode"]>("specific");
  const [what, setWhat] = useState("");
  const [result, setResult] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [tableName, setTableName] = useState(() => content.lootTables.some(row => row.name === point?.lootTable) ? point!.lootTable! : "");
  const [rolledLoot, setRolledLoot] = useState<{ table: string; roll: number } | null>(null);
  const saving = useRef(false);
  const area = otherArea ? areaName.trim() : point?.name ?? "";
  const availabilityError = searchAvailabilityError(game, request.hexId, request.pointId);
  const areaError = point ? searchAreaError(point, area) : null;
  const input: SearchInput = { hex: request.hexId, pointId: request.pointId, sector: area, what, result, minutes, mode,
    ...(mode === "open" && rolledLoot ? { table: rolledLoot.table, roll: rolledLoot.roll } : {}) };
  const error = searchError(game, input);
  const mainTaken = Boolean(point?.searches.some(row => normalizedSector(row.sector) === normalizedSector(point.name)));
  const canRoll = !availabilityError && !areaError && Boolean(tableName) && !rolledLoot;

  function rollLoot() {
    if (!canRoll) return;
    const table = content.lootTables.find(row => row.name === tableName);
    if (!table) return;
    const roll = rollDie(12);
    setRolledLoot({ table: table.name, roll });
    setResult(table.entries[roll - 1].text);
  }

  function save() {
    if (error || saving.current) return;
    saving.current = true;
    const outcomes: { ok: boolean; error: string | null }[] = [];
    edit(draft => { const currentError = searchError(draft, input); outcomes.push({ ok: !currentError && recordSearch(draft, input), error: currentError }); });
    if (!outcomes[0]?.ok) {
      saving.current = false;
      toast.error(outcomes[0]?.error ?? "Não foi possível registrar a busca. Confira o relógio e a posição do grupo.");
      return;
    }
    toast.success("Busca registrada", { description: `${point?.name} · ${point ? searchAreaLabel(point, area) : area} · ${minutes} min` });
    onClose();
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="inventory-dialog hex-search-dialog sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Buscar em {point?.name ?? "local removido"}</DialogTitle>
        <DialogDescription>Escolha a área interna do local, resolva a busca e registre o resultado.</DialogDescription>
      </DialogHeader>
      <div className="hex-location-path" aria-label="Localização da busca">
        <span><small>Setor do mapa · Hex {request.hexId}</small><b>{hex?.sector?.name ?? "Setor ainda não revelado"}</b></span>
        <span><small>Local neste setor</small><b>{point?.name ?? "Local removido"}</b></span>
      </div>
      {availabilityError && <p role="alert" className="text-sm text-red-700">{availabilityError}</p>}

      <section className="hex-search-step">
        <h3><span>1</span> Onde dentro deste local?</h3>
        <p className="text-sm subtle">Áreas internas são partes de {point?.name ?? "um local"}: cozinha, depósito, fundos. Cada área pode ser vasculhada uma vez.</p>
        <fieldset className="hex-search-choices" disabled={Boolean(availabilityError)}>
          <legend className="sr-only">Área interna da busca</legend>
          <label><input type="radio" name="search-area" checked={!otherArea} disabled={mainTaken} onChange={() => setOtherArea(false)} />
            <span><b>Área principal</b><small>{mainTaken ? "Já vasculhada" : "Usar o espaço principal deste local"}</small></span></label>
          <label><input type="radio" name="search-area" checked={otherArea} onChange={() => setOtherArea(true)} />
            <span><b>Outra área interna</b><small>Identificar uma parte ainda não vasculhada</small></span></label>
        </fieldset>
        {otherArea && <Field label="Nome da área interna" value={areaName} onChange={setAreaName} placeholder="Ex.: depósito dos fundos" />}
        {point && point.searches.length > 0 && <div className="hex-search-history"><b>Áreas já vasculhadas neste local</b>
          <div className="flex flex-wrap gap-2 mt-2">{point.searches.map(row => <span key={row.id} className="tag">{searchAreaLabel(point, row.sector)}</span>)}</div>
        </div>}
        {areaError && <p role="status" className="text-sm text-red-700">{areaError}</p>}
      </section>

      <section className="hex-search-step">
        <h3><span>2</span> O que o grupo procura?</h3>
        <fieldset className="hex-search-choices" disabled={Boolean(availabilityError)}>
          <legend className="sr-only">Tipo de busca</legend>
          {([{ value: "specific", title: "Procurar algo específico", detail: "O mestre resolve pelo objetivo e pelos sinais" },
            { value: "open", title: "Vasculhar por achados", detail: "Sortear um achado na tabela d12" }] as const).map(option =>
            <label key={option.value}><input type="radio" name="search-mode" checked={mode === option.value}
              onChange={() => { setMode(option.value); setResult(""); setRolledLoot(null); }} />
              <span><b>{option.title}</b><small>{option.detail}</small></span></label>)}
        </fieldset>
        {mode === "specific" ? <Field label="O que procuram e para quê?" value={what} onChange={setWhat} placeholder="Ex.: peças para reparar o portão" />
          : <><Pick label="Tabela de achados" value={tableName} options={content.lootTables.map(row => row.name)}
            onChange={value => { setTableName(value); setRolledLoot(null); setResult(""); }} />
            <p className="text-xs subtle">A tabela descreve o conteúdo encontrado nesta área interna do local.</p>
            {!rolledLoot ? <Button variant="outline" disabled={!canRoll} onClick={rollLoot}><Dice5 size={16} /> Sortear achado · d12</Button>
              : <div className="list-card text-sm"><span className="tag">d12 {rolledLoot.roll} · {rolledLoot.table}</span>
                <p className="mt-2">{content.lootTables.find(row => row.name === rolledLoot.table)?.entries[rolledLoot.roll - 1].text}</p>
                <p className="text-xs subtle mt-2">Revise o resultado abaixo para ajustar o achado aos sinais do lugar.</p></div>}
          </>}
      </section>

      <section className="hex-search-step">
        <h3><span>3</span> Resultado e tempo</h3>
        <Field label="Resultado da busca" value={result} onChange={setResult} multiline placeholder="Ex.: duas latas intactas; ou nada foi encontrado" />
        <fieldset className="flex flex-wrap gap-2 items-center" disabled={Boolean(availabilityError)}><legend className="field-label mb-2">Tempo gasto pelo grupo</legend>
          {[30, 60].map(value => <Button key={value} size="sm" variant={minutes === value ? "default" : "outline"} aria-pressed={minutes === value}
            onClick={() => setMinutes(value)}><Clock size={14} /> {value === 30 ? "30 min" : "1 hora"}</Button>)}
        </fieldset>
        <p className="text-sm subtle">Ao registrar, a área fica marcada como vasculhada e o relógio avança de {displayTime(game.minutes)} para {displayTime(game.minutes + minutes)}.</p>
        <p className="text-xs subtle">O mestre resolve o acesso e a posse dos achados na ficção antes de registrar.</p>
        {error && !availabilityError && !areaError && <p role="status" className="text-sm text-red-700">{error}</p>}
      </section>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={Boolean(error)} onClick={save}><Search size={16} /> Registrar busca · +{minutes} min</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
