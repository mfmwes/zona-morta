"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { GameState } from "@/lib/game";
import { clearCampaignHistory, historyEntries, type HistoryScope } from "@/lib/history";

export function HistoryClearButton({ game, edit, scope, role, readOnly = false, iconOnly = false }: {
  game: GameState; edit: (fn: (draft: GameState) => void) => void; scope: HistoryScope;
  role: "mestre" | "jogador" | "convidado"; readOnly?: boolean; iconOnly?: boolean;
}) {
  if (role !== "mestre" || readOnly) return null;
  const count = historyEntries(game, scope).length;
  const label = scope === "chat" ? "Limpar chat" : "Limpar acontecimentos";
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button size={iconOnly ? "icon" : "sm"} variant="outline" disabled={count === 0}
      aria-label={label} title={label}>
      <Trash2 size={15} aria-hidden="true" /><span className={iconOnly ? "sr-only" : undefined}>{label}</span>
    </Button></AlertDialogTrigger>
    <AlertDialogContent className="z-[100]" overlayClassName="z-[90]">
      <AlertDialogHeader><AlertDialogTitle>{label}?</AlertDialogTitle>
        <AlertDialogDescription>
          {scope === "chat"
            ? `Excluir ${count} registro(s) de mensagens, rolagens e danos do chat para toda a mesa? Os acontecimentos da campanha serão mantidos.`
            : `Excluir ${count} acontecimento(s) da campanha? As mensagens, rolagens e danos do chat serão mantidos.`}
          {" "}Essa exclusão não pode ser desfeita. As fichas e os valores já aplicados à campanha permanecem como estão.
        </AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={() => {
          if (role === "mestre" && !readOnly) edit(draft => { clearCampaignHistory(draft, scope); });
        }}>{label}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
