"use client";
import { useMemo, useSyncExternalStore } from "react";
import { readSceneLibrary, type SceneLibrary } from "@/lib/scene-templates";

const changed = "zona-morta:scene-library";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(changed, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changed, callback); };
}
const serverSnapshot = () => null;
export function useSceneLibrary(campaignId: string) {
  const key = `zona-morta:scene-library:v1:${campaignId}`;
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }, serverSnapshot);
  const library = useMemo(() => readSceneLibrary(snapshot), [snapshot]);
  function update(mutate: (value: SceneLibrary) => void) {
    try {
      const value = readSceneLibrary(window.localStorage.getItem(key)); mutate(value);
      window.localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new Event(changed));
    } catch (error) { throw new Error(error instanceof Error && error.message ? error.message : "Não foi possível salvar a biblioteca neste navegador."); }
  }
  return { library, update };
}
