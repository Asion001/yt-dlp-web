import { apiRoutes, websocketHandler } from "./apps/backend/backend";

const server = Bun.serve({
  async fetch(req, server) {
    // Check if this is a WebSocket upgrade request
    const url = new URL(req.url);
    if (req.headers.get("upgrade") === "websocket") {
      const success = server.upgrade(req);
      if (success) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Handle API routes
    for (const [path, handlers] of Object.entries(apiRoutes)) {
      if (url.pathname === path || url.pathname.startsWith(path + "/")) {
        const method = req.method as keyof typeof handlers;
        const handler = handlers[method];
        if (handler && typeof handler === "function") {
          return handler(req as any);
        }
      }
    }

    // Serve static files from dist directory
    if (url.pathname !== "/") {
      const filePath = `./dist${url.pathname}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // Serve index.html for all other routes
    return new Response(Bun.file("./dist/index.html"));
  },

  websocket: websocketHandler,

  port: process.env.PORT || 3000,
  idleTimeout: 120,
});

console.log(`🚀 Server running at ${server.url}`);
