# Turso Database Setup Instructions

## Prerequisites

1. Install Turso CLI:

   ```bash
   # macOS/Linux with Homebrew
   brew install tursodatabase/tap/turso

   # Manual installation
   curl -sSfL https://get.tur.so/install.sh | bash
   ```

2. Authenticate with Turso:
   ```bash
   turso auth login
   ```

## Database Setup

1. Create a database:

   ```bash
   turso db create everweb-contacts
   ```

2. Get your database credentials:

   ```bash
   # Get database URL
   turso db show everweb-contacts --url

   # Create authentication token
   turso db tokens create everweb-contacts
   ```

3. Create the database schema:

   ```bash
   # Connect to database shell
   turso db shell everweb-contacts

   # Copy and paste the contents of schema.sql
   # Or run: .read schema.sql (if you upload the file)
   ```

4. Set up environment variables:

   ```bash
   # Create .env file
   cp .env.example .env

   # Edit .env and add your actual values:
   TURSO_DATABASE_URL=libsql://your-database-url.turso.io
   TURSO_AUTH_TOKEN=your-auth-token-here
   ```

## For Cloudflare Workers Deployment

If deploying to Cloudflare Workers, add secrets:

```bash
# Add database URL as secret
npx wrangler secret put TURSO_DATABASE_URL
# When prompted, paste your database URL

# Add auth token as secret
npx wrangler secret put TURSO_AUTH_TOKEN
# When prompted, paste your auth token
```

## Testing

1. Start development server:

   ```bash
   yarn dev
   ```

2. Visit `/contact` and submit the form

3. Check submissions:

   ```bash
   # View in database
   turso db shell everweb-contacts
   SELECT * FROM contacts ORDER BY created_at DESC;

   # Or via API
   curl http://localhost:4321/api/contact
   ```

## Schema Details

The `contacts` table includes:

- `id`: Auto-incrementing primary key
- `first_name`, `last_name`: Required text fields
- `email`: Required email address
- `phone`: Optional phone number
- `country_code`: Optional country code (e.g., "+1")
- `message`: Required message text
- `created_at`: Automatic timestamp
