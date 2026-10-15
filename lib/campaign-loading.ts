export const campaignLoadTimeoutMs = 15_000;

/** Bound both the response and its JSON body; an interrupted load must be retryable. */
export async function fetchCampaignResource<T>(url: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => {
      const reason = signal?.reason ?? new DOMException("Carregamento cancelado.", "AbortError");
      controller.abort(reason);
      reject(reason);
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      const error = new Error("O servidor demorou para responder. Tente novamente; seus dados salvos continuam preservados.");
      controller.abort(error);
      reject(error);
    }, campaignLoadTimeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        controller.signal.throwIfAborted();
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        // An expired session must reach the login screen even with an empty response.
        const data = response.status === 401 ? {} as T : await response.json() as T;
        return { ok: response.ok, status: response.status, data };
      })(),
      stopped,
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
