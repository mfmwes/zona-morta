"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, House, Moon, Package, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Counter, Field, Pick } from "@/components/game-controls";
import { AddItemDialog, ItemActionsDialog } from "@/components/inventory-workflow";
import { ItemArt } from "@/components/item-art";
import { ShelterMoveDialog } from "@/components/shelter-move";
import { content, establishShelter, recoverFormerStock, type GameState } from "@/lib/game";
import { atSharedStorage, catalogForItem } from "@/lib/inventory";
import { closeDay, eveningNeeds } from "@/lib/survival";
import { adjustProvisionCount } from "@/lib/provisions";
import { registerRest } from "@/lib/abilities";

type Edit = (fn: (draft: GameState) => void) => void;

export function ShelterPanel({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [foodConsumers, setFoodConsumers] = useState(String(game.shelter.residents));
  const [waterConsumers, setWaterConsumers] = useState(String(game.shelter.residents));
  const [shelterNotes, setShelterNotes] = useState(game.shelter.notes);
  const [shelterName, setShelterName] = useState(game.shelter.name);
  const [cacheRecipient, setCacheRecipient] = useState("");
  const s = game.shelter;
  const hasShelter = s.hex !== null;
  const sharedAccessible = atSharedStorage(game);
  const currentSector = game.hexes[game.partyHex]?.sector?.name ?? `Hex ${game.partyHex}`;
  const homeSector = s.hex ? game.hexes[s.hex]?.sector?.name ?? `Hex ${s.hex}` : null;
  const visitedCache = (game.formerShelters ?? []).find(site => site.hex === game.partyHex);
  const recipient = game.survivors.find(person => person.id === cacheRecipient) ?? game.survivors[0];
  useEffect(() => { setShelterNotes(s.notes); }, [s.notes]);
  useEffect(() => { setShelterName(s.name); }, [s.name]);
  const stocks: { key: keyof typeof s; label: string; unit: string; max: number }[] = [
    {key:"food",label:"Comida",unit:"porções",max:999},
    {key:"water",label:"Água",unit:"porções",max:999},
    {key:"medications",label:"Medicamentos",unit:"tratamentos",max:99},
    {key:"pistolAmmo",label:"Munição de pistola",unit:"cargas",max:99},
    {key:"fuel",label:"Combustível",unit:"cargas",max:99},
    {key:"parts",label:"Peças",unit:"unidades",max:99},
  ];

  function nextMorning() {
    if (!consumptionValid) return;
    edit(draft => { closeDay(draft, Number(foodConsumers), Number(waterConsumers), game.day); });
    toast.success("Novo amanhecer registrado", { description: `Dia ${game.day + 1}. Consumo e progressão diária foram processados.` });
    setCloseOpen(false);
  }
  const consumptionValid = [foodConsumers, waterConsumers].every(value => value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 999);

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="panel panel-pad">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><p className="dossier-title">{hasShelter ? `Base / hex ${s.hex}` : `Grupo / hex ${game.partyHex}`}</p>
          <h2 className="page-title mt-1">{hasShelter ? s.name : "Sem abrigo"}</h2>
          <p className="intro-line mt-2">{hasShelter
            ? `Situado em ${homeSector}. O grupo está em ${currentSector}.`
            : `O grupo está em ${currentSector}. Ainda não há base fixa; escolha um lugar explorado para estabelecer uma.`}</p></div>
        {hasShelter && <span className="tag">{s.residents + game.survivors.length}/{s.capacity} pessoas</span>}
      </div>
      {!hasShelter && !playerPreview && <div className="mt-5 list-card">
        <p className="text-sm">O setor atual já foi explorado. Estabelecer uma base aqui não consome tempo automaticamente: resolva segurança, acesso e transporte na ficção.</p>
        <Button className="mt-3" onClick={() => {
          let established = false;
          edit(draft => { established = establishShelter(draft, draft.partyHex); });
          if (established) toast.success("Abrigo estabelecido", { description: `Base registrada em ${currentSector}.` });
          else toast.error("Não foi possível estabelecer o abrigo.");
        }}><House /> Estabelecer abrigo aqui</Button>
      </div>}
      {hasShelter && <>
        <div className="grid gap-3 mt-6 sm:grid-cols-3">
          {[ ["Segurança",s.security,"0–3"], ["Energia",s.energy,"0–2"], ["Conforto",s.comfort,"0–2"] ].map(([name,val,range]) =>
            <div className="metric" key={String(name)}><span className="smallcaps subtle">{name} · {range}</span><strong>{val}</strong></div>)}
        </div>
        {!playerPreview && <div className="grid gap-3 mt-4 sm:grid-cols-2">
          <div><Field label="Nome do abrigo" value={shelterName} onChange={setShelterName} placeholder="Ex.: Escola das Mangueiras" />
            <Button size="sm" variant="outline" className="mt-2" disabled={!shelterName.trim() || shelterName.trim() === s.name}
              onClick={() => {
                const name = shelterName.trim().slice(0, 80);
                edit(draft => { draft.shelter.name = name; });
                toast.success("Nome do abrigo atualizado", { description: name });
              }}>Salvar nome</Button></div>
          <div className="grid gap-3"><Counter compact label="Capacidade" value={s.capacity} min={1} max={99}
            onChange={value => edit(draft => { draft.shelter.capacity = value; })} />
            <Counter compact label="Outros moradores" value={s.residents} max={99}
              onChange={value => edit(draft => { draft.shelter.residents = value; })} /></div>
        </div>}
      </>}
      <div className="divider" />
      <div className="flex items-center gap-2 mb-3"><Package size={18} /><h3 className="section-title">{hasShelter ? "Estoque do abrigo" : "Reservas do grupo"}</h3></div>
      <p className="intro-line mb-4">Comida e Água são contadas em porções: quatro porções formam uma unidade. Não desconte duas vezes o que saiu na mochila. {hasShelter ? "As reservas ficam na base." : "Registre aqui só o que o grupo transporta; confira a carga na ficção."}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {stocks.map(stock => <div key={stock.key} className="metric">
          {playerPreview ? <div><span className="smallcaps subtle">{stock.label}</span><strong>{String(s[stock.key])}</strong></div>
          : <Counter compact editable quickStep={["food","water"].includes(stock.key) ? 4 : undefined}
              label={stock.label} value={Number(s[stock.key])} max={stock.max}
              onChange={value => edit(draft => { if (stock.key === "food" || stock.key === "water") adjustProvisionCount(draft.shelter, stock.key, value);
                else (draft.shelter[stock.key] as number) = value; })} />}
          <p className="text-xs subtle mt-2">{stock.unit}{["food","water"].includes(stock.key) ? ` · ${Math.floor(Number(s[stock.key])/4)} un. + ${Number(s[stock.key])%4} porções` : ""}</p>
        </div>)}
      </div>
      {(s.provisionLots ?? []).length > 0 && <p className="character-rule-note mt-3">Lotes com prazo: {s.provisionLots!.map(lot => `${lot.qty} ${lot.resource === "food" ? "comida" : "água"} (${lot.label}) → amanhecer do dia ${lot.expiresDay}`).join(" · ")}.</p>}
      <div className="divider" />
      <div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="section-title">Itens compartilhados</h3>
        {sharedAccessible && !playerPreview && <AddItemDialog game={game} edit={edit} ownerId="shared" />}</div>
      <p className="intro-line mt-2">Objetos físicos ficam aqui. Comida, água e munição convertidas em porções ou cargas aparecem nos contadores acima, sem duplicar itens.</p>
      {!sharedAccessible && <p className="character-rule-note">O grupo está fora do abrigo. Volte ao hex da base para mover os itens compartilhados.</p>}
      <div className="shared-inventory-list">
        {(s.inventory ?? []).length === 0 ? <p className="character-empty-list">Nenhum objeto guardado no depósito.</p>
          : (s.inventory ?? []).map(item => <div className="shared-inventory-row" key={item.id}><div className="shared-inventory-entry"><ItemArt name={item.name} category={catalogForItem(item)?.category ?? item.category} /><div><b>{item.name}</b><span>{catalogForItem(item)?.category ?? item.category ?? "Outros"} · {item.qty}× · carga {item.load} cada · {item.condition ?? "sem estado"}</span></div></div>
            {sharedAccessible && !playerPreview && <ItemActionsDialog game={game} edit={edit} ownerId="shared" item={item} allowCorrection />}</div>)}
      </div>
      {hasShelter && !playerPreview && <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Counter label="Segurança" value={s.security} max={3} onChange={value=>edit(d=>{d.shelter.security=value;})} />
        <Counter label="Energia" value={s.energy} max={2} onChange={value=>edit(d=>{d.shelter.energy=value;})} />
        <Counter label="Conforto" value={s.comfort} max={2} onChange={value=>edit(d=>{d.shelter.comfort=value;})} />
      </div>}
      {hasShelter && !playerPreview && <label className="inventory-ready mt-3"><input type="checkbox" checked={Boolean(s.coldStorage)} disabled={s.energy < 1}
        onChange={event => edit(d => { d.shelter.coldStorage = event.target.checked; })} />
        <span>Refrigeração funcional: há equipamento de frio e Energia 1+. Conserva refeições congeladas físicas no depósito; depois do preparo, as porções vencem no próximo amanhecer.</span></label>}
      {hasShelter && <><div className="divider" />
      <h3 className="section-title">Projetos disponíveis</h3>
      <div className="grid gap-2 mt-3 sm:grid-cols-2">
        {[
          ["Barricadas","1 Peças · projeto 2","Segurança +1"],
          ["Cisterna","2 Peças · projeto 3 · captação","1 Água/dia só com fonte limpa"],
          ["Enfermaria","1 Peças + 1 Medicamentos · projeto 2","Tratamentos complexos"],
          ["Rádio fixo","1 Peças · projeto 2 · energia","Comunicação com sinal identificado"],
          ["Horta","2 Peças · projeto 4 · água","1 Comida a cada 3 dias após amadurecer"],
          ["Garagem","1 Peças · projeto 2","Reparos permanentes de veículos"],
        ].map(([name,cost,effect]) => <div className="list-card text-sm" key={name}><b>{name}</b><p className="subtle mt-1">{cost}</p><p className="mt-1">{effect}</p></div>)}
      </div>
      {!playerPreview && <div className="mt-5"><Field label="Notas do abrigo" value={shelterNotes} onChange={setShelterNotes} multiline />
        <Button size="sm" variant="outline" className="mt-2" onClick={() => {
          edit(draft => { draft.shelter.notes = shelterNotes.trim(); });
          toast.success("Notas do abrigo salvas.");
        }}>Salvar notas</Button></div>}</>}
    </section>
    <aside className="grid gap-5 self-start">
      <section className="panel panel-pad">
        <p className="dossier-title">Rotina / sobrevivência</p><h3 className="section-title mt-1">Anoitecer e descanso</h3>
        <p className="intro-line mt-3">Cada pessoa precisa de uma porção de Comida e uma de Água por dia. O consumo pessoal registrado na ficha é excluído da sugestão de gasto compartilhado.</p>
        {!playerPreview && <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
          <DialogTrigger asChild><Button className="mt-4 w-full" onClick={() => {
            const needs = eveningNeeds(game);
            setFoodConsumers(String(needs.food)); setWaterConsumers(String(needs.water));
          }}><Moon /> Fechar dia</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Passar para o próximo amanhecer</DialogTitle>
            <DialogDescription>Os valores sugeridos incluem moradores e sobreviventes presentes que ainda não registraram consumo pessoal hoje. Ajuste se alguém comeu de outra fonte. Confira privação, vigia e descanso com o grupo.</DialogDescription></DialogHeader>
            <div className="inventory-search"><Field label="Comida das reservas · porções" value={foodConsumers} onChange={setFoodConsumers} type="number" />
              <Field label="Água das reservas · porções" value={waterConsumers} onChange={setWaterConsumers} type="number" /></div>
            {!atSharedStorage(game) && <p className="character-rule-note">O grupo está fora da base. As fichas precisam registrar provisões usadas durante a expedição; a sugestão inclui apenas os moradores do abrigo.</p>}
            <p className="text-sm subtle">Faltas serão registradas; aplique Stress a quem ficou sem mantimentos. Itens físicos ainda guardados não entram nesta conta até virarem porções.</p>
            {!consumptionValid && <p className="inventory-danger" role="alert">Informe quantidades inteiras entre 0 e 999.</p>}
            <DialogFooter><Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button><Button disabled={!consumptionValid} onClick={nextMorning}>Confirmar anoitecer</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
        {!playerPreview && <div className="flex gap-2 flex-wrap mt-3"><Button size="sm" variant="outline" onClick={() => {
          edit(d => registerRest(d, "short"));
          toast.success("Descanso curto registrado", { description: "Habilidades correspondentes foram renovadas." });
        }}>Registrar descanso curto</Button>
          <Button size="sm" variant="outline" onClick={() => {
            edit(d => registerRest(d, "long"));
            toast.success("Descanso longo registrado", { description: "Habilidades de descanso curto e longo foram renovadas." });
          }}>Registrar descanso longo</Button></div>}
        <p className="text-xs subtle mt-2">Registre o descanso quando as ações forem concluídas; aplique recuperação de Vida, Estresse ou Armadura na ficha.</p>
      </section>
      {hasShelter && <section className="panel panel-pad">
        <p className="dossier-title">Pessoas e necessidades</p>
        <p className="text-sm mt-3">{s.residents} outro(s) morador(es) registrados. Defina nomes, relações e necessidades nas notas do abrigo.</p>
        {s.notes && <p className="text-sm mt-4 leading-relaxed">{s.notes}</p>}
        {!playerPreview && <ShelterMoveDialog game={game} edit={edit} mode="abandon" />}
      </section>}
      {visitedCache && <section className="panel panel-pad">
        <p className="dossier-title">Hex {visitedCache.hex} / Depósito antigo</p>
        <h3 className="section-title mt-1">{visitedCache.name}</h3>
        <p className="intro-line mt-2">O grupo está neste local. Retire os mantimentos e itens desejados e confira a carga do sobrevivente.</p>
        {!playerPreview && recipient && <Pick label="Quem vai carregar" value={recipient.id} options={game.survivors.map(person => ({ value: person.id, label: person.name }))} onChange={setCacheRecipient} />}
        <div className="grid gap-2 mt-3">
          {([ ["food", "Comida"], ["water", "Água"], ["pistolAmmo", "Munição de pistola"],
            ["medications", "Medicamentos"], ["fuel", "Combustível"], ["parts", "Peças"] ] as const).map(([key, label]) =>
            <div key={key} className="shared-inventory-row"><div><b>{label}</b><span>{visitedCache[key]} {key === "pistolAmmo" ? "carga(s)" : "porção(ões)"}</span></div>
              {visitedCache[key] > 0 && recipient && !playerPreview && <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => edit(d => {
                  if (!recoverFormerStock(d, game.partyHex, recipient.id, key, 1)) toast.error("Não foi possível retirar. Verifique o limite do contador.");
                })}>Retirar 1</Button>
                {visitedCache[key] > 1 && <Button size="sm" variant="outline" onClick={() => edit(d => {
                  if (!recoverFormerStock(d, game.partyHex, recipient.id, key, visitedCache[key])) toast.error("Não coube no contador deste sobrevivente.");
                })}>Retirar tudo</Button>}
              </div>}</div>)}
          {(visitedCache.inventory ?? []).map(item => <div key={item.id} className="shared-inventory-row"><div className="shared-inventory-entry"><ItemArt name={item.name} category={item.category} /><div><b>{item.qty}× {item.name}</b><span>{item.load * item.qty} carga</span></div></div>
            {recipient && !playerPreview && <Button size="sm" variant="outline" onClick={() => edit(d => {
              if (!recoverFormerStock(d, game.partyHex, recipient.id, "food", 0, item.id)) toast.error("O item já não está neste depósito.");
            })}>Retirar</Button>}</div>)}
        </div>
        <p className="text-sm subtle mt-3">Peças, combustível e medicamentos retirados viram itens de carga 1 no inventário. Ao chegar à base ativa, use Ações → Guardar nas reservas para converter de volta.</p>
      </section>}
    </aside>
  </div>;
}

export function ReferencePanel() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const categories = useMemo(() => ["Todas", ...new Set(content.catalog.map(i => i.category))], []);
  const matches = content.catalog.filter(item => (category === "Todas" || item.category === category)
    && `${item.name} ${item.fields.map(f=>f.value).join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="panel panel-pad">
    <Tabs defaultValue="itens">
      <TabsList className="mb-5 max-w-full overflow-x-auto"><TabsTrigger value="itens"><Package /> Itens</TabsTrigger>
        <TabsTrigger value="ameacas"><ShieldAlert /> Ameaças</TabsTrigger>
        <TabsTrigger value="procedimentos"><BookOpen /> Procedimentos</TabsTrigger></TabsList>
      <TabsContent value="itens">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4"><div><h2 className="section-title">Catálogo de exploração</h2>
          <p className="intro-line mt-1">{content.catalog.length} itens do apêndice. A carga e os efeitos seguem a alfa.</p></div>
          <span className="tag">{matches.length} resultados</span></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_280px] mb-3">
          <Field label="Buscar pelo nome ou efeito" value={query} onChange={setQuery} placeholder="Água, lanterna, mochila..." />
          <Pick label="Categoria" value={category} options={categories} onChange={setCategory} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((item,index) => <article key={`${item.category}-${item.name}-${index}`} className="list-card text-sm">
            <div className="catalog-item-heading">{item.category !== "Consulta antes de sair e ao retornar" && <ItemArt name={item.name} category={item.category} size="large" />}<div><p className="dossier-title">{item.category}</p><h3 className="font-extrabold mt-1 text-[1rem]">{item.name}</h3></div></div>
            <div className="mt-2 grid gap-1 leading-relaxed">{item.fields.filter(f=>f.value).map((f,i)=><p key={i}><b>{f.label}:</b> {f.value}</p>)}</div>
          </article>)}
        </div>
        {matches.length === 0 && <p className="intro-line py-8">Nenhum item corresponde à busca.</p>}
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
            <p className="mt-2">Ao concluir, o mestre recebe 1d4 + número de PCs Fear. Porções de Comida e Água são descontadas só uma vez ao anoitecer, não a cada descanso. A janela de Exposição continua correndo.</p></article>
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
