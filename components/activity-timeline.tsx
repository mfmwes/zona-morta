"use client";

import { HeartPulse, Clock3, Footprints, Moon, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { createId } from "@/lib/id";
import type { MasterActionControls } from "@/components/player-actions-panel";
import { cancelActivity, runningActivities } from "@/lib/activity-timeline";
import { advanceToNextActivity, nextActivityMinute } from "@/lib/time";
import { displayTime, hasMultipleSurvivorGroups, type GameState } from "@/lib/game";

export function ActivityTimeline({ game, edit, canAct = true, controls }: { controls?: MasterActionControls; game: GameState; edit?: (fn: (draft: GameState) => void) => void; canAct?: boolean }) {
  const [busy, setBusy] = useState(false);
  const master = Boolean(edit || controls);
  const disabled = busy || !canAct || Boolean(controls?.pending);
  const activities = master ? runningActivities(game) : game.publicActivities ?? [];
  const work = (game.shelter.projects ?? []).flatMap(project => [
    ...(project.workShift ? [{ id: `${project.id}-npc`, label: `Obra · ${project.name}`, end: project.workShift.endAbsoluteMinute - (game.day - 1) * 1440 }] : []),
    ...(project.volunteerShifts ?? []).map(shift => ({ id: `${project.id}-${shift.survivorId}`, label: `${game.survivors.find(p => p.id === shift.survivorId)?.name ?? "Sobrevivente"} · ${project.name}`, end: shift.endAbsoluteMinute - (game.day - 1) * 1440 })),
  ]).filter(row => row.end >= game.minutes);
  const next = master ? nextActivityMinute(game) : null;
  const parallel = hasMultipleSurvivorGroups(game);
  // Mantém acesso às atividades da versão anterior ou que aguardam uma consequência.
  const needsCompletion = master && runningActivities(game).some(a => a.type !== "search" || a.issue);
  if ((!parallel && !needsCompletion) || (!activities.length && !work.length)) return null;
  const peers = game.publicPlayerActions?.peers ?? game.survivors;
  async function advance() {
    if (busy) return;
    if (controls && next !== null) {
      setBusy(true);
      try { await controls.send({ type: "advance-activity", id: createId(), day: game.day, expectedMinute: game.minutes, expectedNext: next }); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível avançar."); }
      finally { setBusy(false); }
      return;
    }
    let result: ReturnType<typeof advanceToNextActivity> | undefined;
    edit?.(draft => { result = advanceToNextActivity(draft); });
    if (!result?.ok) { toast.error(result?.issue ?? "Não foi possível avançar o relógio."); return; }
    if (result.issue) toast.info("Relógio aguardando resolução", { description: result.issue });
    else toast.success("Próxima conclusão registrada");
  }
  return <section className="activity-timeline" aria-label="Atividades e próximas conclusões">
    <div className="activity-timeline-heading"><span><Clock3 size={16} /><b>Em atividade</b></span>
      {master && <Button size="sm" disabled={disabled || next === null || Boolean(game.conflict?.active)} onClick={advance}>
        {next === game.minutes ? "Resolver conclusão" : "Avançar até"} {next !== null && displayTime(next)}
      </Button>}
    </div>
    <div className="activity-timeline-list">
      {activities.map(activity => {
        const Icon = activity.type === "travel" ? Footprints : activity.type === "search" ? Search : activity.type === "treatment" ? HeartPulse : Moon;
        return <article className={`activity-timeline-item${activity.issue ? " has-issue" : ""}`} key={activity.id}>
          <Icon size={16} /><div><b>{activity.participantIds.map(id => peers.find(p => p.id === id)?.name ?? "Sobrevivente").join(", ")}</b>
            <small>{activity.label} · {displayTime(activity.startMinute)} → <strong>{displayTime(activity.endMinute)}</strong></small>
            {activity.issue && <small role="status">{master ? game.activities?.find(a => a.id === activity.id)?.issue : activity.issue}</small>}
          </div>{master && <Button size="sm" variant="ghost" disabled={disabled} title="Interromper sem desfazer o tempo decorrido" onClick={async () => {
            if (controls) { setBusy(true); try { await controls.send({ type: "cancel-activity", id: createId(), day: game.day, activityId: activity.id }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível interromper."); } finally { setBusy(false); } }
            else edit?.(draft => { cancelActivity(draft, activity.id); });
          }}>Interromper</Button>}
        </article>;
      })}
      {work.map(row => <article className="activity-timeline-item" key={row.id}><Wrench size={16} /><div><b>{row.label}</b><small>Trabalho até <strong>{displayTime(row.end)}</strong></small></div></article>)}
    </div>
  </section>;
}
