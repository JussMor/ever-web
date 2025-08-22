// Types for Cloudflare Pages environment
export interface CloudflareEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  EMAIL: string;
}

export interface CloudflareLocals {
  runtime?: {
    env: CloudflareEnv;
  };
}
