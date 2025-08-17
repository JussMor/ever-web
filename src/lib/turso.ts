import { createClient, type Client } from "@libsql/client/web";

// For Cloudflare Pages v2, we need to create the client dynamically with env
export function createTursoClient(env?: any): Client {
  // In development, fall back to import.meta.env if env is not provided
  const databaseUrl = env?.TURSO_DATABASE_URL || import.meta.env.TURSO_DATABASE_URL || "";
  const authToken = env?.TURSO_AUTH_TOKEN || import.meta.env.TURSO_AUTH_TOKEN || "";
  
  return createClient({
    url: databaseUrl,
    authToken: authToken,
  });
}
