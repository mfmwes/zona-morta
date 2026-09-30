"use client";

import { useState } from "react";
import { Moon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/game-controls";
import { closeDay, eveningNeeds } from "@/lib/survival";
import { survivorHex, type GameState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;

export function DayCloseDialog({
  game,
  edit,
  label = "Encerrar dia",
  variant = "default",
  size = "default",
  className,
}: {
  game: GameState;
  edit: Edit;
  label?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [foodConsumers, setFoodConsumers] = useState("0");
  const [waterConsumers, setWaterConsumers] = useState("0");

  const consumptionValid = [foodConsumers, waterConsumers].every(value =>
    value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 999
  );
  const storageHex = game.shelter.hex ?? game.partyHex;
  const survivorsAway = game.survivors.filter(person => survivorHex(game, person) !== storageHex);

  function prepare() {
    const needs = eveningNeeds(game);
    setFoodConsumers(String(needs.food));
    setWaterConsumers(String(needs.water));
  }

  function nextMorning() {
    if (!consumptionValid) return;
    let completed = false;
    edit(draft => {
      completed = closeDay(draft, Number(foodConsumers), Number(waterConsumers), game.day);
    });
    if (!completed) {
      toast.error("Não foi possível encerrar o dia.", {
        description: "O estado da campanha mudou. Confira os valores e tente novamente.",
      });
      return;
    }
    toast.success("Novo amanhecer registrado", {
      description: `Dia ${game.day + 1}, 08:00. Provisões, validade e progressão diária foram processadas.`,
    });
    setOpen(false);
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button size={size} variant={variant} className={className} onClick={prepare}>
        <Moon size={16} /><span className="day-close-label">{label}</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="day-close-dialog">
      <DialogHeader>
        <DialogTitle>Encerrar o dia {game.day}</DialogTitle>
        <DialogDescription>
          Avança a campanha para o próximo amanhecer às 08:00. Isso não realiza descanso curto nem descanso longo; descansos continuam sendo resolvidos separadamente nas fichas.
        </DialogDescription>
      </DialogHeader>

      <div className="day-close-summary">
        <div><span>AGORA</span><b>Dia {game.day}</b><small>horário atual da campanha</small></div>
        <Moon size={20} aria-hidden="true" />
        <div><span>PRÓXIMO</span><b>Dia {game.day + 1} · 08:00</b><small>novo amanhecer</small></div>
      </div>

      <p className="character-rule-note">
        Ao confirmar, o sistema processa consumo das reservas compartilhadas, alimentos vencidos, progressão da infecção, zera Barulho e inicia uma nova cena. Nenhum benefício de descanso é aplicado automaticamente.
      </p>

      <div className="inventory-search">
        <Field label="Comida das reservas · porções" value={foodConsumers} onChange={setFoodConsumers} type="number" />
        <Field label="Água das reservas · porções" value={waterConsumers} onChange={setWaterConsumers} type="number" />
      </div>

      {survivorsAway.length > 0 && <p className="character-rule-note">
        Há sobreviventes longe das reservas compartilhadas: {survivorsAway.map(person => person.name).join(", ")}. A sugestão considera apenas moradores e sobreviventes presentes no local das reservas; provisões pessoais usadas por grupos em campo devem estar registradas nas respectivas fichas.
      </p>}

      <p className="text-sm subtle">
        Os valores sugeridos descontam quem já registrou consumo pessoal hoje. Ajuste apenas se a ficção exigir outra fonte ou quantidade. Faltas serão registradas no diário.
      </p>
      {!consumptionValid && <p className="inventory-danger" role="alert">Informe quantidades inteiras entre 0 e 999.</p>}

      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={!consumptionValid} onClick={nextMorning}>Confirmar e iniciar dia {game.day + 1}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
