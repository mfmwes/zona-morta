"use client";
import { localizeRollLog } from "@/lib/terminology";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Brain, Clock3, Download, Droplets, Ear, Eye, EyeOff, House, LogOut, Map, MessageSquare, MoreHorizontal, Package, RotateCcw, Settings, ShieldAlert, Swords, Upload, Users, Utensils, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { Counter, Field, Pick } from "@/components/game-controls";
import { HexExplorer } from "@/components/hex-explorer";
import { SurvivorPanel, type RestPeer } from "@/components/survivor-panel";
import { NpcPanel } from "@/components/npc-panel";
import { ReferencePanel, ShelterPanel } from "@/components/campaign-views";
import { ThreatManager } from "@/components/threat-manager";
import { ConflictSceneManager } from "@/components/conflict-scene-manager";
import { PlayersPanel } from "@/components/players-panel";
import { AuthPanel } from "@/components/auth-panel";
import { CharacterWizard } from "@/components/character-wizard";
import { CampaignLibrary, type AccountCharacterSummary, type CampaignSummary } from "@/components/campaign-library";
import { TableChat } from "@/components/table-chat";
import { DayCloseDialog } from "@/components/day-close-dialog";
import { addLog, displayTime, resetCityPreservingSurvivors, survivorHex, type GameState, type Point, type Survivor } from "@/lib/game";
import { createId } from "@/lib/id";
import { sectorProfiles } from "@/lib/sectors";
import { adjustProvisionCount } from "@/lib/provisions";
import { beginExpedition, beginScene } from "@/lib/abilities";
import { playerEditPayload } from "@/lib/collaboration";
import { advanceCampaignTime, setCampaignTime } from "@/lib/time";

type CampaignResponse = { revision?: number; state?: GameState; role: "mestre" | "jogador" | "convidado"; ownerId: string; survivorId?: string | null; restPeers?: RestPeer[] };
type SaveStatus = "salvo" | "salvando" | "erro" | "conflito";
type ModelTool = {
  name: string; title: string; description: string; inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type ModelContext = { registerTool: (tool: ModelTool, options: { signal: AbortSignal }) => void | Promise<void> };

export default function CampaignApp() {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [accountCharacters, setAccountCharacters] = useState<AccountCharacterSummary[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("salvo");
  const [saveError, setSaveError] = useState("");
  const [tab, setTab] = useState("mapa");
  const [chatOpen, setChatOpen] = useState(true);
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [playerPreview, setPlayerPreview] = useState(false);
  const [role, setRole] = useState<"mestre" | "jogador" | "convidado">("mestre");
  const [ownerId, setOwnerId] = useState("");
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [restPeers, setRestPeers] = useState<RestPeer[]>([]);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [startWithShelter, setStartWithShelter] = useState(false);
  const [startSectorId, setStartSectorId] = useState("random");
  const importInput = useRef<HTMLInputElement>(null);
  const current = useRef<GameState | null>(null);
  const revision = useRef(0);
  const pending = useRef<GameState | null>(null);
  const pendingBefore = useRef<GameState | null>(null);
  const roleRef = useRef<"mestre" | "jogador" | "convidado">("mestre");
  const sending = useRef(false);
  const paused = useRef(false);

  useEffect(() => {
    const showRollInChat = () => setChatOpen(true);
    window.addEventListener("zona-morta:roll-completed", showRollInChat);
    return () => window.removeEventListener("zona-morta:roll-completed", showRollInChat);
  }, []);

  const apiPath = useCallback(() => {
    const owner = new URLSearchParams(window.location.search).get("campanha");
    return owner ? "/api/campaign?campanha=" + encodeURIComponent(owner) : "/api/campaign";
  }, []);

  const loadCampaign = useCallback(async () => {
    try {
      const campaignId = new URLSearchParams(window.location.search).get("campanha")?.trim() ?? "";
      if (!campaignId) {
        const [campaignResponse, characterResponse] = await Promise.all([
          fetch("/api/campaigns", { cache: "no-store" }),
          fetch("/api/characters", { cache: "no-store" }),
        ]);
        const payload = await campaignResponse.json() as { error?: string; campaigns?: CampaignSummary[] };
        const characterPayload = await characterResponse.json() as { error?: string; characters?: AccountCharacterSummary[] };
        if (campaignResponse.status === 401) { setNeedsAuth(true); setShowLibrary(false); setLoadError(""); setGame(null); return; }
        if (!campaignResponse.ok) throw new Error(payload.error || "Falha ao abrir seus dossiês.");
        setNeedsAuth(false);
        setCampaigns(payload.campaigns ?? []);
        setAccountCharacters(characterResponse.ok ? (characterPayload.characters ?? []) : []);
        setShowLibrary(true);
        setGame(null); current.current = null;
        setLoadError("");
        return;
      }
      setShowLibrary(false);
      const response = await fetch(apiPath(), { cache: "no-store" });
      const payload = await response.json() as { error?: string; revision?: number; state?: GameState };
      if (response.status === 401) { setNeedsAuth(true); setLoadError(""); setGame(null); return; }
      if (!response.ok) throw new Error(payload.error || "Falha ao abrir a campanha.");
      setNeedsAuth(false);
      const data = payload as CampaignResponse;
      revision.current = data.revision ?? 0;
      roleRef.current = data.role;
      setRole(data.role);
      setOwnerId(data.ownerId);
      setSurvivorId(data.survivorId ?? null);
      setRestPeers(data.restPeers ?? []);
      if (data.role === "jogador") setTab("sobreviventes");
      current.current = data.state ?? null;
      pending.current = null;
      pendingBefore.current = null;
      paused.current = false;
      setGame(data.state ?? null); setStatus("salvo"); setSaveError(""); setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao abrir a campanha.");
    } finally { setLoading(false); }
  }, [apiPath]);

  // This starts network I/O; loadCampaign updates state only after the request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!pending.current && !sending.current && !paused.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (!current.current || pending.current || sending.current || paused.current) return;
      try {
        const response = await fetch(apiPath(), { cache: "no-store" });
        if (response.status === 403) {
          setLoadError("O acesso à campanha foi encerrado."); setGame(null); current.current = null; return;
        }
        if (!response.ok) return;
        const data = await response.json() as CampaignResponse;
        if (data.role === "jogador" && data.survivorId !== survivorId) setSurvivorId(data.survivorId ?? null);
        if (data.restPeers) setRestPeers(data.restPeers);
        if (data.revision !== revision.current && data.state && !pending.current && !sending.current) {
          revision.current = data.revision ?? 0;
          current.current = data.state;
          setGame(data.state);
        }
      } catch { /* A próxima atualização tenta novamente. */ }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [apiPath, survivorId]);

  const flush = useCallback(async () => {
    if (sending.current || paused.current) return;
    sending.current = true;
    try {
      while (pending.current && !paused.current) {
        const snapshot = pending.current;
        const before = pendingBefore.current;
        pending.current = null;
        pendingBefore.current = null;
        try {
          const player = roleRef.current === "jogador";
          const response = await fetch(apiPath(), {
            method: player ? "PATCH" : "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(player && before ? playerEditPayload(before, snapshot)
              : { revision: revision.current, state: snapshot }),
          });
          const result = await response.json() as { error?: string; revision?: number; state?: GameState; restPeers?: RestPeer[] };
          if (!response.ok) {
            pending.current = current.current;
            pendingBefore.current = before;
            paused.current = true;
            setStatus(response.status === 409 ? "conflito" : "erro");
            setSaveError(result.error || "Não foi possível salvar. Tente novamente.");
            break;
          }
          revision.current = result.revision!;
          if (player && pending.current) pendingBefore.current = snapshot;
          if (player && result.state && !pending.current) {
            current.current = result.state;
            setGame(result.state);
          }
          if (player && result.restPeers) setRestPeers(result.restPeers);
          if (!pending.current) { setStatus("salvo"); setSaveError(""); }
        } catch {
          pending.current = current.current;
          pendingBefore.current = before;
          paused.current = true;
          setStatus("erro");
          setSaveError("Conexão interrompida. Os dados continuam nesta tela; tente salvar novamente.");
        }
      }
    } finally { sending.current = false; }
  }, [apiPath]);

  const edit = useCallback((mutate: (draft: GameState) => void) => {
    if (!current.current) return;
    const before = current.current;
    const draft = structuredClone(before);
    mutate(draft);
    if (roleRef.current === "jogador") {
      if (!playerEditPayload(before, draft)) {
        toast.error("Esta ação altera dados compartilhados. Peça ao mestre para registrá-la.");
        return;
      }
    }
    current.current = draft;
    pendingBefore.current = before;
    pending.current = draft;
    setGame(draft);
    if (!paused.current) { setStatus("salvando"); void flush(); }
  }, [flush]);

  function retrySave() {
    if (!current.current) return;
    pending.current = current.current;
    paused.current = false;
    setStatus("salvando");
    void flush();
  }

  function openTimeEditor() {
    if (!current.current) return;
    setManualTime(displayTime(current.current.minutes));
    setTimeEditorOpen(true);
  }

  function saveManualTime() {
    const matched = /^(\d{2}):(\d{2})$/.exec(manualTime);
    const hours = matched ? Number(matched[1]) : Number.NaN;
    const minutes = matched ? Number(matched[2]) : Number.NaN;
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      toast.error("Informe um horário entre 00:00 e 23:59.");
      return;
    }
    let previous = "";
    let completedWork: { name: string; points: number; completed: boolean }[] = [];
    edit(draft => {
      previous = displayTime(draft.minutes);
      const result = setCampaignTime(draft, hours * 60 + minutes);
      completedWork = result.completedWork;
      addLog(draft, "tempo", `Horário ajustado pelo mestre: ${previous} → ${displayTime(draft.minutes)}.`);
    });
    setTimeEditorOpen(false);
    toast.success("Horário ajustado", {
      description: completedWork.length
        ? `${previous} → ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} · ${completedWork.map(row => `${row.name} +${row.points}${row.completed ? " concluída" : ""}`).join(" · ")}`
        : `${previous} → ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}.`,
    });
  }

  function downloadBackup() {
    if (!current.current) return;
    const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zona-morta-dia-${current.current.day}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const hasGame = Boolean(game);
  useEffect(() => {
    if (!hasGame) return;
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool || roleRef.current === "jogador") return;
    const lifecycle = new AbortController();
    const tools: ModelTool[] = [
      {
        name: "read_campaign_summary", title: "Consultar campanha",
        description: "Consulta dia, horário, recursos, sobreviventes e avanço do mapa da campanha aberta.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        async execute() {
          const state = current.current;
          if (!state) throw new Error("Campanha indisponível.");
          return { day: state.day, time: displayTime(state.minutes), shelter: state.shelter.hex ? state.shelter.name : null,
            shelterHex: state.shelter.hex, partyHex: state.partyHex,
            food: state.shelter.food, water: state.shelter.water,
            survivors: state.survivors.map(s => ({ name: s.name, hex: survivorHex(state, s) })),
            explored: Object.values(state.hexes).filter(h => h.discovery === "explorado").length };
        },
      },
      {
        name: "record_hex_point", title: "Registrar ponto no mapa",
        description: "Registra um ponto de interesse em um hex da campanha, usando o mesmo registro do mapa do mestre.",
        inputSchema: { type: "object", properties: {
          hex: { type: "string", description: "Coordenadas q,r, por exemplo 0,0" },
          name: { type: "string" }, signal: { type: "string" },
        }, required: ["hex", "name", "signal"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const data = input as { hex?: unknown; name?: unknown; signal?: unknown };
          const name = typeof data.name === "string" ? data.name.trim() : "";
          const signal = typeof data.signal === "string" ? data.signal.trim() : "";
          const id = typeof data.hex === "string" ? data.hex.trim() : "";
          if (!name || name.length > 120 || signal.length > 400 || current.current?.hexes[id]?.discovery === "desconhecido" || !current.current?.hexes[id])
            throw new Error("Indique um hex já avistado, nome e sinal válidos.");
          const point: Point = { id: createId(), name, kind: "local", signal,
            access: "", notes: "", revealed: true, searches: [] };
          edit(draft => { draft.hexes[id].points.push(point);
            addLog(draft, "descoberta", `${draft.hexes[id].sector?.name ?? `Hex ${id}`}: ${name} registrado.`); });
          const limit = Date.now() + 30000;
          while ((sending.current || pending.current) && !paused.current && Date.now() < limit)
            await new Promise(resolve => setTimeout(resolve, 50));
          if (paused.current || pending.current) throw new Error("O registro ainda não foi salvo. Use o botão de nova tentativa na campanha.");
          return { hex: id, pointId: point.id, name };
        },
      },
    ];
    for (const tool of tools) {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); }
      catch { /* Navegadores sem suporte continuam usando a interface normal. */ }
    }
    return () => lifecycle.abort();
  }, [hasGame, edit]);

  if (loading) return <main className="min-h-screen grid place-items-center p-6"><div className="panel panel-pad max-w-lg w-full">
    <p className="dossier-title">Zona Morta / campanha</p><h1 className="page-title mt-2">Abrindo o dossiê...</h1>
    <p className="intro-line mt-3">Carregando o mapa e os registros de sobreviventes.</p></div></main>;

  async function enterCampaign() {
    setJoining(true); setJoinError("");
    try {
      const code = new URLSearchParams(window.location.hash.slice(1)).get("convite") || "";
      const response = await fetch("/api/players/join", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, code }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar na campanha.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      await loadCampaign();
    } catch (reason) { setJoinError(reason instanceof Error ? reason.message : "Não foi possível entrar."); }
    finally { setJoining(false); }
  }

  async function createOwnCharacter(survivor: Survivor) {
    const response = await fetch("/api/characters?campanha=" + encodeURIComponent(ownerId), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(survivor),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar o dossiê.");
    await loadCampaign();
  }

  async function importBackup(file: File) {
    if (roleRef.current !== "mestre") return;
    if (!window.confirm("Substituir o mapa e as fichas desta campanha pelos dados da cópia? Baixe uma cópia atual antes de continuar.")) return;
    try {
      const state = JSON.parse(await file.text()) as GameState;
      const response = await fetch(apiPath(), { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revision.current, state }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível importar a cópia.");
      await loadCampaign();
      toast.success("Cópia importada para esta campanha.");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Arquivo inválido."); }
  }

  if (needsAuth) return <AuthPanel onAuthenticated={loadCampaign} />;

  if (showLibrary) return <CampaignLibrary campaigns={campaigns} characters={accountCharacters} onRefresh={loadCampaign} onSignOut={async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.assign("/");
  }} />;

  if (role === "convidado") return <main className="min-h-screen grid place-items-center p-6"><section className="panel panel-pad max-w-xl w-full">
    <p className="dossier-title">Zona Morta / acesso à mesa</p><h1 className="page-title mt-2">Entre na campanha</h1>
    <p className="intro-line mt-3">Você recebeu o endereço desta campanha. Ao entrar, poderá criar seu próprio sobrevivente e jogar com a sua ficha.</p>
    <p className="character-rule-note mt-5">Seu mestre controla o mapa e os registros compartilhados. Sua ficha será criada por você no próximo passo. Use o endereço completo do convite enviado pelo mestre.</p>
    {joinError && <p role="alert" className="inventory-danger mt-3">{joinError}</p>}
    <Button className="mt-5" disabled={joining} onClick={() => void enterCampaign()}><Users size={17} /> {joining ? "Entrando..." : "Entrar e criar personagem"}</Button>
  </section></main>;

  if (loadError || !game) return <main className="min-h-screen grid place-items-center p-6"><div className="panel panel-pad max-w-lg w-full">
    <p className="dossier-title">Zona Morta / campanha</p><h1 className="page-title mt-2">Não foi possível abrir o dossiê</h1>
    <p className="intro-line mt-3">{loadError || "Dados indisponíveis."}</p>
    <Button className="mt-5" onClick={() => { setLoading(true); setLoadError(""); void loadCampaign(); }}><RotateCcw /> Tentar novamente</Button></div></main>;

  if (role === "jogador" && !survivorId) return <main className="min-h-screen grid place-items-center p-6"><section className="panel panel-pad max-w-xl w-full">
    <p className="dossier-title">Zona Morta / dossiê pessoal</p><h1 className="page-title mt-2">Crie seu sobrevivente</h1>
    <p className="intro-line mt-3">Escolha a origem, o arquétipo, as técnicas e o kit inicial. Depois de salvar, sua ficha aparecerá aqui e o mestre verá o novo integrante da equipe.</p>
    <div className="mt-6"><CharacterWizard onCreate={createOwnCharacter} /></div>
  </section></main>;

  const readOnlyPreview = playerPreview || role === "jogador";
  const title = { mapa: "Exploração", sobreviventes: "Sobreviventes", comunidade: "PNJs e comunidade", abrigo: "Abrigo e reservas",
    conflito: "Cena de conflito", ameacas: "Gerenciador de ameaças", referencias: "Arquivo de campo", jogadores: "Jogadores e acessos" }[tab] || "Campanha";
  const nav = [
    { value: "mapa", label: "Mapa e hexes", icon: Map },
    { value: "sobreviventes", label: "Sobreviventes", icon: Users },
    { value: "comunidade", label: "PNJs e comunidade", icon: Users },
    { value: "abrigo", label: "Abrigo e reservas", icon: House },
    ...(role === "mestre" && !playerPreview ? [
      { value: "conflito", label: game.conflict?.active ? "Conflito ativo" : "Conflito", icon: Swords },
      { value: "ameacas", label: "Ameaças", icon: ShieldAlert },
    ] : []),
    { value: "referencias", label: "Regras e itens", icon: BookOpen },
    ...(role === "mestre" ? [{ value: "jogadores", label: "Jogadores", icon: Users }] : []),
  ];

  return <Tabs value={tab} onValueChange={setTab} className="w-full">
    <SidebarProvider className={`app-shell ${chatOpen ? "chat-open" : "chat-closed"}`}>
    <Sidebar collapsible="none" className="rail">
      <div className="flex items-center gap-3 px-2">
        <div className="brand-mark">ZM</div><div><div className="text-[.93rem] font-extrabold tracking-wide">ZONA MORTA</div>
          <div className="text-[.7rem] text-[#a9c0bc] uppercase tracking-[.14em] font-mono">Daggerheart · alfa</div></div>
      </div>
      <div className="px-3"><span className="smallcaps text-[#81d0cb]">Dossiê de campanha</span>
        <p className="text-sm text-[#a9c0bc] mt-1">Cidade em descoberta · mapa aberto</p></div>
      <TabsList aria-label="Seções da campanha" className="rail-nav bg-transparent h-auto w-full p-0">
        {nav.map((item,index) => <TabsTrigger value={item.value} key={item.value} className={index >= 4 ? "rail-nav-extra" : undefined} aria-current={tab===item.value ? "page" : undefined}>
          <item.icon size={17} />{item.label}</TabsTrigger>)}
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="rail-more" aria-label="Mais seções" aria-current={nav.slice(4).some(item => item.value === tab) ? "page" : undefined}><MoreHorizontal size={19} /><span>Mais</span></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-48">{nav.slice(4).map(item => <DropdownMenuItem key={item.value} onSelect={() => setTab(item.value)}><item.icon size={16} />{item.label}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      </TabsList>
      <div className="rail-foot"><b>Dia {game.day}</b> · {displayTime(game.minutes)}
        <p>Um hex pode guardar muitos lugares, pistas e acontecimentos.</p></div>
    </Sidebar>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-context text-sm">
          <span className="tag">DIA {String(game.day).padStart(2,"0")}</span>
          <span className="font-mono font-extrabold flex items-center gap-1"><Clock3 size={16} /> {displayTime(game.minutes)}</span>
          {role === "mestre" && <DayCloseDialog game={game} edit={edit} variant="outline" size="sm" className="topbar-day-close" />}
          <span className="hidden sm:inline text-[#c4cfcb]">/</span>
          <span className="subtle hidden sm:inline">{game.shelter.hex ? game.shelter.name : "Sem abrigo"}</span>
        </div>
        <div className="topbar-actions">
          <span className={`save-status ${status === "salvo" ? "ok" : status === "salvando" ? "" : "error"}`} role="status">
            {status === "salvo" ? "● Salvo" : status === "salvando" ? "◌ Salvando" : "● Não salvo"}
          </span>
          {status === "erro" && <Button size="sm" variant="outline" onClick={retrySave}>Tentar salvar</Button>}
          {status === "conflito" && <Button size="sm" variant="outline" onClick={() => {
            if (window.confirm("Descarte as alterações desta tela e carregue a versão salva em outra janela?")) { setLoading(true); setLoadError(""); void loadCampaign(); }
          }}>Recarregar</Button>}
          {role === "mestre" && <Button size="sm" className="topbar-preview-button" variant={playerPreview ? "default" : "outline"}
            aria-label={playerPreview ? "Desativar prévia dos jogadores" : "Ativar prévia dos jogadores"}
            title={playerPreview ? "Desativar prévia dos jogadores" : "Ativar prévia dos jogadores"}
            onClick={() => {
              const nextPreview = !playerPreview;
              if (nextPreview && (tab === "ameacas" || tab === "conflito")) setTab("referencias");
              setPlayerPreview(nextPreview);
            }}>
            {playerPreview ? <Eye size={16} /> : <EyeOff size={16} />}<span>{playerPreview ? "Prévia ativa" : "Prévia dos jogadores"}</span>
          </Button>}
          <Button size="sm" variant={chatOpen ? "default" : "outline"} onClick={() => setChatOpen(value => !value)} aria-expanded={chatOpen} aria-controls="table-chat"><MessageSquare size={16} /><span className="topbar-options-label">Chat</span></Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline" aria-label="Abrir opções da campanha"><MoreHorizontal size={17} /><span className="topbar-options-label">Opções</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem onSelect={downloadBackup}><Download size={16} />Baixar cópia</DropdownMenuItem>
              {role === "mestre" && <DropdownMenuItem onSelect={() => importInput.current?.click()}><Upload size={16} />Importar cópia</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => window.location.assign("/")}><BookOpen size={16} />Meus dossiês</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void fetch("/api/auth", { method: "DELETE" }).then(() => window.location.assign("/"))}><LogOut size={16} />Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {role === "mestre" && <input ref={importInput} className="sr-only" type="file" accept="application/json,.json" aria-label="Importar cópia da campanha" onChange={event => {
            const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = "";
          }} />}
        </div>
      </header>
      {readOnlyPreview && <div className="player-preview-banner" role="status">
        <span className="flex items-center gap-2"><Eye size={18} /><b>{role === "jogador" ? "Dossiê do jogador" : "Prévia dos jogadores"}</b> · Informações reservadas do mestre não aparecem nesta visão.</span>
        {role === "mestre" && <Button size="sm" variant="outline" onClick={() => setPlayerPreview(false)}>Voltar ao mestre</Button>}
      </div>}
      <main className="page">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div><p className="eyebrow">Daggerheart / Zona Morta</p><h1 className="page-title mt-1">{title}</h1>
            <p className="intro-line mt-2">{tab === "mapa" ? "Explore a partir do que o grupo avista. Registre apenas o que a ficção tornou real." :
              tab === "sobreviventes" ? "Históricos, arquétipos e recursos prontos para jogar." :
              tab === "comunidade" ? "Acompanhe pessoas importantes, vínculos e a comunidade entre os hexes." :
              tab === "abrigo" ? "Organize reservas e descanso. Estabeleça um abrigo quando o grupo encontrar um lugar." :
              tab === "conflito" ? "Acompanhe participantes, ameaças e spotlight sem criar iniciativa ou ordem de turnos." :
              tab === "ameacas" ? "Crie, adapte e consulte as ameaças mecânicas usadas pelo mestre durante a campanha." :
              tab === "jogadores" ? "Compartilhe a campanha e acompanhe quem entrou na mesa." :
              "Consulte itens e procedimentos durante a sessão."}</p></div>
          {!readOnlyPreview && tab === "mapa" &&
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm"><RotateCcw /> Reiniciar cidade</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Reiniciar esta cidade?</AlertDialogTitle>
                  <AlertDialogDescription>Isso reinicia o mapa, os sobreviventes, as reservas e o diário desta campanha. Para manter esta mesa e começar outra, volte a Seus dossiês e crie uma nova campanha.</AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-4 py-2">
                  <Pick label="Setor de partida (hex 0,0)" value={startSectorId} onChange={setStartSectorId}
                    options={[{ value: "random", label: "Sortear setor" }, ...[...sectorProfiles]
                      .sort((a,b) => a.name.localeCompare(b.name, "pt-BR"))
                      .map(sector => ({ value: sector.id, label: sector.name }))]} />
                  <div><p className="field-label mb-2">Situação inicial</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={!startWithShelter ? "default" : "outline"}
                        aria-pressed={!startWithShelter} onClick={() => setStartWithShelter(false)}>Sem abrigo</Button>
                      <Button type="button" size="sm" variant={startWithShelter ? "default" : "outline"}
                        aria-pressed={startWithShelter} onClick={() => setStartWithShelter(true)}>Abrigo no setor de partida</Button>
                    </div>
                    <p className="text-sm subtle mt-2">Sem abrigo, o grupo começa no setor escolhido e pode montar uma base mais tarde. Os setores vizinhos continuam sorteados.</p>
                  </div>
                </div>
                <AlertDialogFooter>
                  <Button variant="outline" onClick={downloadBackup}><Download /> Baixar cópia</Button>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => {
                    let preserved = 0;
                    edit(draft => { preserved = resetCityPreservingSurvivors(draft, {
                      startSectorId: startSectorId === "random" ? undefined : startSectorId,
                      withShelter: startWithShelter,
                    }); });
                    setTab("mapa"); setPlayerPreview(false);
                    toast.success("Cidade reiniciada", { description: `Mapa, reservas e diário foram reiniciados. ${preserved} sobrevivente(s) foram preservados.` });
                  }}>Reiniciar cidade</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
        </div>
        {(status === "erro" || status === "conflito") && <div role="alert" className="mb-5 rounded-md border border-[#d5aaa1] bg-[#fff2ed] px-4 py-3 text-sm text-[#803b35]">
          <b>As alterações ainda estão nesta tela.</b> {saveError} Baixe uma cópia antes de recarregar, se precisar.
        </div>}
        {tab === "mapa" && <>
          {!readOnlyPreview && <div className="panel scene-control-panel mb-5">
            <section className="scene-control-section scene-pressure-section">
              <div className="scene-control-heading">
                <div className="scene-control-title"><Volume2 size={20} /><b>Pressão da cena</b></div>
                <div className="scene-control-actions">
                  <Button size="sm" variant="outline" onClick={() => {
                    edit(beginScene);
                    toast.success("Nova cena iniciada", { description: "Barulho voltou a 0 e habilidades por cena foram renovadas." });
                  }}>Nova cena</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    edit(beginExpedition);
                    toast.success("Nova expedição iniciada", { description: "Habilidades por expedição foram renovadas." });
                  }}>Nova expedição</Button>
                </div>
              </div>

              <div className="scene-pressure-grid">
                <div className="scene-meter scene-meter-noise">
                  <div className="scene-meter-identity">
                    <Ear size={28} aria-hidden="true" />
                    <span><b>Barulho</b><small>0–5</small></span>
                  </div>
                  <div className="scene-meter-control">
                    <Counter compact label="Barulho" value={game.noise} max={5} onChange={value=>edit(d=>{d.noise=value;})} />
                  </div>
                </div>
                <div className="scene-meter scene-meter-fear">
                  <div className="scene-meter-identity">
                    <Brain size={28} aria-hidden="true" />
                    <span><b>Medo</b><small>0–12</small></span>
                  </div>
                  <div className="scene-meter-control">
                    <Counter compact tone="fear" label="Medo" value={game.fear} max={12} onChange={value=>edit(d=>{d.fear=value;})} />
                  </div>
                </div>
              </div>
            </section>

            <section className="scene-control-section scene-supplies-section">
              <div className="scene-control-heading">
                <div className="scene-control-title"><Package size={20} /><b>{game.shelter.hex ? "Suprimentos do abrigo" : "Reservas do grupo"}</b></div>
              </div>

              <div className="scene-supplies-grid">
                {([
                  ["food","Comida",Utensils,"food"],
                  ["water","Água",Droplets,"water"],
                  ["parts","Peças",Settings,"parts"],
                ] as const).map(([key,label,Icon,tone]) =>
                  <div className={`scene-supply scene-supply-${tone}`} key={key}>
                    <div className="scene-supply-identity">
                      <Icon size={25} aria-hidden="true" />
                      <b>{label}</b>
                    </div>
                    <div className="scene-supply-control">
                      <Counter compact label={label} value={game.shelter[key]} max={key === "parts" ? 99 : 999}
                        editable quickStep={key === "parts" ? undefined : 4}
                        onChange={value=>edit(d=>{ if (key === "parts") d.shelter.parts = value;
                          else adjustProvisionCount(d.shelter, key, value); })} />
                    </div>
                  </div>)}
              </div>
              <p className="scene-supplies-note">Comida e Água em porções (4 = 1 unidade); Peças em unidades. Sem abrigo, registre apenas o que o grupo consegue transportar.</p>
            </section>
          </div>}
          <HexExplorer key={game.campaignId} game={game} edit={edit} playerPreview={readOnlyPreview} teamPeers={restPeers} />
          {!readOnlyPreview && <div className="panel panel-pad mt-5 flex flex-wrap items-center gap-3">
            <div className="mr-auto"><b>Relógio da expedição</b><p className="text-xs subtle">Ao anoitecer, registre o descanso na ficha, mesmo sem abrigo.</p></div>
            {[30,60,120].map(amount=><Button key={amount} size="sm" variant="outline" disabled={game.minutes+amount>=1440}
              onClick={() => {
                let completedWork: { name: string; points: number; completed: boolean }[] = [];
                edit(d => {
                  const result = advanceCampaignTime(d, amount, `Passaram ${amount} minutos na expedição.`);
                  completedWork = result.completedWork;
                });
                toast("Tempo avançado", {
                  description: completedWork.length
                    ? `+${amount < 60 ? `${amount} min` : `${amount / 60} h`} · ${completedWork.map(row => `${row.name} +${row.points}${row.completed ? " concluída" : ""}`).join(" · ")}`
                    : `+${amount < 60 ? `${amount} min` : `${amount / 60} h`} na expedição.`,
                });
              }}>
              +{amount<60?`${amount} min`:`${amount/60} h`}</Button>)}
            <Dialog open={timeEditorOpen} onOpenChange={setTimeEditorOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline" onClick={openTimeEditor}><Clock3 size={16} /> Ajustar horário</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Ajustar horário do dia</DialogTitle>
                <DialogDescription>Use esta correção quando a ficção pedir outro horário. A alteração fica registrada no diário da campanha.</DialogDescription></DialogHeader>
                <Field label="Horário" type="time" value={manualTime} onChange={setManualTime} />
                <DialogFooter><Button variant="outline" onClick={() => setTimeEditorOpen(false)}>Cancelar</Button><Button onClick={saveManualTime}>Salvar horário</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>}
        </>}
        {tab === "sobreviventes" && <SurvivorPanel game={game} edit={edit} playerPreview={readOnlyPreview} playerMode={role === "jogador"} restPeers={restPeers} />}
        {tab === "comunidade" && <NpcPanel game={game} edit={edit} playerPreview={readOnlyPreview} />}
        {tab === "abrigo" && <ShelterPanel game={game} edit={edit} playerPreview={readOnlyPreview} playerSurvivorId={role === "jogador" ? survivorId : null} />}
        {tab === "conflito" && role === "mestre" && !playerPreview && <ConflictSceneManager game={game} edit={edit} />}
        {tab === "ameacas" && role === "mestre" && !playerPreview && <section className="panel panel-pad"><ThreatManager game={game} edit={edit} /></section>}
        {tab === "referencias" && <ReferencePanel />}
        {tab === "jogadores" && role === "mestre" && <PlayersPanel game={game} ownerId={ownerId} />}
        {tab === "mapa" && !readOnlyPreview && <section className="panel panel-pad mt-5">
          <div className="flex items-center justify-between gap-3"><div><p className="dossier-title">Registro</p><h2 className="section-title mt-1">Últimos acontecimentos</h2></div>
            <span className="tag">{game.log.length} entradas</span></div>
          <div className="mt-3 grid gap-2">{game.log.slice(0,12).map(entry=><div key={entry.id} className="border-t pt-2 text-sm leading-relaxed">
            <span className="font-mono text-xs text-[#367478] mr-3">D{entry.day} {entry.time} · {entry.kind}</span>{entry.kind === "dados" ? localizeRollLog(entry.text) : entry.text}</div>)}</div>
        </section>}
      </main>
    </div>
    {chatOpen && <button type="button" className="table-chat-backdrop" aria-label="Fechar chat" onClick={() => setChatOpen(false)} />}
    <div id="table-chat"><TableChat game={game} edit={edit} role={role} survivorId={survivorId} readOnly={playerPreview} onClose={() => setChatOpen(false)} /></div>
    </SidebarProvider>
  </Tabs>;
}
