// This channel sends invalidations only. Campaign data always comes from the
// authenticated HTTP endpoints and their master/player projections.
export class CampaignLive {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request) {
    if (request.method === "POST") {
      let revision: number | undefined;
      let presentation = false;
      try {
        const notice = await request.json() as { revision?: unknown; presentation?: unknown };
        const candidate = typeof notice.revision === "number" ? notice.revision : NaN;
        if (Number.isInteger(candidate) && candidate >= 0) revision = candidate;
        presentation = notice.presentation === true;
      } catch { /* Avisos internos antigos continuam compatíveis. */ }
      const message = JSON.stringify({
        type: "changed",
        ...(revision !== undefined ? { revision } : {}),
        ...(presentation ? { presentation: true } : {}),
      });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch { socket.close(1011, "Reconectar"); }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ type: "changed" }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") socket.send(JSON.stringify({ type: "pong" }));
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) { socket.close(code, reason); }
  webSocketError(socket: WebSocket) { socket.close(1011, "Reconectar"); }
}
