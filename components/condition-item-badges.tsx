"use client";

import { Bone, Droplets, HeartPulse, Snowflake, ThermometerSun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { conditionInteractionLabel, itemConditionEffects } from "@/lib/condition-item-effects";
import type { SurvivorConditionKind } from "@/lib/survivor-condition-types";

const icons: Partial<Record<SurvivorConditionKind, typeof Snowflake>> = {
  cold: Snowflake,
  heat: ThermometerSun,
  wet: Droplets,
  bleeding: HeartPulse,
  injury: HeartPulse,
  fracture: Bone,
};

export function ConditionItemBadges({ itemName, compact = false }: { itemName: string; compact?: boolean }) {
  const effects = itemConditionEffects(itemName);
  if (!effects.length) return null;
  return <TooltipProvider delayDuration={180}>
    <div className={compact ? "condition-item-badges compact" : "condition-item-badges"} aria-label="Interações com condições">
      {effects.map(effect => {
        const Icon = icons[effect.condition] ?? Droplets;
        return <Tooltip key={effect.id}>
          <TooltipTrigger asChild>
            <span className={`condition-item-badge condition-${effect.condition}`} tabIndex={0}>
              <Icon size={13} aria-hidden="true" />
              <span>{compact ? effect.label.split(" · ")[0] : effect.label}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent sideOffset={6} className="condition-item-tooltip">
            <b>{effect.label}</b>
            <span>{effect.summary}</span>
            {effect.requires && <small>Requer: {effect.requires}</small>}
            <small>{conditionInteractionLabel(effect.interaction)}</small>
          </TooltipContent>
        </Tooltip>;
      })}
    </div>
  </TooltipProvider>;
}
