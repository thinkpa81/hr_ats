// Cloudflare Workers Bindings
export type Bindings = {
  DB: D1Database;
}

// Hono Context Type
export type HonoContext = {
  Bindings: Bindings;
}
