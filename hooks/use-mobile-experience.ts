"use client";

import { useSyncExternalStore } from "react";

/** Fronteira do shell móvel. O CSS de celular usa @media (max-width: 767px) / (min-width: 768px) para coincidir. */
export const MOBILE_EXPERIENCE_QUERY = "(max-width: 767px)";

function subscribe(notify: () => void) {
  const query = window.matchMedia(MOBILE_EXPERIENCE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** A apresentação muda; o estado da campanha permanece no CampaignApp. */
export function useMobileExperience() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_EXPERIENCE_QUERY).matches, () => false);
}
