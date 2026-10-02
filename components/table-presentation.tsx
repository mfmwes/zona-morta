"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { ImagePicker } from "@/components/image-picker";
import { createId } from "@/lib/id";
import type { GameState, TablePresentation } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;

export function TablePresentationControl({ game, edit }: { game: GameState; edit: Edit }) {
  const active = game.presentation?.active ? game.presentation : undefined;
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (!open) return;
    setImage(active?.image ?? "");
    setTitle(active?.title ?? "");
    setCaption(active?.caption ?? "");
  }, [open, active?.id, active?.image, active?.title, active?.caption]);

  function show() {
    if (!image.trim()) return;
    edit(draft => {
      draft.presentation = {
        id: createId(),
        image: image.trim(),
        title: title.trim().slice(0, 120) || undefined,
        caption: caption.trim().slice(0, 500) || undefined,
        active: true,
      };
    });
    setOpen(false);
  }

  function stop() {
    edit(draft => { delete draft.presentation; });
    setOpen(false);
  }

  return <>
    <button type="button" className={`table-presentation-trigger${active ? " is-active" : ""}`}
      onClick={() => setOpen(true)} aria-label="Exibir imagem aos jogadores" title="Exibir imagem aos jogadores">
      <ImageIcon size={17} aria-hidden="true" />
      <span>{active ? "Imagem em exibição" : "Exibir imagem"}</span>
      {active && <i aria-hidden="true" />}
    </button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="table-presentation-dialog sm:max-w-[700px]">
        <DialogHeader>
          <p className="dossier-title">Ferramenta do mestre</p>
          <DialogTitle>Exibir imagem aos jogadores</DialogTitle>
          <DialogDescription>A imagem abre em um pop-out próprio na tela dos jogadores e não é enviada ao Chat da Mesa.</DialogDescription>
        </DialogHeader>
        <div className="table-presentation-editor">
          <ImagePicker label="Imagem" mode="presentation" value={image || undefined} onChange={value => setImage(value ?? "")} fallback={<ImageIcon size={34} aria-hidden="true" />} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título opcional" value={title} onChange={setTitle} placeholder="Ex.: Fotografia encontrada" />
            <Field label="Legenda opcional" value={caption} onChange={setCaption} placeholder="O que os jogadores podem ler junto da imagem" />
          </div>
        </div>
        <DialogFooter className="table-presentation-dialog-actions">
          {active && <Button type="button" variant="outline" onClick={stop}><X size={15} /> Encerrar exibição</Button>}
          <span className="table-presentation-dialog-spacer" />
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" disabled={!image.trim()} onClick={show}><ImageIcon size={15} /> Mostrar aos jogadores</Button>
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
  const [expanded, setExpanded] = useState(false);
  const visible = Boolean(enabled && presentation?.active && presentation.id !== dismissedId);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && presentation) setDismissedId(presentation.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, presentation]);

  useEffect(() => { setExpanded(false); }, [presentation?.id]);

  if (!visible || !presentation) return null;

  return <div className={`table-presentation-overlay${expanded ? " is-expanded" : ""}`} role="dialog" aria-modal="true" aria-label={presentation.title || "Imagem apresentada pelo mestre"}>
    <button type="button" className="table-presentation-backdrop" aria-label="Fechar imagem" onClick={() => setDismissedId(presentation.id)} />
    <section className="table-presentation-card">
      <header>
        <div>
          <p className="dossier-title">Apresentação da mesa</p>
          {presentation.title && <h2>{presentation.title}</h2>}
        </div>
        <div className="table-presentation-view-actions">
          <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(value => !value)}
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
