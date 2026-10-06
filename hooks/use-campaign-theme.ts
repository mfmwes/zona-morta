"use client";

import { useSyncExternalStore } from "react";

type CampaignTheme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function snapshot(): CampaignTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useCampaignTheme() {
  return useSyncExternalStore(subscribe, snapshot, (): CampaignTheme => "light");
}
