"use client";
import { useId, type ReactNode } from "react";
import { Check, UserRound } from "lucide-react";

export function ChoiceCard({ title, description, checked, disabled, onChange, icon, name }: {
  title: string; description?: string; checked: boolean; disabled?: boolean;
  onChange: (checked: boolean) => void; icon?: ReactNode; name?: string;
}) {
  const id = useId();
  return <label className={`choice-card${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
    <input type="checkbox" name={name} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={title} aria-describedby={description ? id : undefined} />
    <span className="choice-card-icon" aria-hidden="true">{icon ?? <UserRound size={18} />}</span>
    <span className="choice-card-copy"><b>{title}</b>{description && <small id={id}>{description}</small>}</span>
    <span className="choice-card-mark" aria-hidden="true">{checked && <Check size={14} />}</span>
  </label>;
}
