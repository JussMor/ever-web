// Types for Cloudflare Workers environment
export interface CloudflareEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  EMAIL: string;
  ASSETS: any; // Static assets binding
  // SESSION?: any; // Optional KV namespace for sessions
}

export interface CloudflareLocals {
  runtime?: {
    env: CloudflareEnv;
    cf: any;
    ctx: any;
  };
}
