"use client";

import type { ReactElement } from "react";
import {
  Bug,
  Compass,
  Dice5,
  Eye,
  Footprints,
  House,
  MapPin,
  Plus,
  Route,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { hexActionOptions, performHexAction, type HexQuickAction } from "@/lib/hex-actions";
import type { GameState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
type Generator = "locais" | "comercios" | "eventos";

export function HexContextMenu({
  game,
  edit,
  hexId,
  playerPreview,
  onOpenDetails,
  onGenerate,
  onCreatePoint,
  onOpenMasterTools,
  onRelocateShelter,
  activeGroupHex,
  onMoveSurvivors,
  children,
}: {
  game: GameState;
  edit: Edit;
  hexId: string;
  playerPreview: boolean;
  onOpenDetails: () => void;
  onGenerate: (kind: Generator) => void;
  onCreatePoint: () => void;
  onOpenMasterTools: () => void;
  onRelocateShelter: () => void;
  activeGroupHex: string;
  onMoveSurvivors: () => void;
  children: ReactElement;
}) {
  const options = hexActionOptions(game, hexId);
  if (!options) return children;

  const { record } = options;
  const activeSourceCanReach = options.sources.some(group => group.hex === activeGroupHex);
  const activeIsMain = activeGroupHex === game.partyHex;
  const title = record.discovery === "desconhecido"
    ? "Fora do horizonte"
    : record.sector?.name ?? `Hex ${hexId}`;

  function run(action: HexQuickAction) {
    let result: ReturnType<typeof performHexAction> | null = null;
    edit(draft => { result = performHexAction(draft, hexId, action); });
    if (!result?.ok) {
      toast.error("A ação não pôde ser concluída.", {
        description: "Confira a posição dos sobreviventes, o horário e o estado do setor.",
      });
      return;
    }
    toast.success(result.message);
  }

  return <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent className="inventory-context-menu map-context-menu">
      <ContextMenuLabel className="inventory-context-header">
        <b>{title}</b>
        <span>HEX {hexId} · {record.discovery}{record.infestation === null ? " · infestação ?" : ` · infestação ${record.infestation}/5`}</span>
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={onOpenDetails}><MapPin /> Abrir detalhes</ContextMenuItem>

      {!playerPreview && record.discovery === "desconhecido" && activeSourceCanReach &&
        <ContextMenuItem onSelect={() => run({ type: "observe" })}><Eye /> Avistar com o grupo ativo</ContextMenuItem>}

      {!playerPreview && activeIsMain && options.canTravel &&
        <ContextMenuItem onSelect={() => run({ type: "travel" })}><Route /> Mover grupo principal · {record.routeHours} h</ContextMenuItem>}

      {!playerPreview && record.discovery !== "desconhecido" && activeSourceCanReach &&
        <ContextMenuItem onSelect={onMoveSurvivors}><Footprints /> {activeIsMain ? "Separar / mover sobreviventes…" : "Mover / dividir subgrupo…"}</ContextMenuItem>}

      {!playerPreview && options.canEstablish &&
        <ContextMenuItem onSelect={() => run({ type: "establish" })}><House /> Estabelecer abrigo aqui</ContextMenuItem>}

      {!playerPreview && options.canRelocate &&
        <ContextMenuItem onSelect={onRelocateShelter}><House /> Mudar abrigo para cá…</ContextMenuItem>}

      {!playerPreview && record.discovery !== "desconhecido" && <>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger><Dice5 /> Gerar conteúdo neste setor</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            <ContextMenuItem onSelect={() => onGenerate("locais")}><Dice5 /> Gerar local · B1</ContextMenuItem>
            <ContextMenuItem onSelect={() => onGenerate("comercios")}><Dice5 /> Gerar comércio · B2</ContextMenuItem>
            <ContextMenuItem onSelect={() => onGenerate("eventos")}><Dice5 /> Gerar evento · B3</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onCreatePoint}><Plus /> Adicionar local manualmente</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger><Bug /> Infestação</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {[0,1,2,3,4,5].map(value =>
              <ContextMenuItem key={value} onSelect={() => run({ type: "infestation", value })}>
                <Bug /> {value}/5{record.infestation === value ? " · atual" : ""}
              </ContextMenuItem>)}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => run({ type: "infestation", value: null })}>
              <Compass /> Deixar em aberto
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onSelect={onOpenMasterTools}><Compass /> Ferramentas do mestre</ContextMenuItem>
      </>}

      {playerPreview && <ContextMenuItem disabled className="inventory-context-help">
        <Footprints /> Ações de exploração ficam sob controle do mestre
      </ContextMenuItem>}
    </ContextMenuContent>
  </ContextMenu>;
}
