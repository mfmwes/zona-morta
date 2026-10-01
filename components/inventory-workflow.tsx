"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Backpack, PackagePlus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Counter, Field, Pick } from "@/components/game-controls";
import { ItemArt } from "@/components/item-art";
import { addLog, ammunitionCount, ammunitionTypes, survivorHex, survivorStats, type AmmunitionType, type EquipmentSlot, type GameState, type InventoryItem } from "@/lib/game";
import { createId } from "@/lib/id";
import { addStack, atSharedStorage, batteryStateFor, batteryTargets, catalogForItem, catalogItemCanUse, catalogItemIsConsumable, catalogItems, catalogKey, compatibleSlots, conditions,
  container, countsAsMedication, displacedSlots, equipItem, inventoryCategories, itemFromCatalog,
  provisionInfo, provisionPreparationCheck, provisionTransferError, reusableContainerOptions, slotLabels, transferItem, transferProvisions } from "@/lib/inventory";
import { itemActionOptions, performItemAction } from "@/lib/item-actions";
import { provisionDisplay, provisionItemInfo, provisionShelfLabel } from "@/lib/provision-items";
import { provisionConsumedToday, type DailyResource } from "@/lib/survival";

type Edit = (fn: (draft: GameState) => void) => void;
const normalizeSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

function ownerName(game: GameState, id: string) {
  return id === "shared" ? (game.shelter.hex ? "Depósito do abrigo" : "Reservas do grupo")
    : game.survivors.find(s => s.id === id)?.name ?? "Sobrevivente";
}

export function AddItemDialog({ game, edit, ownerId }: { game: GameState; edit: Edit; ownerId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [key, setKey] = useState("");
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [load, setLoad] = useState("1");
  const [qty, setQty] = useState("1");
  const [condition, setCondition] = useState("Íntegro");
  const entry = catalogItems.find(x => catalogKey(x) === key);
  const matches = useMemo(() => catalogItems.filter(item => (category === "Todas" || item.category === category)
    && normalizeSearch(item.name + " " + item.fields.map(f => f.value).join(" ")).includes(normalizeSearch(query.trim()))), [category, query]);
  const preview = entry ? itemFromCatalog(entry) : null;
  const amount = Number(qty);
  const quantityValid = Number.isInteger(amount) && amount >= 1 && amount <= 99;
  const loadValid = !custom || (load.trim() !== "" && Number.isInteger(Number(load)) && Number(load) >= 0 && Number(load) <= 9);

  function add() {
    if ((!entry && !custom) || (custom && !name.trim()) || !quantityValid || !loadValid) return;
    const item = entry && !custom ? itemFromCatalog(entry, amount, condition, game.day) : {
      id: createId(), name: name.trim().slice(0, 100), load: Math.max(0, Math.min(9, Math.trunc(Number(load) || 0))),
      qty: amount, condition, category: "Outros",
    };
    let added = false;
    edit(draft => {
      const target = container(draft, ownerId);
      if (!target || (ownerId === "shared" && !atSharedStorage(draft))) return;
      addStack(target, item);
      added = true;
      const provision = provisionItemInfo(item);
      addLog(draft, provision.resource ? "provisões" : "inventário",
        ownerName(draft, ownerId) + ": recebeu " + item.qty + "× " + item.name +
        (provision.resource ? ` (${provision.remaining} porção(ões) físicas).` : "."));
    });
    if (!added) { toast.error("O destino não está acessível. Confira a posição do grupo."); return; }
    const provision = !custom ? provisionItemInfo(item) : null;
    toast.success(`${item.qty}× ${item.name} registrado.`, {
      description: provision?.resource
        ? `${provision.remaining} porção(ões) no item · ${provision.status}`
        : ownerName(game, ownerId),
    });
    setOpen(false); setKey(""); setQuery(""); setQty("1"); setCondition("Íntegro"); setCustom(false); setName("");
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={ownerId === "shared" && !atSharedStorage(game)}><PackagePlus size={16} /> Registrar achado</Button></DialogTrigger>
    <DialogContent className="inventory-dialog"><DialogHeader><DialogTitle>Registrar achado</DialogTitle>
      <DialogDescription>Escolha do catálogo para preencher a carga e consultar as regras. Se não encontrar, use um item livre.</DialogDescription></DialogHeader>
      <div className="inventory-mode"><button type="button" aria-pressed={!custom} onClick={() => setCustom(false)}>Catálogo</button>
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Item livre</button></div>
      {!custom ? <>
        <div className="inventory-search"><Field label="Buscar item" value={query} onChange={value => { setQuery(value); setKey(""); }} placeholder="Nome ou efeito" />
          <Pick label="Categoria" value={category} onChange={value => { setCategory(value); setKey(""); }} options={["Todas", ...inventoryCategories]} /></div>
        <span className="roll-hint" role="status">{matches.length} itens no catálogo com este filtro</span>
        <div className="inventory-catalog-results" aria-label="Resultados do catálogo">
          {matches.map(item => <button type="button" key={catalogKey(item)} className={catalogKey(item) === key ? "selected" : ""}
            onClick={() => setKey(catalogKey(item))} aria-pressed={catalogKey(item) === key}>
            <ItemArt name={item.name} category={item.category} /><span><b>{item.name}</b><small>{item.category}</small></span><strong>{item.fields.find(f => ["Guarda", "Carga"].includes(f.label))?.value ?? "1"} espaço(s)</strong></button>)}
          {matches.length === 0 && <p>Nenhum item encontrado. Tente outro termo ou registre um item livre.</p>}
        </div>
        {entry && <div className="inventory-selection"><div className="inventory-selection-heading"><ItemArt name={entry.name} category={entry.category} size="large" /><div><b>{entry.name}</b><span>Carga registrada: {preview?.load === 0 && ["Alimentos","Bebidas"].includes(entry.category) ? "porções físicas agrupadas na carga" : preview?.load === 0 ? "objeto compacto · pode usar bolso" : (preview?.load ?? 1) + " por unidade"}</span></div></div>
          <dl>{entry.fields.filter(f => !["Guarda", "Carga"].includes(f.label)).slice(0, 4).map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl></div>}
      </> : <div className="inventory-search"><Field label="Nome" value={name} onChange={setName} placeholder="Ex.: filtro portátil" />
        <Field label="Carga por unidade" value={load} onChange={setLoad} type="number" /></div>}
      <div className="inventory-search"><Field label="Quantidade" value={qty} onChange={setQty} type="number" />
        <Pick label="Estado" value={condition} options={conditions} onChange={setCondition} /></div>
      {(!quantityValid || !loadValid) && <p className="inventory-danger" role="alert">Use uma quantidade inteira de 1 a 99 e carga de 0 a 9.</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!quantityValid || !loadValid || (custom ? !name.trim() : !entry)} onClick={add}><Plus size={16} /> Adicionar</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function ItemActionsDialog({ game, edit, ownerId, item, allowCorrection = false, selfOnly = false }: { game: GameState; edit: Edit; ownerId: string; item: InventoryItem; allowCorrection?: boolean; selfOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"transfer" | "equip" | "consume" | "prepare" | "medication" | "stock" | "use" | "recharge" | "fill-water" | "fill-fuel" | "empty-container" | "cart" | "discard" | "edit">("transfer");
  const [targetId, setTargetId] = useState("");
  const [slot, setSlot] = useState<EquipmentSlot>("primary");
  const [amount, setAmount] = useState(1);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [conditionDraft, setConditionDraft] = useState(item.condition || "Íntegro");
  const [qtyDraft, setQtyDraft] = useState(item.qty);
  const [loadDraft, setLoadDraft] = useState(item.load);
  const actionOptions = itemActionOptions(game, ownerId, item, selfOnly);
  const slots = actionOptions.slots;
  const provision = provisionInfo(item);
  const bearer = game.survivors.find(s => s.id === ownerId);
  const targets = actionOptions.targets;
  const destination = targets.some(x => x.value === targetId) ? targetId : targets[0]?.value ?? "";
  const selectedSlot = slots.includes(slot) ? slot : slots[0];
  const count = Math.max(1, Math.min(item.qty, amount));
  const current = catalogForItem(item);
  const displaced = mode === "equip" && bearer && selectedSlot ? displacedSlots(bearer, item, selectedSlot).map(key => bearer[key]) : [];
  const provisionState = provisionItemInfo(item);
  const sharedConsumers = ownerId === "shared" ? game.survivors.filter(person => atSharedStorage(game, person.id)) : [];
  const consumerId = ownerId === "shared"
    ? (sharedConsumers.some(person => person.id === targetId) ? targetId : sharedConsumers[0]?.id ?? "")
    : ownerId;
  const consumer = game.survivors.find(person => person.id === consumerId);
  const alreadyConsumed = Boolean(consumer && provisionState.resource
    && provisionConsumedToday(game, consumer, provisionState.resource as DailyResource));
  const canUse = catalogItemCanUse(item) && item.name !== "Kit de pilhas";
  const rechargeTargets = item.name === "Kit de pilhas"
    ? batteryTargets(game, ownerId).filter(target => target.battery === "Descarregada")
    : [];
  const rechargeTargetId = rechargeTargets.some(target => target.id === targetId) ? targetId : rechargeTargets[0]?.id ?? "";
  const containerOptions = reusableContainerOptions(game, ownerId, item);
  const fillWaterMax = containerOptions ? Math.min(containerOptions.waterCapacity, containerOptions.waterAvailable) : 0;
  const fillFuelMax = containerOptions ? Math.min(containerOptions.fuelCapacity, containerOptions.fuelAvailable) : 0;
  const preparationCheck = provisionState.resource && !provisionState.ready
    ? provisionPreparationCheck(game, ownerId, item, count) : null;
  const stockResource = item.category === "Suprimentos abstratos"
    ? ({ "Medicamentos (1 unidade)": "medications", "Combustível (1 unidade)": "fuel", "Peças (1 unidade)": "parts" } as const)[item.name as "Medicamentos (1 unidade)" | "Combustível (1 unidade)" | "Peças (1 unidade)"] : undefined;
  let loadPreview: { name: string; carried: number; capacity: number } | null = null;
  if ((mode === "transfer" && destination && destination !== "shared") || (mode === "equip" && selectedSlot && bearer)) {
    const preview = structuredClone(game);
    const receiver = preview.survivors.find(s => s.id === (mode === "equip" ? ownerId : destination));
    const ok = mode === "equip" && receiver && selectedSlot ? equipItem(receiver, item.id, selectedSlot)
      : transferItem(preview, ownerId, destination, item.id, count);
    if (receiver && ok) { const stats = survivorStats(receiver); loadPreview = { name: receiver.name, carried: stats.carried, capacity: stats.capacity }; }
  }

  function close() { setOpen(false); setConfirmDiscard(false); setAmount(1); }
  function openDialog(value: boolean) {
    if (!value) { close(); return; }
    setConditionDraft(item.condition || "Íntegro"); setQtyDraft(item.qty); setLoadDraft(item.load);
    setMode(item.name === "Carrinho dobrável" ? "cart" : containerOptions?.canUnloadAtStorage ? "empty-container" : fillWaterMax > 0 ? "fill-water" : fillFuelMax > 0 ? "fill-fuel"
      : rechargeTargets.length ? "recharge" : slots.length ? "equip" : provisionState.resource
      ? (provisionState.ready ? "consume" : (provisionState.requiresPreparation || provisionState.requiresVerification) ? "prepare" : "edit")
      : targets.length ? "transfer" : "edit");
    setOpen(true);
  }

  function perform() {
    if (mode === "discard" && !confirmDiscard) { setConfirmDiscard(true); return; }
    let message = "";
    edit(draft => {
      if (mode === "edit") {
        const person = draft.survivors.find(s => s.id === ownerId);
        const found = container(draft, ownerId)?.find(entry => entry.id === item.id);
        if (found) {
          found.condition = conditionDraft;
          if (allowCorrection) { found.qty = qtyDraft; found.load = loadDraft; }
          message = ownerName(draft, ownerId) + ": registro de " + item.name + " atualizado.";
          addLog(draft, "inventário", message, person?.id);
        }
        return;
      }
      const result = mode === "transfer" && destination
        ? performItemAction(draft, ownerId, item.id, { type: "transfer", targetId: destination, quantity: count })
        : mode === "equip" && selectedSlot
          ? performItemAction(draft, ownerId, item.id, { type: "equip", slot: selectedSlot })
          : mode === "consume"
            ? performItemAction(draft, ownerId, item.id, { type: "consume", consumerId: consumerId || undefined })
            : mode === "prepare"
              ? performItemAction(draft, ownerId, item.id, { type: "prepare", quantity: count })
              : mode === "use"
                ? performItemAction(draft, ownerId, item.id, { type: "use", quantity: count })
                : mode === "recharge" && rechargeTargetId
                  ? performItemAction(draft, ownerId, item.id, { type: "recharge", targetId: rechargeTargetId })
                : mode === "fill-water"
                  ? performItemAction(draft, ownerId, item.id, { type: "fill-container", resource: "water", quantity: Math.min(amount, fillWaterMax) })
                : mode === "fill-fuel"
                  ? performItemAction(draft, ownerId, item.id, { type: "fill-container", resource: "fuel", quantity: Math.min(amount, fillFuelMax) })
                : mode === "empty-container"
                  ? performItemAction(draft, ownerId, item.id, { type: "empty-container" })
                : mode === "cart"
                  ? item.name === "Carrinho dobrável"
                    ? performItemAction(draft, ownerId, item.id, { type: item.cartDeployed ? "fold-cart" : "deploy-cart" })
                    : performItemAction(draft, ownerId, item.id, { type: "cart-store", quantity: count })
                : mode === "medication"
                  ? performItemAction(draft, ownerId, item.id, { type: "medication", quantity: count })
                  : mode === "stock"
                    ? performItemAction(draft, ownerId, item.id, { type: "stock", quantity: count })
                    : mode === "discard"
                      ? performItemAction(draft, ownerId, item.id, { type: "discard", quantity: count })
                      : { ok: false, message: "" };
      if (result.ok) message = result.message;
    });
    if (!message) { toast.error("A ação não foi concluída. Confira a quantidade, o limite do destino e o acesso às reservas."); return; }
    toast.success(message);
    close();
  }

  return <Dialog open={open} onOpenChange={openDialog}>
    <DialogTrigger asChild><Button size="sm" variant="outline" aria-label={`Ações de ${item.name}`}><ArrowLeftRight size={15} /> Ações</Button></DialogTrigger>
    <DialogContent className="inventory-dialog"><DialogHeader><DialogTitle className="inventory-action-title"><ItemArt name={item.name} category={current?.category ?? item.category} size="small" />{item.name}</DialogTitle>
      <DialogDescription>{ownerName(game, ownerId)} · {item.qty} unidade(s) · {item.load} espaço(s) por unidade · {item.condition ?? "Estado não registrado"}{batteryStateFor(item) ? ` · bateria ${batteryStateFor(item)?.toLowerCase()}` : ""}</DialogDescription></DialogHeader>
      {current && <details className="inventory-reference"><summary>Consultar efeito e prazo</summary>
        <dl>{current.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></details>}
      <div className="inventory-action-tabs">
        {targets.length > 0 && <button type="button" aria-pressed={mode === "transfer"} onClick={() => setMode("transfer")}>Transferir</button>}
        {slots.length > 0 && <button type="button" aria-pressed={mode === "equip"} onClick={() => setMode("equip")}>Equipar</button>}
        {provisionState.resource && provisionState.ready && <button type="button" aria-pressed={mode === "consume"} onClick={() => setMode("consume")}>Consumir</button>}
        {provisionState.resource && !provisionState.ready && (provisionState.requiresPreparation || provisionState.requiresVerification) &&
          <button type="button" aria-pressed={mode === "prepare"} onClick={() => setMode("prepare")}>{provisionState.requiresVerification ? "Verificar" : "Preparar"}</button>}
        {!selfOnly && countsAsMedication(item) && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)) && <button type="button" aria-pressed={mode === "medication"} onClick={() => setMode("medication")}>Medicamentos</button>}
        {!selfOnly && stockResource && (ownerId === "shared" ? atSharedStorage(game) : atSharedStorage(game, ownerId)) && <button type="button" aria-pressed={mode === "stock"} onClick={() => setMode("stock")}>Guardar nas reservas</button>}
        {canUse && <button type="button" aria-pressed={mode === "use"} onClick={() => setMode("use")}>Usar</button>}
        {rechargeTargets.length > 0 && <button type="button" aria-pressed={mode === "recharge"} onClick={() => setMode("recharge")}>Recarregar</button>}
        {fillWaterMax > 0 && <button type="button" aria-pressed={mode === "fill-water"} onClick={() => { setAmount(fillWaterMax); setMode("fill-water"); }}>Encher Água</button>}
        {fillFuelMax > 0 && <button type="button" aria-pressed={mode === "fill-fuel"} onClick={() => { setAmount(1); setMode("fill-fuel"); }}>Encher Combustível</button>}
        {containerOptions?.canUnloadAtStorage && <button type="button" aria-pressed={mode === "empty-container"} onClick={() => setMode("empty-container")}>Guardar conteúdo</button>}
        {(item.name === "Carrinho dobrável" || actionOptions.canStoreInCart) && <button type="button" aria-pressed={mode === "cart"} onClick={() => setMode("cart")}>Carrinho</button>}
        <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Editar</button>
        {actionOptions.canDiscard && <button type="button" aria-pressed={mode === "discard"} onClick={() => { setMode("discard"); setConfirmDiscard(false); }}>Deixar</button>}
      </div>
      {mode === "edit" && <><Pick label="Estado do item" value={conditionDraft} options={conditions} onChange={setConditionDraft} />
        {allowCorrection && <div className="inventory-corrections"><Counter compact label="Quantidade total" value={qtyDraft} min={1} max={99} onChange={setQtyDraft} />
          <Counter compact label="Carga por unidade" value={loadDraft} min={0} max={9} onChange={setLoadDraft} /></div>}
        <p className="roll-hint">As alterações só entram na ficha ao salvar.</p></>}
      {mode === "transfer" && destination && <Pick label="Destino" value={destination} options={targets} onChange={setTargetId} />}
      {mode === "transfer" && !destination && <p className="inventory-hint">Nenhum destino acessível neste local.</p>}
      {mode === "equip" && selectedSlot && <><Pick label="Espaço do kit" value={selectedSlot} options={slots.map(value => ({ value, label: slotLabels[value] }))} onChange={value => setSlot(value as EquipmentSlot)} />
        <p className="inventory-hint">{displaced.length ? `Vai para os itens guardados: ${displaced.join(" e ")}.` : "O espaço está livre."} Armas de duas mãos exigem a outra mão livre. Proteções conservam a armadura marcada.</p></>}
      {loadPreview && <div className={`inventory-preview ${loadPreview.carried > loadPreview.capacity ? "inventory-danger" : ""}`}><Backpack size={19} aria-hidden="true" /><span><b>{loadPreview.name} após a ação</b><small>{loadPreview.carried > loadPreview.capacity ? "Acima da capacidade — redistribua antes de viajar." : "Carga dentro da capacidade."}</small></span><strong>{loadPreview.carried}/{loadPreview.capacity}</strong></div>}
      {provisionState.resource && <div className="inventory-preview"><span><b>{provisionDisplay(item)}</b><small>{provisionState.expiresDay ? `Vence no amanhecer do dia ${provisionState.expiresDay}.` : provisionState.shelf ? `Validade: ${provisionShelfLabel(provisionState.shelf)}.` : "Sem prazo específico registrado."}</small></span></div>}
      {mode === "consume" && <><p className="inventory-hint">Consome apenas <b>1 porção</b>. O item continua no inventário enquanto ainda tiver conteúdo.</p>
        {ownerId === "shared" && sharedConsumers.length > 0 && <Pick label="Quem consome" value={consumerId} options={sharedConsumers.map(s => ({
          value: s.id,
          label: s.name + (provisionState.resource && provisionConsumedToday(game, s, provisionState.resource as DailyResource) ? " · já consumiu hoje" : ""),
        }))} onChange={setTargetId} />}
        {alreadyConsumed && <p className="inventory-hint inventory-warning">A necessidade diária deste recurso já foi registrada para {consumer?.name}. Consumir novamente gastará uma porção extra.</p>}</>}
      {mode === "prepare" && <div className="grid gap-2">
        <p className="inventory-hint">{provisionState.requiresVerification
          ? "A verificação agora respeita o método indicado no catálogo; água insegura pode exigir filtro, pastilhas ou fervura."
          : `Preparo: ${provision.preparation ?? "resolver em cena"}. Água, utensílios e fonte de calor são descontados/verificados quando exigidos.`}</p>
        {preparationCheck && <p className={`inventory-hint ${preparationCheck.ok ? "" : "inventory-danger"}`} role="status">{preparationCheck.message}</p>}
      </div>}
      {mode === "use" && <p className="inventory-hint">{catalogItemIsConsumable(item)
        ? "Consumível: desconta a unidade ao confirmar. O efeito indicado no catálogo é aplicado em cena."
        : "Uso reutilizável: o item permanece no inventário. Efeitos mecânicos explícitos, como Barulho do apito, são registrados automaticamente."}</p>}
      {mode === "recharge" && rechargeTargetId && <><Pick label="Aparelho" value={rechargeTargetId}
        options={rechargeTargets.map(target => ({ value: target.id, label: `${target.name} · bateria descarregada` }))} onChange={setTargetId} />
        <p className="inventory-hint">Consome 1 Kit de pilhas e registra a bateria do aparelho escolhido como carregada.</p></>}
      {mode === "fill-water" && <><Counter label={`Porções de Água · disponível ${containerOptions?.waterAvailable ?? 0}`} value={Math.min(amount, Math.max(1, fillWaterMax))} min={1} max={Math.max(1, fillWaterMax)} onChange={setAmount} compact />
        <p className="inventory-hint">O galão comporta até 4 porções de Água verificada. O recipiente continua ocupando apenas 1 espaço de carga.</p></>}
      {mode === "fill-fuel" && <p className="inventory-hint">Guarda 1 unidade de Combustível no galão. O conteúdo não adiciona carga além do recipiente.</p>}
      {mode === "empty-container" && <p className="inventory-hint">Devolve {containerOptions?.amount ?? 0} {containerOptions?.resource === "water" ? "porção(ões) de Água" : "unidade(s) de Combustível"} às reservas compartilhadas e mantém o galão vazio.</p>}
      {mode === "cart" && item.name === "Carrinho dobrável" && <div className="grid gap-3">
        <p className="inventory-hint">{item.cartDeployed
          ? item.cartItems?.length
            ? "O carrinho está aberto e usa as duas mãos. Retire todo o conteúdo antes de dobrá-lo."
            : "O carrinho está aberto e usa as duas mãos. Dobrá-lo faz o item voltar a ocupar 1 espaço."
          : "Abrir o carrinho guarda automaticamente armas empunhadas e passa a exigir as duas mãos enquanto ele estiver sendo conduzido."}</p>
        {item.cartDeployed && (item.cartItems?.length ?? 0) > 0 && <div className="grid gap-2">
          {item.cartItems!.map(nested => <div className="shared-inventory-row" key={nested.id}><div><b>{nested.qty}× {nested.name}</b><span>{nested.load} espaço(s) por unidade</span></div>
            <Button size="sm" variant="outline" onClick={() => {
              let result: ReturnType<typeof performItemAction> | null = null;
              edit(draft => { result = performItemAction(draft, ownerId, item.id, { type: "cart-remove", nestedItemId: nested.id, quantity: nested.qty }); });
              if (result?.ok) toast.success(result.message); else toast.error("Não foi possível retirar o item do carrinho.");
            }}>Retirar</Button></div>)}
        </div>}
      </div>}
      {mode === "cart" && item.name !== "Carrinho dobrável" && <p className="inventory-hint">Coloca {count}× {item.name} no carrinho aberto. O carrinho comporta até 4 espaços e sua carga é acompanhada separadamente da mochila.</p>}
      {mode === "medication" && <p className="inventory-hint">Cada unidade vira 1 Medicamentos nas reservas compartilhadas. Bolsa e estojo de antissepsia são consumidos; Caixa clínica completa deixa um Kit médico de campo reutilizável.</p>}
      {mode === "stock" && <p className="inventory-hint">Cada unidade física vira uma unidade nas reservas compartilhadas. O objeto sai do inventário para evitar contagem dupla.</p>}
      {mode === "discard" && <p className="inventory-hint inventory-danger">{confirmDiscard ? "Confirmar: as unidades serão retiradas da ficha e o descarte aparecerá no registro." : "Deixar para trás retira o item sem criar uma reserva nova no mapa."}</p>}
      {!["equip", "edit", "consume", "recharge", "fill-water", "fill-fuel", "empty-container"].includes(mode) && !(mode === "cart" && item.name === "Carrinho dobrável") && !(mode === "use" && !catalogItemIsConsumable(item)) &&
        <Counter label="Unidades" value={count} min={1} max={item.qty} onChange={setAmount} compact />}
      {mode === "transfer" && destination && <p className="roll-hint">{count}× {item.name} → {ownerName(game, destination)}. Permanecem {item.qty - count} na origem.</p>}
      <DialogFooter><Button variant="outline" onClick={close}>Cancelar</Button>
        <Button variant={mode === "discard" ? "destructive" : "default"} disabled={(mode === "transfer" && !destination) || (mode === "equip" && !selectedSlot)
          || (mode === "consume" && (!provisionState.ready || (ownerId === "shared" && !consumerId)))
          || (mode === "prepare" && (!(provisionState.requiresPreparation || provisionState.requiresVerification) || preparationCheck?.ok === false))
          || (mode === "medication" && game.shelter.medications + count > 99)
          || (mode === "stock" && (!stockResource || game.shelter[stockResource] + count > 99))
          || (mode === "recharge" && !rechargeTargetId)
          || (mode === "fill-water" && fillWaterMax < 1)
          || (mode === "fill-fuel" && fillFuelMax < 1)
          || (mode === "empty-container" && !containerOptions?.canUnloadAtStorage)
          || (mode === "cart" && item.name === "Carrinho dobrável" && item.cartDeployed && (item.cartItems?.length ?? 0) > 0)
          || (mode === "cart" && item.name !== "Carrinho dobrável" && !actionOptions.canStoreInCart)} onClick={perform}>
          {mode === "edit" ? "Salvar alterações" : mode === "transfer" ? "Transferir" : mode === "equip" ? "Equipar"
            : mode === "consume" ? "Consumir 1 porção" : mode === "prepare" ? (provisionState.requiresVerification ? "Confirmar verificação" : "Confirmar preparo")
            : mode === "cart" ? item.name === "Carrinho dobrável" ? (item.cartDeployed ? "Dobrar carrinho" : "Abrir carrinho") : "Colocar no carrinho"
            : mode === "medication" ? "Registrar Medicamentos" : mode === "stock" ? "Guardar nas reservas" : mode === "use" ? "Usar" : mode === "recharge" ? "Recarregar" : mode === "fill-water" ? "Encher galão" : mode === "fill-fuel" ? "Guardar combustível" : mode === "empty-container" ? "Guardar conteúdo" : confirmDiscard ? "Confirmar descarte" : "Deixar para trás"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function ProvisionTransferDialog({ game, edit, survivorId }: { game: GameState; edit: Edit; survivorId: string }) {
  const [open, setOpen] = useState(false);
  const [resource, setResource] = useState<"food" | "water" | "ammo">("food");
  const [from, setFrom] = useState(survivorId);
  const [to, setTo] = useState("shared");
  const [amount, setAmount] = useState(1);
  const [ammoKind, setAmmoKind] = useState<AmmunitionType>("Pistola");
  const choices = [...game.survivors.map(s => ({ value: s.id, label: s.name })),
    ...(atSharedStorage(game) ? [{ value: "shared", label: ownerName(game, "shared") }] : [])];
  const sourceId = choices.some(x => x.value === from) ? from : survivorId;
  const targetId = choices.some(x => x.value === to) && to !== sourceId ? to : choices.find(x => x.value !== sourceId)?.value ?? "";
  const sourcePerson = game.survivors.find(s => s.id === sourceId);
  const selectedAmmoType = ammoKind as string;
  const source = sourceId === "shared"
    ? resource === "ammo" ? ammunitionCount(game.shelter.inventory, ammoKind, true) : game.shelter[resource]
    : resource === "ammo" ? ammunitionCount(sourcePerson?.inventory, ammoKind, true) : sourcePerson?.[resource] ?? 0;
  const count = Math.max(1, Math.min(99, amount));
  const error = provisionTransferError(game, sourceId, targetId, resource, count, selectedAmmoType);
  let loadPreview: ReturnType<typeof survivorStats> | null = null;
  if (!error && targetId !== "shared") {
    const preview = structuredClone(game);
    transferProvisions(preview, sourceId, targetId, resource, count, selectedAmmoType);
    const receiver = preview.survivors.find(s => s.id === targetId);
    if (receiver) loadPreview = survivorStats(receiver);
  }
  function move() {
    let moved = false;
    edit(draft => {
      moved = transferProvisions(draft, sourceId, targetId, resource, count, selectedAmmoType);
      if (!moved) return;
      addLog(draft, "provisões", ownerName(draft, sourceId) + " → " + ownerName(draft, targetId) + ": " + count + " " +
        (resource === "ammo" ? `unidade(s) de Munição de ${selectedAmmoType}` : resource === "food" ? "porção(ões) de comida" : "porção(ões) de água") + ".");
    });
    if (!moved) { toast.error("A transferência não foi concluída. Confira as reservas e tente novamente."); return; }
    toast.success("Provisões transferidas.", { description: `${ownerName(game, sourceId)} → ${ownerName(game, targetId)}` });
    setOpen(false); setAmount(1);
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline"><ArrowLeftRight size={16} /> Transferir provisões</Button></DialogTrigger>
    <DialogContent className="inventory-dialog"><DialogHeader><DialogTitle>Transferir provisões</DialogTitle>
      <DialogDescription>Move porções soltas e unidades físicas de munição entre fichas e reservas compartilhadas. Munição comprometida por disparos na cena não pode ser transferida.</DialogDescription></DialogHeader>
      <Pick label="Recurso" value={resource} options={[{ value: "food", label: "Comida · porções soltas" }, { value: "water", label: "Água · porções soltas" }, { value: "ammo", label: "Munição · unidades físicas" }]} onChange={value => setResource(value as typeof resource)} />
      <div className="inventory-search"><Pick label="De" value={sourceId} options={choices} onChange={setFrom} />
        <Pick label="Para" value={targetId} options={choices.filter(x => x.value !== sourceId)} onChange={setTo} /></div>
      {resource === "ammo" && <Pick label="Tipo de munição" value={ammoKind} options={ammunitionTypes} onChange={value => setAmmoKind(value as AmmunitionType)} />}
      <Counter label={"Quantidade · disponível " + source} value={count} min={1} max={Math.max(1, Math.min(99, source))} onChange={setAmount} compact />
      {resource === "ammo" && <p className="inventory-hint">Tipo movimentado: <b>{selectedAmmoType}</b>. Cada unidade é um item real; até quatro do mesmo tipo ocupam 1 espaço de carga.</p>}
      {error && <p className="inventory-hint inventory-danger" role="status">{error}</p>}
      {loadPreview && <div className={`inventory-preview ${loadPreview.carried > loadPreview.capacity ? "inventory-danger" : ""}`}><Backpack size={19} aria-hidden="true" /><span><b>Carga no destino após a transferência</b><small>{loadPreview.carried > loadPreview.capacity ? "Acima da capacidade; redistribua antes de viajar." : "Dentro da capacidade."}</small></span><strong>{loadPreview.carried}/{loadPreview.capacity}</strong></div>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={Boolean(error)} onClick={move}>Transferir</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
