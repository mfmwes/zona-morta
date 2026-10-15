export type SceneTool = "select" | "pan" | "wall" | "door" | "window" | "reveal" | "conceal";

export const sceneToolShortcuts: { tool: SceneTool; key: string; label: string; construction?: boolean; fog?: boolean }[] = [
  { tool: "select", key: "V", label: "Selecionar" },
  { tool: "pan", key: "H", label: "Mover câmera" },
  { tool: "wall", key: "W", label: "Desenhar parede", construction: true },
  { tool: "door", key: "D", label: "Porta na parede", construction: true },
  { tool: "window", key: "J", label: "Janela na parede", construction: true },
  { tool: "reveal", key: "E", label: "Revelar área", fog: true },
  { tool: "conceal", key: "O", label: "Ocultar área", fog: true },
];

type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
};
type ShortcutContext = {
  readonly: boolean;
  preparing: boolean;
  fogEnabled: boolean;
  blocked: boolean;
  interacting: boolean;
};
type SceneShortcut =
  | { action: "tool"; tool: SceneTool }
  | { action: "rotate"; delta: number }
  | { action: "zoom"; delta: number }
  | { action: "cancel" | "labels" | "grid" | "multi" | "center" | "room" | "undo" | "redo" };

/** Called only for keyboard events within the focused scene workspace. */
export function sceneShortcut(event: ShortcutEvent, context: ShortcutContext): SceneShortcut | null {
  if (context.readonly || context.blocked || event.altKey || event.repeat || event.isComposing) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (context.interacting) return null;
    if (key === "z") return { action: event.shiftKey ? "redo" : "undo" };
    if (key === "y" && !event.shiftKey) return { action: "redo" };
    return null;
  }
  if (key === "escape") return { action: "cancel" };
  // Keep the active pointer gesture stable until it finishes or is cancelled.
  if (context.interacting) return null;
  if (key === "r") return { action: "rotate", delta: event.shiftKey ? -15 : 15 };
  if (key === "+" || key === "=") return { action: "zoom", delta: .1 };
  if (key === "-" || key === "_") return { action: "zoom", delta: -.1 };
  if (event.shiftKey) return null;
  const tool = sceneToolShortcuts.find(entry => entry.key.toLowerCase() === key);
  if (tool) {
    if ((tool.construction && !context.preparing) || (tool.fog && !context.fogEnabled)) return null;
    return { action: "tool", tool: tool.tool };
  }
  if (key === "s" && context.preparing) return { action: "room" };
  if (key === "l") return { action: "labels" };
  if (key === "g") return { action: "grid" };
  if (key === "m") return { action: "multi" };
  if (key === "f") return { action: "center" };
  return null;
}
