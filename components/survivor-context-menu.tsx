"use client";

import type { ReactElement } from "react";
import {
  Activity,
  ArrowLeftRight,
  Backpack,
  BookOpen,
  Crosshair,
  Dice5,
  HeartPulse,
  Shield,
  Swords,
  UserRound,
  Wrench,
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
import type { RollRequest } from "@/components/roll-dialog";
import { itemActionOptions, performItemAction } from "@/lib/item-actions";
import { survivorStats, type GameState, type Survivor } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;

function qtyLabel(qty: number, total: number) {
  return qty === total ? `Tudo · ${total}` : `${qty} unidade`;
}

export function SurvivorContextMenu({
  game,
  edit,
  survivor,
  canControl,
  masterMode,
  onOpenTab,
  onRoll,
  children,
}: {
  game: GameState;
  edit: Edit;
  survivor: Survivor;
  canControl: boolean;
  masterMode: boolean;
  onOpenTab: (tab: string) => void;
  onRoll: (request: RollRequest) => void;
  children: ReactElement;
}) {
  const stats = survivorStats(survivor);

  function transfer(itemId: string, targetId: string, quantity: number) {
    let result: ReturnType<typeof performItemAction> | null = null;
    edit(draft => { result = performItemAction(draft, survivor.id, itemId, { type: "transfer", targetId, quantity }); });
    if (!result?.ok) {
      toast.error("A transferência não foi concluída.");
      return;
    }
    toast.success(result.message);
  }

  return <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent className="inventory-context-menu survivor-context-menu">
      <ContextMenuLabel className="inventory-context-header">
        <b>{survivor.name}</b>
        <span>PV {Math.max(0, stats.hp - survivor.hp)}/{stats.hp} · Hope {survivor.hope}/6 · Stress {survivor.stress}/6</span>
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => onOpenTab("resumo")}><UserRound /> Abrir ficha</ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger><BookOpen /> Ir para</ContextMenuSubTrigger>
        <ContextMenuSubContent className="inventory-context-submenu">
          <ContextMenuItem onSelect={() => onOpenTab("atributos")}><Dice5 /> Atributos e testes</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenTab("combate")}><Shield /> Combate e kit</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenTab("inventario")}><Backpack /> Inventário</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenTab("habilidades")}><Activity /> Habilidades</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenTab("condicoes")}><HeartPulse /> Condições</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenTab("historia")}><BookOpen /> História e notas</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      {canControl && <>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onRoll({ survivorId: survivor.id, kind: "action" })}>
          <Dice5 /> Rolar teste
        </ContextMenuItem>
        {(survivor.primary || survivor.secondary) && <ContextMenuSub>
          <ContextMenuSubTrigger><Swords /> Rolar ataque</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {survivor.primary && <ContextMenuItem onSelect={() => onRoll({ survivorId: survivor.id, kind: "attack", weapon: "primary" })}>
              <Crosshair /> {survivor.primary}
            </ContextMenuItem>}
            {survivor.secondary && <ContextMenuItem onSelect={() => onRoll({ survivorId: survivor.id, kind: "attack", weapon: "secondary" })}>
              <Crosshair /> {survivor.secondary}
            </ContextMenuItem>}
          </ContextMenuSubContent>
        </ContextMenuSub>}
      </>}

      {masterMode && survivor.inventory.length > 0 && <ContextMenuSub>
        <ContextMenuSubTrigger><ArrowLeftRight /> Transferir item</ContextMenuSubTrigger>
        <ContextMenuSubContent className="inventory-context-submenu survivor-transfer-items">
          {survivor.inventory.map(item => {
            const options = itemActionOptions(game, survivor.id, item, false);
            if (!options.targets.length) return null;
            return <ContextMenuSub key={item.id}>
              <ContextMenuSubTrigger><Backpack /> {item.name} · ×{item.qty}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="inventory-context-submenu">
                {options.targets.map(target => item.qty === 1
                  ? <ContextMenuItem key={target.value} onSelect={() => transfer(item.id, target.value, 1)}>
                      <ArrowLeftRight /> {target.label}
                    </ContextMenuItem>
                  : <ContextMenuSub key={target.value}>
                      <ContextMenuSubTrigger><ArrowLeftRight /> {target.label}</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="inventory-context-submenu">
                        {[1, item.qty].map(qty =>
                          <ContextMenuItem key={qty} onSelect={() => transfer(item.id, target.value, qty)}>
                            <Backpack /> {qtyLabel(qty, item.qty)}
                          </ContextMenuItem>)}
                      </ContextMenuSubContent>
                    </ContextMenuSub>)}
              </ContextMenuSubContent>
            </ContextMenuSub>;
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>}

      {masterMode && <>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger><Wrench /> Mestre</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            <ContextMenuItem onSelect={() => onOpenTab("condicoes")}><HeartPulse /> Ajustar condição</ContextMenuItem>
            <ContextMenuItem onSelect={() => onOpenTab("combate")}><Shield /> Registrar dano / recursos</ContextMenuItem>
            <ContextMenuItem onSelect={() => onOpenTab("inventario")}><Backpack /> Gerenciar inventário</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </>}

      {!canControl && <ContextMenuItem disabled className="inventory-context-help">
        <UserRound /> Visualização sem ações de personagem
      </ContextMenuItem>}
    </ContextMenuContent>
  </ContextMenu>;
}
