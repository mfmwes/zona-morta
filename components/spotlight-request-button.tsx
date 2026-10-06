"use client";

import { useState } from "react";
import { Crosshair } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SpotlightRequestButton({ campaignId, requested, ownSpotlight, down = false, preview = false }: {
  campaignId: string;
  requested: boolean;
  ownSpotlight: boolean;
  down?: boolean;
  preview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggleRequest() {
    if (busy || ownSpotlight || down) return;
    if (preview) {
      toast.info("Prévia dos jogadores", { description: "O jogador poderá pedir ou cancelar o Spotlight aqui. A prévia não altera a campanha." });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const action = requested ? "cancel" : "request";
      const response = await fetch(`/api/campaign/spotlight?campanha=${encodeURIComponent(campaignId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o pedido.");
      toast.success(action === "request" ? "Spotlight solicitado" : "Pedido de spotlight cancelado");
      window.dispatchEvent(new CustomEvent("zona-morta:campaign-refresh"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="conflict-request-control">
    <Button className="character-spotlight-request" size="sm" variant={requested ? "secondary" : "outline"}
      disabled={busy || ownSpotlight || down} onClick={() => void toggleRequest()}
      title={requested && !ownSpotlight ? "Cancelar seu pedido de Spotlight" : undefined}>
      <Crosshair size={14} /> {busy ? "Enviando…" : ownSpotlight ? "Seu Spotlight" : requested ? "Cancelar pedido" : "Pedir Spotlight"}
    </Button>
    {error && <p className="character-conflict-error" role="alert">{error}</p>}
  </div>;
}
