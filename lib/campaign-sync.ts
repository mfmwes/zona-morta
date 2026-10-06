// One subscription per open campaign, coalescing notifications while fetching.
// The periodic check also recovers missed notifications and suspended tabs.
export function startCampaignSync(url: string, refresh: () => Promise<void>) {
  let socket: WebSocket | undefined;
  let stopped = false, running = false, again = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;
  const update = async () => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try {
      do { again = false; await refresh(); } while (again && !stopped);
    } catch { /* A reconciliação periódica tenta novamente. */ }
    finally { running = false; }
  };
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url);
    socket.onopen = () => { retryDelay = 1000; void update(); };
    socket.onmessage = event => {
      try { if (JSON.parse(event.data).type === "changed") void update(); } catch { /* Ignore malformed frames. */ }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (stopped) return;
      retry = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    };
  };
  const wake = () => {
    if (document.visibilityState === "hidden") return;
    void update();
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      clearTimeout(retry); connect();
    }
  };
  const timer = setInterval(() => { void update(); }, 5000);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("zona-morta:campaign-refresh", wake);
  connect();
  return () => {
    stopped = true;
    clearInterval(timer); clearTimeout(retry);
    socket?.close();
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("zona-morta:campaign-refresh", wake);
  };
}
