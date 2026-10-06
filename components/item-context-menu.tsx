"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Backpack,
  Box,
  Check,
  Droplets,
  Package,
  Pill,
  ShoppingCart,
  Trash2,
  Utensils,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { itemActionOptions, performItemAction, type ItemAction } from "@/lib/item-actions";
import { atSharedStorage, catalogItemIsConsumable, slotLabels } from "@/lib/inventory";
import { provisionDisplay } from "@/lib/provision-items";
import { provisionConsumedToday, type DailyResource } from "@/lib/survival";
import type { GameState, InventoryItem } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;

function quantityLabel(quantity: number, total: number) {
  return quantity === total ? `Tudo · ${total}` : `${quantity} unidade`;
}

export function ItemContextMenu({
  game,
  edit,
  ownerId,
  item,
  selfOnly = false,
  children,
}: {
  game: GameState;
  edit: Edit;
  ownerId: string;
  item: InventoryItem;
  selfOnly?: boolean;
  children: ReactNode;
}) {
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const options = itemActionOptions(game, ownerId, item, selfOnly);
  const quantityChoices = item.qty > 1 ? [1, item.qty] : [1];
  const provisionText = provisionDisplay(item);
  const owner = game.survivors.find(person => person.id === ownerId);
  const ownerAlreadyConsumed = Boolean(owner && options.provision.resource
    && provisionConsumedToday(game, owner, options.provision.resource as DailyResource));

  function run(action: ItemAction) {
    const outcome: { value: ReturnType<typeof performItemAction> | null } = { value: null };
    edit(draft => { outcome.value = performItemAction(draft, ownerId, item.id, action); });
    if (!outcome.value?.ok) {
      toast.error("A ação não foi concluída.", { description: "Confira o item, a quantidade e o acesso ao destino." });
      return;
    }
    toast.success(outcome.value.message);
  }

  function quantitySubmenu(label: string, icon: ReactNode, action: (quantity: number) => ItemAction) {
    if (item.qty === 1) {
      return <ContextMenuItem onSelect={() => run(action(1))}>{icon}{label}</ContextMenuItem>;
    }
    return <ContextMenuSub>
      <ContextMenuSubTrigger>{icon}{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="inventory-context-submenu">
        {quantityChoices.map(quantity =>
          <ContextMenuItem key={quantity} onSelect={() => run(action(quantity))}>
            <Check /> {quantityLabel(quantity, item.qty)}
          </ContextMenuItem>)}
      </ContextMenuSubContent>
    </ContextMenuSub>;
  }

  return <>
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="inventory-context-menu">
        <ContextMenuLabel className="inventory-context-header">
          <b>{item.name}</b>
          <span>{provisionText ?? `${item.qty}× · ${item.condition ?? "sem estado"}`}</span>
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {options.provision.resource && options.provision.ready && (ownerId === "shared"
          ? <ContextMenuSub>
              <ContextMenuSubTrigger><Utensils /> Consumir 1 porção</ContextMenuSubTrigger>
              <ContextMenuSubContent className="inventory-context-submenu">
                {game.survivors.some(person => atSharedStorage(game, person.id))
                  ? game.survivors.filter(person => atSharedStorage(game, person.id)).map(person =>
                      <ContextMenuItem key={person.id} onSelect={() => run({ type: "consume", consumerId: person.id })}>
                        <Utensils /> {person.name}{options.provision.resource && provisionConsumedToday(game, person, options.provision.resource as DailyResource) ? " · já consumiu hoje" : ""}
                      </ContextMenuItem>)
                  : <ContextMenuItem disabled>Nenhum sobrevivente junto às reservas</ContextMenuItem>}
              </ContextMenuSubContent>
            </ContextMenuSub>
          : <ContextMenuItem onSelect={() => run({ type: "consume", consumerId: ownerId })}>
              {options.provision.resource === "water" ? <Droplets /> : <Utensils />}
              {ownerAlreadyConsumed ? "Consumir outra porção" : "Consumir 1 porção"}
            </ContextMenuItem>)}

        {options.provision.resource && !options.provision.ready
          && (options.provision.requiresPreparation || options.provision.requiresVerification)
          && quantitySubmenu(
            options.provision.requiresVerification ? "Verificar / tratar" : "Preparar",
            <Wrench />,
            quantity => ({ type: "prepare", quantity })
          )}

        {options.canDeployCart && <ContextMenuItem onSelect={() => run({ type: "deploy-cart" })}>
          <ShoppingCart /> Abrir e conduzir carrinho
        </ContextMenuItem>}
        {options.canFoldCart && <ContextMenuItem onSelect={() => run({ type: "fold-cart" })}>
          <ShoppingCart /> Dobrar carrinho
        </ContextMenuItem>}
        {options.cartFoldBlocked && <ContextMenuItem disabled>
          <ShoppingCart /> Esvazie o carrinho para dobrar
        </ContextMenuItem>}
        {options.canStoreInCart && quantitySubmenu(
          "Colocar no carrinho",
          <ShoppingCart />,
          quantity => ({ type: "cart-store", quantity })
        )}
        {item.name === "Carrinho dobrável" && item.cartDeployed && (item.cartItems?.length ?? 0) > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger><ShoppingCart /> Retirar do carrinho</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {item.cartItems!.map(nested => <ContextMenuItem key={nested.id}
              onSelect={() => run({ type: "cart-remove", nestedItemId: nested.id, quantity: nested.qty })}>
              <Package /> {nested.qty}× {nested.name}
            </ContextMenuItem>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}

        {options.slots.length > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger><Backpack /> Equipar</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {options.slots.map(slot =>
              <ContextMenuItem key={slot} onSelect={() => run({ type: "equip", slot })}>
                <Backpack /> {slotLabels[slot]}
              </ContextMenuItem>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}

        {options.targets.length > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger><ArrowLeftRight /> Transferir</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {options.targets.map(target => item.qty === 1
              ? <ContextMenuItem key={target.value} onSelect={() => run({ type: "transfer", targetId: target.value, quantity: 1 })}>
                  <ArrowLeftRight /> {target.label}
                </ContextMenuItem>
              : <ContextMenuSub key={target.value}>
                  <ContextMenuSubTrigger><ArrowLeftRight /> {target.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="inventory-context-submenu">
                    {quantityChoices.map(quantity =>
                      <ContextMenuItem key={quantity} onSelect={() => run({ type: "transfer", targetId: target.value, quantity })}>
                        <Check /> {quantityLabel(quantity, item.qty)}
                      </ContextMenuItem>)}
                  </ContextMenuSubContent>
                </ContextMenuSub>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}

        {options.canUse && <ContextMenuItem onSelect={() => run({ type: "use", quantity: 1 })}>
          <Pill /> {catalogItemIsConsumable(item) ? "Usar 1 unidade" : "Usar"}
        </ContextMenuItem>}

        {options.rechargeTargets.length > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger><Wrench /> Recarregar aparelho</ContextMenuSubTrigger>
          <ContextMenuSubContent className="inventory-context-submenu">
            {options.rechargeTargets.map(target => <ContextMenuItem key={target.id}
              onSelect={() => run({ type: "recharge", targetId: target.id })}>
              <Check /> {target.name}
            </ContextMenuItem>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}

        {options.containerOptions && Math.min(options.containerOptions.waterCapacity, options.containerOptions.waterAvailable) > 0 &&
          <ContextMenuItem onSelect={() => run({ type: "fill-container", resource: "water",
            quantity: Math.min(options.containerOptions!.waterCapacity, options.containerOptions!.waterAvailable) })}>
            <Droplets /> Encher com Água
          </ContextMenuItem>}
        {options.containerOptions && Math.min(options.containerOptions.fuelCapacity, options.containerOptions.fuelAvailable) > 0 &&
          <ContextMenuItem onSelect={() => run({ type: "fill-container", resource: "fuel", quantity: 1 })}>
            <Package /> Guardar Combustível
          </ContextMenuItem>}
        {options.containerOptions?.canUnloadAtStorage && <ContextMenuItem onSelect={() => run({ type: "empty-container" })}>
          <Package /> Guardar conteúdo nas reservas
        </ContextMenuItem>}

        {options.canMedication && quantitySubmenu(
          "Registrar como Medicamentos",
          <Pill />,
          quantity => ({ type: "medication", quantity })
        )}

        {options.canStock && quantitySubmenu(
          "Guardar nas reservas",
          <Package />,
          quantity => ({ type: "stock", quantity })
        )}

        <ContextMenuSeparator />
        {options.canDiscard && (item.qty === 1
          ? <ContextMenuItem variant="destructive" onSelect={() => setDiscardCount(1)}>
              <Trash2 /> Deixar para trás…
            </ContextMenuItem>
          : <ContextMenuSub>
              <ContextMenuSubTrigger className="inventory-context-destructive"><Trash2 /> Deixar para trás…</ContextMenuSubTrigger>
              <ContextMenuSubContent className="inventory-context-submenu">
                {quantityChoices.map(quantity =>
                  <ContextMenuItem key={quantity} variant="destructive" onSelect={() => setDiscardCount(quantity)}>
                    <Trash2 /> {quantityLabel(quantity, item.qty)}
                  </ContextMenuItem>)}
              </ContextMenuSubContent>
            </ContextMenuSub>)}

        <ContextMenuSeparator />
        <ContextMenuItem disabled className="inventory-context-help">
          <Box /> Editar estado, correções e opções avançadas: botão Ações
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <AlertDialog open={discardCount !== null} onOpenChange={open => { if (!open) setDiscardCount(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deixar {item.name} para trás?</AlertDialogTitle>
          <AlertDialogDescription>
            {discardCount ?? 1} unidade(s) serão retiradas do inventário e o descarte ficará registrado no diário da campanha.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            const quantity = discardCount ?? 1;
            setDiscardCount(null);
            run({ type: "discard", quantity });
          }}>Deixar para trás</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
