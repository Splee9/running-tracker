import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";

// `npm run dev` serves /api/<name> from src/server/<name>.ts, the same handlers Vercel runs.
// Without BRAIN_GITHUB_TOKEN they read the local src/activities.json; without a Jev key,
// /api/jev-rerank answers 503 and the lookup stays on its local shortlist, as in production.
const API_ROUTES = new Set(["activities", "pulse", "jev-rerank"]);

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = /^\/api\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
        if (!route || !API_ROUTES.has(route)) return next();
        try {
          const mod = await server.ssrLoadModule(`/src/server/${route}.ts`);
          const handler = mod[req.method ?? "GET"] as ((request: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            res.end();
            return;
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const response = await handler(
            new Request(url, { method: req.method, headers, body: await readBody(req) }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
});
