"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { ImagePicker } from "@/components/image-picker";
import { createId } from "@/lib/id";
import type { TablePresentation } from "@/lib/game";

export function TablePresentationControl({
  campaignId,
  presentation,
  onPresentationChange,
}: {
  campaignId: string;
  presentation?: TablePresentation;
  onPresentationChange: (presentation: TablePresentation | undefined) => void;
}) {
  const active = presentation?.active ? presentation : undefined;
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setImage(active?.image ?? "");
    setTitle(active?.title ?? "");
    setCaption(active?.caption ?? "");
    setError("");
    setOpen(true);
  }

  const endpoint = "/api/campaign/presentation?campanha=" + encodeURIComponent(campaignId);

  async function show() {
    if (!image.trim() || busy) return;
    const next: TablePresentation = {
      id: createId(),
      image: image.trim(),
      title: title.trim().slice(0, 120) || undefined,
      caption: caption.trim().slice(0, 500) || undefined,
      active: true,
    };
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; presentation?: TablePresentation };
      if (!response.ok) throw new Error(result.error || "Não foi possível exibir a imagem.");
      onPresentationChange(result.presentation ?? next);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exibir a imagem.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível encerrar a apresentação.");
      onPresentationChange(undefined);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encerrar a apresentação.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className={`table-presentation-trigger${active ? " is-active" : ""}`}
      onClick={openEditor} aria-label="Exibir imagem aos jogadores" title="Exibir imagem aos jogadores">
      <ImageIcon size={17} aria-hidden="true" />
      <span>{active ? "Imagem em exibição" : "Exibir imagem"}</span>
      {active && <i aria-hidden="true" />}
    </button>

    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="table-presentation-dialog sm:max-w-[700px]">
        <DialogHeader>
          <p className="dossier-title">Ferramenta do mestre</p>
          <DialogTitle>Exibir imagem aos jogadores</DialogTitle>
          <DialogDescription>A imagem abre na tela dos jogadores, com o título e a legenda que você definir.</DialogDescription>
        </DialogHeader>
        <div className="table-presentation-editor">
          {active && <p className="table-presentation-status" role="status">Em exibição: <b>{active.title || "Imagem sem título"}</b>. Você pode trocar a imagem ou encerrar a exibição para todos.</p>}
          <ImagePicker label="Imagem" mode="presentation" value={image || undefined} onChange={value => setImage(value ?? "")} fallback={<ImageIcon size={34} aria-hidden="true" />} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título opcional" value={title} onChange={setTitle} placeholder="Ex.: Fotografia encontrada" />
            <Field label="Legenda opcional" value={caption} onChange={setCaption} multiline placeholder="O que os jogadores podem ler junto da imagem" />
          </div>
          {error && <p className="image-picker-error" role="alert">{error}</p>}
        </div>
        <DialogFooter className="table-presentation-dialog-actions">
          {active && <Button type="button" variant="outline" disabled={busy} onClick={() => void stop()}><X size={15} /> Encerrar exibição</Button>}
          <span className="table-presentation-dialog-spacer" />
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" disabled={!image.trim() || busy} onClick={() => void show()}>
            <ImageIcon size={15} /> {busy ? "Enviando…" : "Mostrar aos jogadores"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function TablePresentationViewer({ presentation, enabled }: {
  presentation?: TablePresentation;
  enabled: boolean;
}) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = Boolean(presentation && expandedId === presentation.id);
  const visible = Boolean(enabled && presentation?.active && presentation.id !== dismissedId);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && presentation) setDismissedId(presentation.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, presentation]);


  if (!enabled || !presentation?.active) return null;
  if (!visible) return <button type="button" className="table-presentation-trigger table-presentation-reopen"
    onClick={() => setDismissedId(null)} aria-label="Reabrir imagem apresentada pelo mestre" title={presentation.title || "Reabrir imagem"}>
    <ImageIcon size={17} aria-hidden="true" /><span>Reabrir imagem</span>
  </button>;

  return <div className={`table-presentation-overlay${expanded ? " is-expanded" : ""}`} role="dialog" aria-modal="true" aria-label={presentation.title || "Imagem apresentada pelo mestre"}>
    <button type="button" className="table-presentation-backdrop" aria-label="Fechar imagem" onClick={() => setDismissedId(presentation.id)} />
    <section className="table-presentation-card">
      <header>
        <div>
          <p className="dossier-title">Apresentação da mesa</p>
          {presentation.title && <h2>{presentation.title}</h2>}
        </div>
        <div className="table-presentation-view-actions">
          <Button type="button" size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : presentation.id)}
            aria-label={expanded ? "Reduzir imagem" : "Ampliar imagem"} title={expanded ? "Reduzir" : "Ampliar"}>
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDismissedId(presentation.id)} aria-label="Fechar imagem" title="Fechar">
            <X size={16} />
          </Button>
        </div>
      </header>
      <div className="table-presentation-image"><img src={presentation.image} alt={presentation.title || "Imagem apresentada pelo mestre"} /></div>
      {presentation.caption && <p className="table-presentation-caption">{presentation.caption}</p>}
      <small className="table-presentation-local-note">Fechar remove apenas da sua tela. O mestre controla quando a exibição termina para todos.</small>
    </section>
  </div>;
}
