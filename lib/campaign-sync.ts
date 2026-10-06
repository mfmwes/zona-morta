export type CampaignSyncNotice = {
  type: "changed";
  revision?: number;
  presentation?: boolean;
};

function mergeNotice(current: CampaignSyncNotice | undefined, next: CampaignSyncNotice) {
  if (!current) return next;
  const revision = Math.max(current.revision ?? -1, next.revision ?? -1);
  return {
    type: "changed" as const,
    ...(revision >= 0 ? { revision } : {}),
    ...((current.presentation || next.presentation) ? { presentation: true } : {}),
  };
}

// One subscription per open campaign. WebSocket invalidations are the primary
// path; the short reconciliation interval is only a safety net for lost or
// suspended connections.
export function startCampaignSync(
  url: string,
  refresh: (notice: CampaignSyncNotice) => Promise<number | void>,
) {
  let socket: WebSocket | undefined;
  let stopped = false, running = false;
  let queued: CampaignSyncNotice | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;

  const update = async (notice: CampaignSyncNotice = { type: "changed" }) => {
    if (stopped) return;
    queued = mergeNotice(queued, notice);
    if (running) return;
    running = true;
    try {
      while (queued && !stopped) {
        const current = queued;
        queued = undefined;
        let attempts = 0;
        do {
          const observedRevision = await refresh(current);
          if (current.revision === undefined || observedRevision === undefined || observedRevision >= current.revision) break;
          attempts += 1;
        } while (attempts < 3 && !stopped);
      }
    } catch {
      // A reconciliação periódica tenta novamente sem derrubar a interface.
    } finally {
      running = false;
      // Uma notificação pode chegar entre a última leitura e o finally.
      if (queued && !stopped) void update();
    }
  };

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      retryDelay = 250;
      void update();
    };
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as Partial<CampaignSyncNotice> & { type?: string };
        if (message.type !== "changed") return;
        const revision = Number.isInteger(message.revision) && Number(message.revision) >= 0 ? Number(message.revision) : undefined;
        void update({
          type: "changed",
          ...(revision !== undefined ? { revision } : {}),
          ...(message.presentation === true ? { presentation: true } : {}),
        });
      } catch { /* Ignore malformed frames. */ }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (stopped) return;
      // HTTP remains available even while the WebSocket reconnects.
      void update();
      retry = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 4000);
    };
  };

  const wake = () => {
    if (document.visibilityState === "hidden") return;
    void update();
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      clearTimeout(retry);
      connect();
    }
  };

  // Previously 5s. Two seconds is only a recovery ceiling; healthy sockets
  // still refresh immediately from invalidations.
  const timer = setInterval(() => { void update(); }, 2000);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("zona-morta:campaign-refresh", wake);
  connect();

  return () => {
    stopped = true;
    queued = undefined;
    clearInterval(timer);
    clearTimeout(retry);
    socket?.close();
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("zona-morta:campaign-refresh", wake);
  };
}
