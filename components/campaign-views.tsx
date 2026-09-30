"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Hammer, House, LayoutGrid, List, Moon, Package, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Counter, Field, Pick } from "@/components/game-controls";
import { AddItemDialog, ItemActionsDialog } from "@/components/inventory-workflow";
import { ItemContextMenu } from "@/components/item-context-menu";
import { ItemArt } from "@/components/item-art";
import { ShelterMoveDialog } from "@/components/shelter-move";
import { DayCloseDialog } from "@/components/day-close-dialog";
import { FormerShelterProjects, ShelterProjectsManager } from "@/components/shelter-project-manager";
import { ShelterVisualDashboard } from "@/components/shelter-dashboard";
import { RuntimeErrorBoundary } from "@/components/runtime-error-boundary";
import { ammunitionTypes, content, establishShelter, recoverFormerAmmo, recoverFormerStock, setShelterAmmoCount, shelterAmmoCount, shelterPopulationBreakdown, survivorPositionGroups, survivorsAtHex, type GameState } from "@/lib/game";
import { shelterMetrics } from "@/lib/shelter-projects";
import { atSharedStorage, batteryStateFor, catalogForItem } from "@/lib/inventory";
import { provisionBreakdown, provisionDisplay, provisionItemInfo, provisionShelfLabel } from "@/lib/provision-items";
import { adjustProvisionCount } from "@/lib/provisions";
import { createId } from "@/lib/id";

type Edit = (fn: (draft: GameState) => void) => void;

export function ShelterPanel({ game, edit, playerPreview, playerSurvivorId }: { game: GameState; edit: Edit; playerPreview: boolean; playerSurvivorId?: string | null }) {
  const [shelterNotes, setShelterNotes] = useState(game.shelter.notes);
  const [shelterName, setShelterName] = useState(game.shelter.name);
  const [cacheRecipient, setCacheRecipient] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [convertRole, setConvertRole] = useState("");
  const s = game.shelter;
  const hasShelter = s.hex !== null;
  const sharedAccessible = atSharedStorage(game);
  const currentSector = game.hexes[game.partyHex]?.sector?.name ?? `Hex ${game.partyHex}`;
  const homeSector = s.hex ? game.hexes[s.hex]?.sector?.name ?? `Hex ${s.hex}` : null;
  const visitedCache = (game.formerShelters ?? []).find(site => Boolean(site.hex && survivorsAtHex(game, site.hex).length > 0));
  const cacheVisitors = visitedCache?.hex ? survivorsAtHex(game, visitedCache.hex) : [];
  const cacheResidents = visitedCache?.hex ? game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.home === visitedCache.hex) : [];
  const recipient = cacheVisitors.find(person => person.id === cacheRecipient) ?? cacheVisitors[0];
  const shelterFood = provisionBreakdown(s, "food");
  const shelterWater = provisionBreakdown(s, "water");
  const population = shelterPopulationBreakdown(game);
  const namedResidents = population.namedResidents;
  const metrics = shelterMetrics(s, game);
  const travelGroups = survivorPositionGroups(game);

  useEffect(() => { setShelterNotes(s.notes); }, [s.notes]);
  useEffect(() => { setShelterName(s.name); }, [s.name]);

  const stocks: { key: keyof typeof s; label: string; unit: string; max: number }[] = [
    { key: "food", label: "Comida", unit: "porções", max: 999 },
    { key: "water", label: "Água", unit: "porções", max: 999 },
    { key: "medications", label: "Medicamentos", unit: "tratamentos", max: 99 },
    { key: "fuel", label: "Combustível", unit: "cargas", max: 99 },
    { key: "parts", label: "Peças", unit: "unidades", max: 99 },
  ];

  const resourcesContent = <>
    <div className="flex items-center gap-2 mb-3"><Package size={18} /><h3 className="section-title">{hasShelter ? "Estoque do abrigo" : "Reservas do grupo"}</h3></div>
    <p className="intro-line mb-4">Comida e Água são contadas em porções: quatro porções formam uma unidade. Não desconte duas vezes o que saiu na mochila. {hasShelter ? "As reservas ficam na base." : "Registre aqui só o que o grupo transporta; confira a carga na ficção."}</p>
    <div className="shelter-resource-grid">
      {stocks.map(stock => {
        const provision = stock.key === "food" ? shelterFood : stock.key === "water" ? shelterWater : null;
        return <div key={stock.key} className="metric shelter-resource-card">
          {provision && <div><span className="smallcaps subtle">{stock.label} disponível</span><strong>{provision.total}</strong><p className="text-xs subtle mt-2">{provision.loose} soltas · {provision.itemsReady} em itens{provision.itemsWaiting ? ` · ${provision.itemsWaiting} aguardando preparo/verificação` : ""}</p></div>}
          {!provision && playerPreview && <div><span className="smallcaps subtle">{stock.label}</span><strong>{String(s[stock.key])}</strong></div>}
          {!playerPreview && <Counter compact editable quickStep={["food", "water"].includes(stock.key) ? 4 : undefined}
            label={provision ? `${stock.label} solta` : stock.label} value={Number(s[stock.key])} max={stock.max}
            onChange={value => edit(draft => {
              if (stock.key === "food" || stock.key === "water") adjustProvisionCount(draft.shelter, stock.key, value);
              else (draft.shelter[stock.key] as number) = value;
            })} />}
          <p className="text-xs subtle mt-2">{stock.unit}{provision ? " · itens físicos são contados automaticamente no total acima" : ""}</p>
        </div>;
      })}
    </div>

    <div className="divider" />
    <h3 className="section-title">Munição por tipo</h3>
    <p className="intro-line mt-2 mb-3">Cada carga mantém seu tipo. Armas consomem automaticamente 1 carga compatível na primeira ação de disparo da cena.</p>
    <div className="shelter-ammo-grid">
      {ammunitionTypes.map(type => <div className="metric" key={type}>
        {playerPreview ? <div><span className="smallcaps subtle">{type}</span><strong>{shelterAmmoCount(s, type)}</strong></div>
          : <Counter compact editable label={type} value={shelterAmmoCount(s, type)} max={99}
            onChange={value => edit(draft => { setShelterAmmoCount(draft.shelter, type, value); })} />}
        <p className="text-xs subtle mt-2">carga(s)</p>
      </div>)}
    </div>
    {(s.provisionLots ?? []).length > 0 && <p className="character-rule-note mt-3">Lotes com prazo: {s.provisionLots!.map(lot => `${lot.qty} ${lot.resource === "food" ? "comida" : "água"} (${lot.label}) → amanhecer do dia ${lot.expiresDay}`).join(" · ")}.</p>}

    <div className="divider" />
    <div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="section-title">Itens compartilhados</h3>
      {sharedAccessible && !playerPreview && <AddItemDialog game={game} edit={edit} ownerId="shared" />}</div>
    <p className="intro-line mt-2">Objetos físicos continuam identificados aqui. Alimentos e bebidas prontos contribuem automaticamente para o total disponível sem desaparecer do inventário; itens pendentes de preparo/verificação aparecem separados.</p>
    {!sharedAccessible && <p className="character-rule-note">O grupo está fora do abrigo. Volte ao hex da base para mover os itens compartilhados.</p>}
    <div className="shared-inventory-list">
      {(s.inventory ?? []).length === 0 ? <p className="character-empty-list">Nenhum objeto guardado no depósito.</p>
        : (s.inventory ?? []).map(item => {
          const provisionState = provisionItemInfo(item);
          const row = <div className={`shared-inventory-row ${sharedAccessible && !playerPreview ? "inventory-context-target" : ""}`}><div className="shared-inventory-entry"><ItemArt name={item.name} category={catalogForItem(item)?.category ?? item.category} /><div><b>{item.name}</b><span>{provisionState.resource ? provisionDisplay(item) : `${catalogForItem(item)?.category ?? item.category ?? "Outros"} · ${item.qty}× · carga ${item.load} cada · ${item.condition ?? "sem estado"}${batteryStateFor(item) ? ` · bateria ${batteryStateFor(item)?.toLowerCase()}` : ""}`}</span></div></div>
            {sharedAccessible && !playerPreview && <ItemActionsDialog game={game} edit={edit} ownerId="shared" item={item} allowCorrection />}</div>;
          return sharedAccessible && !playerPreview
            ? <ItemContextMenu key={item.id} game={game} edit={edit} ownerId="shared" item={item}>{row}</ItemContextMenu>
            : <div key={item.id}>{row}</div>;
        })}
    </div>
    {(s.inventory ?? []).length > 0 && sharedAccessible && !playerPreview && <p className="roll-hint inventory-context-hint">No computador, clique com o botão direito em um item para usar ações rápidas.</p>}

    {hasShelter && !playerPreview && <><div className="divider" />
      <div className="shelter-manual-grid">
        <Counter label="Ajuste manual · Segurança" value={s.manualAdjustments?.security ?? 0} min={-3} max={9} onChange={value => edit(d => { d.shelter.manualAdjustments ??= { security: 0, energy: 0, comfort: 0 }; d.shelter.manualAdjustments.security = value; d.shelter.security = (d.shelter.hex ? 1 : 0) + value; })} />
        <Counter label="Ajuste manual · Energia" value={s.manualAdjustments?.energy ?? 0} min={-3} max={9} onChange={value => edit(d => { d.shelter.manualAdjustments ??= { security: 0, energy: 0, comfort: 0 }; d.shelter.manualAdjustments.energy = value; d.shelter.energy = value; })} />
        <Counter label="Ajuste manual · Conforto" value={s.manualAdjustments?.comfort ?? 0} min={-3} max={9} onChange={value => edit(d => { d.shelter.manualAdjustments ??= { security: 0, energy: 0, comfort: 0 }; d.shelter.manualAdjustments.comfort = value; d.shelter.comfort = value; })} />
      </div>
      <label className="inventory-ready mt-3"><input type="checkbox" checked={Boolean(s.coldStorage)} disabled={metrics.energy < 1}
        onChange={event => edit(d => { d.shelter.coldStorage = event.target.checked; })} />
        <span>Refrigeração funcional: há equipamento de frio e Energia 1+. Conserva refeições congeladas físicas no depósito; depois do preparo, as porções vencem no próximo amanhecer.</span></label>
    </>}
  </>;

  const formerShelterContent = visitedCache && <section className="panel panel-pad">
    <p className="dossier-title">Hex {visitedCache.hex} / Depósito antigo</p>
    <h3 className="section-title mt-1">{visitedCache.name}</h3>
    <p className="intro-line mt-2">Há sobreviventes neste local. Retire os mantimentos e itens desejados apenas com quem está presente neste hex.</p>
    {!playerPreview && recipient && <Pick label="Quem vai carregar" value={recipient.id} options={cacheVisitors.map(person => ({ value: person.id, label: person.name }))} onChange={setCacheRecipient} />}
    <div className="grid gap-2 mt-3">
      {([["food", "Comida"], ["water", "Água"], ["medications", "Medicamentos"], ["fuel", "Combustível"], ["parts", "Peças"]] as const).map(([key, label]) =>
        <div key={key} className="shared-inventory-row"><div><b>{label}</b><span>{visitedCache[key]} {key === "food" || key === "water" ? "porção(ões)" : key === "fuel" ? "carga(s)" : "unidade(s)"}</span></div>
          {visitedCache[key] > 0 && recipient && !playerPreview && <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => edit(d => {
              if (!recoverFormerStock(d, visitedCache.hex!, recipient.id, key, 1)) toast.error("Não foi possível retirar. Verifique o limite do contador.");
            })}>Retirar 1</Button>
            {visitedCache[key] > 1 && <Button size="sm" variant="outline" onClick={() => edit(d => {
              if (!recoverFormerStock(d, visitedCache.hex!, recipient.id, key, visitedCache[key])) toast.error("Não coube no contador deste sobrevivente.");
            })}>Retirar tudo</Button>}
          </div>}</div>)}
      {ammunitionTypes.filter(type => shelterAmmoCount(visitedCache, type) > 0).map(type =>
        <div key={`ammo-${type}`} className="shared-inventory-row"><div><b>Munição · {type}</b><span>{shelterAmmoCount(visitedCache, type)} carga(s)</span></div>
          {recipient && !playerPreview && <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => edit(d => {
              if (!recoverFormerAmmo(d, visitedCache.hex!, recipient.id, type, 1)) toast.error("Não foi possível retirar. Verifique o tipo de munição e o contador do sobrevivente.");
            })}>Retirar 1</Button>
            {shelterAmmoCount(visitedCache, type) > 1 && <Button size="sm" variant="outline" onClick={() => edit(d => {
              const total = shelterAmmoCount(d.formerShelters?.find(site => site.hex === visitedCache.hex!) ?? visitedCache, type);
              if (!recoverFormerAmmo(d, visitedCache.hex!, recipient.id, type, total)) toast.error("Não foi possível retirar todas as cargas deste tipo.");
            })}>Retirar tudo</Button>}
          </div>}</div>)}
      {(visitedCache.inventory ?? []).map(item => <div key={item.id} className="shared-inventory-row"><div className="shared-inventory-entry"><ItemArt name={item.name} category={item.category} /><div><b>{item.qty}× {item.name}</b><span>{item.load * item.qty} carga</span></div></div>
        {recipient && !playerPreview && <Button size="sm" variant="outline" onClick={() => edit(d => {
          if (!recoverFormerStock(d, visitedCache.hex!, recipient.id, "food", 0, item.id)) toast.error("O item já não está neste depósito.");
        })}>Retirar</Button>}</div>)}
    </div>
    <p className="text-sm subtle mt-3">Peças, combustível e medicamentos retirados viram itens de carga 1 no inventário. Ao chegar à base ativa, use Ações → Guardar nas reservas para converter de volta.</p>
    <FormerShelterProjects shelter={visitedCache} />
    {cacheResidents.length > 0 && <div className="former-shelter-projects"><b>Comunidade que ficou nesta base</b>{cacheResidents.map(npc => <span key={npc.id}>{npc.name}{npc.role ? ` · ${npc.role}` : ""}{npc.hex !== visitedCache.hex ? ` · em campo no hex ${npc.hex}` : ""}</span>)}</div>}
  </section>;

  const communityContent = <section className="panel panel-pad">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="dossier-title">Comunidade</p><h3 className="section-title mt-1">Pessoas e necessidades</h3></div><span className="tag">{population.present}/{metrics.capacity} presentes</span></div>
    <div className="shelter-community-counts mt-4"><span><b>{population.residents}</b> residentes</span><span><b>{population.present}</b> presentes agora</span><span><b>{population.field}</b> residente(s) em campo</span></div>
    <p className="text-sm mt-3">{population.unidentifiedResidents} morador(es) não identificado(s) e {namedResidents.length} pessoa(s) identificada(s) pertencem a esta base. Pessoas mortas ou desaparecidas não entram nas contagens ativas.</p>
    {namedResidents.length > 0 && <div className="shelter-resident-grid mt-4">{namedResidents.map(npc => <div className="list-card text-sm" key={npc.id}><b>{npc.name}</b>{npc.role && <span className="subtle"> · {npc.role}</span>}{npc.hex !== s.hex && <p className="mt-1 text-xs subtle">Em campo no hex {npc.hex}</p>}{npc.duty && <p className="mt-1 text-xs subtle">Função livre: {npc.duty}</p>}</div>)}</div>}
    {!playerPreview && s.residents > 0 && <Dialog open={convertOpen} onOpenChange={setConvertOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className="mt-4" onClick={() => { setConvertName(""); setConvertRole(""); }}>Identificar um morador</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>Converter morador em NPC</DialogTitle><DialogDescription>Isso reduz apenas a contagem sem nome e cria uma pessoa identificada; nenhum nome é inventado automaticamente.</DialogDescription></DialogHeader>
        <div className="grid gap-3"><Field label="Nome" value={convertName} onChange={setConvertName} placeholder="Nome da pessoa" /><Field label="Função / papel" value={convertRole} onChange={setConvertRole} placeholder="Opcional" /></div>
        <DialogFooter><Button variant="outline" onClick={() => setConvertOpen(false)}>Cancelar</Button><Button disabled={!convertName.trim()} onClick={() => {
          const name = convertName.trim();
          edit(draft => {
            if (!draft.shelter.hex || draft.shelter.residents < 1) return;
            draft.shelter.residents -= 1;
            draft.npcs.push({ id: createId(), name, role: convertRole.trim(), description: "", notes: "", publicNotes: "", hex: draft.shelter.hex, home: draft.shelter.hex, status: "Bem", infection: "Saudável", disposition: "Neutro", skills: [], duty: "", active: true });
          });
          setConvertOpen(false);
          toast.success("Morador identificado", { description: `${name} agora tem uma ficha de NPC.` });
        }}>Criar NPC</Button></DialogFooter>
      </DialogContent></Dialog>}
  </section>;

  const routineContent = <div className="shelter-routine-grid">
    <section className="panel panel-pad">
      <p className="dossier-title">Rotina / sobrevivência</p><h3 className="section-title mt-1">Anoitecer e provisões</h3>
      <p className="intro-line mt-3">Cada pessoa precisa de uma porção de Comida e uma de Água por dia. O consumo pessoal registrado na ficha é excluído da sugestão. Ao fechar o dia, o sistema usa porções soltas e, se necessário, itens físicos prontos das reservas compartilhadas.</p>
      {!playerPreview && <DayCloseDialog game={game} edit={edit} label="Encerrar dia" className="mt-4" />}
      <p className="text-xs subtle mt-3">As escolhas e os efeitos de descanso ficam na ficha de cada sobrevivente; encerrar o dia cuida apenas da rotina diária e das provisões.</p>
    </section>
    {hasShelter && <section className="panel panel-pad">
      <p className="dossier-title">Base atual</p><h3 className="section-title mt-1">Mudança e abandono</h3>
      <p className="intro-line mt-3">O abrigo está em {homeSector}. O grupo principal está em {currentSector}. Ao abandonar a base, o que não for transportado permanece registrado como depósito antigo.</p>
      {!playerPreview && <ShelterMoveDialog game={game} edit={edit} mode="abandon" />}
    </section>}
  </div>;

  if (!hasShelter) return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="panel panel-pad">
      <div><p className="dossier-title">Grupo / hex {game.partyHex}</p><h2 className="page-title mt-1">Sem abrigo</h2>
        <p className="intro-line mt-2">O grupo principal está em {currentSector}. Ainda não há base fixa; escolha um lugar explorado para estabelecer uma.</p></div>
      {!playerPreview && <div className="mt-5 list-card">
        <p className="text-sm">Estabelecer uma base aqui não consome tempo automaticamente: resolva segurança, acesso e transporte na ficção.</p>
        <Button className="mt-3" onClick={() => {
          let established = false;
          edit(draft => { established = establishShelter(draft, draft.partyHex); });
          if (established) toast.success("Abrigo estabelecido", { description: `Base registrada em ${currentSector}.` });
          else toast.error("Não foi possível estabelecer o abrigo.");
        }}><House /> Estabelecer abrigo aqui</Button>
      </div>}
      <div className="divider" />
      {resourcesContent}
    </section>
    <aside>{routineContent}</aside>
  </div>;

  return <div className="shelter-page">
    <section className="panel shelter-hero-panel">
      <div className="shelter-hero-copy">
        <p className="dossier-title">Abrigo / hex {s.hex}</p>
        <h2 className="page-title">{s.name}</h2>
        <p>{homeSector}. Grupo principal em {currentSector}.</p>
        {travelGroups.length > 1 && <small>Grupos em campo: {travelGroups.map(group => `Hex ${group.hex} — ${group.members.map(person => person.name).join(", ")}`).join(" · ")}</small>}
      </div>
      <div className="shelter-hero-badges">
        <span className="tag">{population.present}/{metrics.capacity} pessoas</span>
        <span className="tag">Segurança {metrics.security}</span>
        <span className="tag">Energia {metrics.energy}</span>
      </div>
    </section>

    <Tabs defaultValue="overview" className="shelter-section-tabs">
      <TabsList className="shelter-main-tabs">
        <TabsTrigger value="overview"><House size={16} /> Visão geral</TabsTrigger>
        <TabsTrigger value="resources"><Package size={16} /> Recursos</TabsTrigger>
        <TabsTrigger value="community"><Users size={16} /> Moradores</TabsTrigger>
        <TabsTrigger value="construction"><Hammer size={16} /> Construção</TabsTrigger>
        <TabsTrigger value="routine"><Moon size={16} /> Rotina</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="shelter-tab-content">
        <ShelterVisualDashboard game={game} />
        {!playerPreview && <section className="panel panel-pad shelter-overview-admin">
          <div className="shelter-admin-heading"><div><p className="dossier-title">Administração</p><h3 className="section-title mt-1">Configuração rápida</h3></div><p className="text-xs subtle">Detalhes administrativos ficam fora da planta para manter a visão geral limpa.</p></div>
          <div className="shelter-admin-grid">
            <div><Field label="Nome do abrigo" value={shelterName} onChange={setShelterName} placeholder="Ex.: Escola das Mangueiras" />
              <Button size="sm" variant="outline" className="mt-2" disabled={!shelterName.trim() || shelterName.trim() === s.name}
                onClick={() => {
                  const name = shelterName.trim().slice(0, 80);
                  edit(draft => { draft.shelter.name = name; });
                  toast.success("Nome do abrigo atualizado", { description: name });
                }}>Salvar nome</Button></div>
            <Counter compact label="Capacidade-base" value={s.baseCapacity ?? s.capacity} min={1} max={99}
              onChange={value => edit(draft => { draft.shelter.baseCapacity = value; draft.shelter.capacity = value; })} />
            <Counter compact label="Moradores não identificados" value={s.residents} max={99}
              onChange={value => edit(draft => { draft.shelter.residents = value; })} />
          </div>
          <div className="shelter-notes-row">
            <Field label="Notas do abrigo" value={shelterNotes} onChange={setShelterNotes} multiline />
            <Button size="sm" variant="outline" onClick={() => {
              edit(draft => { draft.shelter.notes = shelterNotes.trim(); });
              toast.success("Notas do abrigo salvas.");
            }}>Salvar notas</Button>
          </div>
        </section>}
        {playerPreview && s.notes && <section className="panel panel-pad"><p className="dossier-title">Notas do abrigo</p><p className="text-sm mt-2 leading-relaxed">{s.notes}</p></section>}
      </TabsContent>

      <TabsContent value="resources" className="shelter-tab-content">
        <section className="panel panel-pad">{resourcesContent}</section>
        {formerShelterContent}
      </TabsContent>

      <TabsContent value="community" className="shelter-tab-content">
        {communityContent}
      </TabsContent>

      <TabsContent value="construction" className="shelter-tab-content">
        <RuntimeErrorBoundary title="A seção Construção encontrou um problema">
          <ShelterProjectsManager game={game} edit={edit} playerPreview={playerPreview} playerSurvivorId={playerSurvivorId} />
        </RuntimeErrorBoundary>
      </TabsContent>

      <TabsContent value="routine" className="shelter-tab-content">
        {routineContent}
      </TabsContent>
    </Tabs>
  </div>;
}

export function ReferencePanel() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const categories = useMemo(() => ["Todas", ...new Set(content.catalog.map(i => i.category))], []);
  const matches = content.catalog.filter(item => (category === "Todas" || item.category === category)
    && `${item.name} ${item.fields.map(f=>f.value).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const visible = matches.slice((page - 1) * pageSize, page * pageSize);

  return <div className="panel panel-pad reference-panel">
    <Tabs defaultValue="itens">
      <TabsList className="mb-5 max-w-full overflow-x-auto reference-tabs"><TabsTrigger value="itens"><Package /> Itens</TabsTrigger>
        <TabsTrigger value="ameacas"><ShieldAlert /> Ameaças</TabsTrigger>
        <TabsTrigger value="procedimentos"><BookOpen /> Procedimentos</TabsTrigger></TabsList>
      <TabsContent value="itens">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4"><div><h2 className="section-title">Catálogo de exploração</h2>
          <p className="intro-line mt-1">{content.catalog.length} itens do apêndice. A carga e os efeitos seguem a alfa.</p></div>
          <span className="tag">{matches.length} resultados</span></div>
        <div className="reference-controls">
          <Field label="Buscar pelo nome ou efeito" value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="Água, lanterna, mochila..." />
          <div className="reference-view" role="group" aria-label="Visualização do catálogo">
            <Button size="sm" variant={view === "grid" ? "default" : "outline"} aria-label="Visualizar em grade" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={16} /></Button>
            <Button size="sm" variant={view === "list" ? "default" : "outline"} aria-label="Visualizar em lista" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} /></Button>
          </div>
        </div>
        <div className="reference-categories" role="group" aria-label="Filtrar por categoria">
          {categories.map(value => <button type="button" key={value} className="reference-category" aria-pressed={category === value}
            onClick={() => { setCategory(value); setPage(1); }}>{value}</button>)}
        </div>
        <div className={`reference-results ${view === "list" ? "is-list" : ""}`}>
          {visible.map((item,index) => <Dialog key={`${item.category}-${item.name}-${index}`}>
            <DialogTrigger asChild><button type="button" className="reference-item" aria-label={`Ver detalhes de ${item.name}`}>
              {item.category !== "Consulta antes de sair e ao retornar" && <ItemArt name={item.name} category={item.category} size="large" />}
              <span className="reference-item-copy"><span className="dossier-title">{item.category}</span><strong>{item.name}</strong>
                <span className="reference-item-excerpt">{item.fields.filter(field => field.value).slice(0,2)
                  .map(field => `${field.label}: ${field.value}`).join(" · ") || "Abra para consultar os detalhes."}</span></span>
              <ChevronRight size={18} className="reference-item-arrow" aria-hidden="true" />
            </button></DialogTrigger>
            <DialogContent className="reference-detail"><DialogHeader><p className="dossier-title">{item.category}</p><DialogTitle>{item.name}</DialogTitle>
              <DialogDescription>Dados completos do item no apêndice da campanha.</DialogDescription></DialogHeader>
              <dl>{item.fields.filter(field => field.value).map((field,i) => <div key={i}><dt>{field.label}</dt><dd>{field.label === "Prazo" ? provisionShelfLabel(field.value) : field.value}</dd></div>)}</dl>
            </DialogContent>
          </Dialog>)}
        </div>
        {matches.length === 0 && <p className="intro-line py-8">Nenhum item corresponde à busca.</p>}
        {matches.length > pageSize && <nav className="reference-pagination" aria-label="Páginas do catálogo">
          <span>Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, matches.length)} de {matches.length}</span>
          <div><Button size="sm" variant="outline" disabled={page === 1} aria-label="Página anterior" onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /> Anterior</Button>
            <span aria-live="polite">{page} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={page === pageCount} aria-label="Próxima página" onClick={() => setPage(value => value + 1)}>Próxima <ChevronRight size={16} /></Button></div>
        </nav>}
      </TabsContent>
      <TabsContent value="ameacas">
        <div className="mb-4"><h2 className="section-title">Adversários e perigos · nível 1</h2>
          <p className="intro-line mt-1">Ataques comuns de infectados não causam Exposição. Mordida requer a oportunidade indicada na característica.</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {content.adversaries.map(a => <article key={a.name} className="list-card text-sm leading-relaxed">
            <p className="dossier-title">{a.name}</p><p className="mt-2">{a.intro}</p>
            <p className="mt-2 font-bold">Dificuldade {a.stats}</p>{a.attack && <p className="mt-1"><b>ATQ</b> {a.attack}</p>}
            {a.features.map((f,i) => <p key={i} className="mt-2 border-t pt-2">{f}</p>)}
          </article>)}
        </div>
      </TabsContent>
      <TabsContent value="procedimentos">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="list-card leading-relaxed"><h2 className="section-title">Rolagem de ação</h2>
            <p className="mt-2">Declare objetivo, Dificuldade e risco. Role Hope d12 + Fear d12 + atributo e modificadores. Igualar a Dificuldade é sucesso. Dados iguais: crítico, sucesso automático, +1 Hope e −1 Stress.</p>
            <p className="mt-2">Hope dominante concede 1 Hope. Fear dominante concede 1 Fear ao mestre; sucesso com Fear preserva o objetivo, com uma complicação. Reações não geram recursos.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Buscar algo específico</h2>
            <p className="mt-2">Pergunte <b>o que procuram, para quê e onde</b>. Mostre sinais, quantidade possível, tempo e risco antes da escolha. Objeto acessível à vista não exige busca. Setor comum: 30 minutos; área extensa: 1 hora. Role apenas se houver risco interessante.</p>
            <p className="mt-2">Busca específica não recebe d12 extra. Um setor recebe uma busca completa; registre o que foi retirado.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Infestação e eventos</h2>
            <p className="mt-2">Infestação 0–5 mede pressão persistente. Fixe o nível após observar sinais; um d6 de movimento por hex e expedição só quando a posição incerta importar. Eventos B3 dependem de gatilho. Uma causa duradoura pode mudar o nível em 1 por incidente.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Barulho</h2>
            <p className="mt-2">Régua 0–5 por cena. 1–2: sinais de atenção. 3–4: ameaça próxima investiga, com origem e tempo anunciados. 5: mostre uma saída; a ameaça chega se o grupo permanecer para outra ação exposta. Silêncio protegido por 10 minutos reduz 2 uma vez na cena.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Munição e carga</h2>
            <p className="mt-2">Uma carga compatível cobre os disparos de uma cena para uma pessoa. Risco de Barulho ocorre a cada ação de disparo. Capacidade pessoal básica 3 espaços; mochila urbana +2. Arma ativa, proteção vestida e até duas porções pessoais de cada recurso nos bolsos ocupam 0.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Exposição</h2>
            <p className="mt-2">Somente Mordida anunciada contra alvo Restrito ou indefeso. A vítima escolhe reação Agilidade 12 ou marca Armadura que cubra o contato antes de rolar. Exposto tem 2 horas para uma tentativa com 1 Medicamentos, água limpa e Conhecimento 13. Depois, progride ao amanhecer.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Travessia e retorno</h2>
            <p className="mt-2">Cada hex mede cerca de 2 km e custa 1 hora de travessia normal ou 2 horas por acesso difícil. Da posição atual, entre num hex vizinho; aviste a próxima borda ao chegar. Se houver abrigo, voltar a ele exige percorrer o caminho de volta. Sinais e locais registrados permanecem no mapa.</p>
            <p className="mt-2">Uma busca em setor comum leva cerca de 30 minutos, uma área extensa até 1 hora. Tempo e resultado são anotados no ponto. Não trate cada hex como uma única sala.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Descanso curto</h2>
            <p className="mt-2">Em lugar onde o grupo possa parar e se defender, gaste cerca de 1 hora. Cada PC escolhe duas ações, podendo repetir: tratar 1d4+1 HP, aliviar 1d4+1 Stress, reparar 1d4+1 Armadura, ou Preparar para ganhar 1 Hope (2 se um aliado também escolher Preparar). Planejar o acesso, preparar provisões e montar perímetro também usam uma ação.</p>
            <p className="mt-2">Ao concluir, o mestre recebe 1d4 Fear. Após três descansos curtos seguidos, o próximo deve ser longo. Descanso interrompido não concede benefícios.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Descanso longo</h2>
            <p className="mt-2">Requer refúgio seguro, vigia e água. Cada PC escolhe duas ações: limpar todos os HP, todo Stress ou toda Armadura; Preparar; trabalhar em projeto; ou executar uma ação de cenário. Projetos avançam um ponto por ação, com custos pagos ao iniciar.</p>
            <p className="mt-2">Ao concluir, o mestre recebe 1d4 + número de PCs Fear. Descanso longo não encerra o dia nem avança o calendário. Porções de Comida e Água são descontadas só ao usar Encerrar dia; a janela de Exposição continua correndo.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Carga e mochilas</h2>
            <p className="mt-2">Base 3 espaços. Bolsa tiracolo +1, mochila urbana +2, de trilha +3, cargueira +4; uma bolsa vestida por pessoa. Duas porções pessoais de cada recurso cabem nos bolsos; cada grupo extra de até quatro porções ocupa 1. Uma carga reserva de munição ocupa 1.</p>
            <p className="mt-2">Até dois espaços excedentes podem ir nas mãos, somando 1 hora por hex. Acima disso, faça outra viagem ou use carrinho/veículo.</p></article>
          <article className="list-card leading-relaxed"><h2 className="section-title">Infecção ao amanhecer</h2>
            <p className="mt-2">Depois das 2 horas sem limpeza, Exposto passa a Infectado no próximo amanhecer; depois Sintomático (−1 em Agilidade e Força); depois Terminal, com três cenas significativas restantes. Não há cura conhecida após a infecção se estabelecer nesta alfa.</p></article>
        </div>
      </TabsContent>
    </Tabs>
  </div>;
}
