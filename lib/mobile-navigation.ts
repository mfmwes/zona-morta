type MobileNavigationOptions = { master: boolean; conflictActive: boolean; pendingDamage: number };

export function mobilePrimaryNavigation({ master, conflictActive, pendingDamage }: MobileNavigationOptions) {
  return master
    ? [{ value: "resumo", label: "Agora" }, { value: "mapa", label: "Mapa" }, { value: "sobreviventes", label: "Equipe" }, { value: "chat", label: "Chat" }]
    : [{ value: "sobreviventes", label: "Ficha" }, { value: "mapa", label: "Mapa" }, conflictActive
      ? { value: "conflito", label: pendingDamage > 0 ? `Dano (${pendingDamage})` : "Conflito" }
      : { value: "abrigo", label: "Abrigo" }, { value: "chat", label: "Chat" }];
}

export function mobileReturnSection(section: string, master: boolean, conflictActive: boolean) {
  if (["chat", "mais"].includes(section) || (!conflictActive && section === "conflito" && !master)) return master ? "resumo" : "sobreviventes";
  return section;
}
