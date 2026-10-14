"use client";

import { useSyncExternalStore } from "react";
import { isVisualStyle, type VisualStyle } from "@/lib/appearance";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-visual-style"] });
  return () => observer.disconnect();
}

function snapshot(): VisualStyle {
  const value = document.documentElement.dataset.visualStyle;
  return isVisualStyle(value) ? value : "current";
}

export function useVisualStyle() {
  return useSyncExternalStore(subscribe, snapshot, (): VisualStyle => "current");
}
