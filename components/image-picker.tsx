"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { Image as ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeSquareImage, normalizeImageReference } from "@/lib/client-image";

export function ImagePicker({
  label = "Imagem",
  value,
  onChange,
  fallback,
}: {
  label?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  fallback?: ReactNode;
}) {
  const [urlDraft, setUrlDraft] = useState(value && !value.startsWith("data:image/") ? value : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrlDraft(value && !value.startsWith("data:image/") ? value : "");
    setError("");
  }, [value]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await encodeSquareImage(file));
      setUrlDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar essa imagem.");
    } finally {
      setBusy(false);
    }
  }

  function applyUrl() {
    const normalized = normalizeImageReference(urlDraft);
    if (!normalized) {
      setError("Use um link http(s) válido.");
      return;
    }
    onChange(normalized);
    setError("");
  }

  function clear() {
    onChange(undefined);
    setUrlDraft("");
    setError("");
  }

  return <section className="image-picker">
    <div className="image-picker-preview" role="img" aria-label={label + " atual"}>
      {value ? <img src={value} alt="" /> : <span>{fallback ?? <ImageIcon size={28} aria-hidden="true" />}</span>}
    </div>
    <div className="image-picker-controls">
      <span className="field-label">{label}</span>
      <div className="image-picker-url">
        <Link2 size={15} aria-hidden="true" />
        <input value={urlDraft} onChange={event => setUrlDraft(event.target.value)} placeholder="https://..." aria-label={label + " por URL"} />
        <Button type="button" size="sm" variant="outline" disabled={!urlDraft.trim()} onClick={applyUrl}>Usar link</Button>
      </div>
      <div className="image-picker-actions">
        <label className="image-picker-upload">
          <Upload size={14} aria-hidden="true" /> {busy ? "Processando…" : "Enviar imagem"}
          <input type="file" accept="image/*" onChange={upload} disabled={busy} aria-label={"Enviar " + label.toLocaleLowerCase("pt-BR")} />
        </label>
        {value && <Button type="button" size="sm" variant="ghost" onClick={clear}><Trash2 size={14} /> Remover imagem</Button>}
      </div>
      <small className="subtle">Uploads são reduzidos automaticamente para economizar espaço na campanha.</small>
      {error && <p className="image-picker-error" role="alert">{error}</p>}
    </div>
  </section>;
}
