"use client";

import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Pick({ label, value, options, onChange, placeholder = "Escolha", disabled = false }: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return <div className="field">
    <span className="field-label">{label}</span>
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className="w-full bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(option => {
        const value = typeof option === "string" ? option : option.value;
        const title = typeof option === "string" ? option : option.label;
        return <SelectItem key={value} value={value}>{title}</SelectItem>;
      })}</SelectContent>
    </Select>
  </div>;
}

export function Counter({ label, value, max = 999, min = 0, onChange, compact = false, editable = false, quickStep }: {
  label: string; value: number; max?: number; min?: number; onChange: (value: number) => void;
  compact?: boolean; editable?: boolean; quickStep?: number;
}) {
  return <div className={`${compact ? "flex items-center justify-between gap-3" : "metric flex items-center justify-between gap-3"} flex-wrap`}>
    <span className="font-bold text-sm">{label}</span>
    <div className={`number-control ${editable ? "stock-control" : ""}`}>
      <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      {editable ? <input type="number" inputMode="numeric" min={min} max={max} value={value}
        aria-label={`Quantidade de ${label}`} onFocus={event => event.target.select()}
        onChange={event => {
          const number = Number(event.target.value);
          if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, Math.trunc(number))));
        }} /> : <output aria-label={`${label}: ${value}`}>{value}</output>}
      <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      {quickStep && <button type="button" aria-label={`Aumentar ${label} em ${quickStep}`} disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + quickStep))}>+{quickStep}</button>}
    </div>
  </div>;
}

export function Field({ label, value, onChange, placeholder, multiline = false, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; multiline?: boolean; type?: string;
}) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {multiline
      ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      : <input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />}
  </div>;
}
