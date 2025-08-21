#!/usr/bin/env node

// Email Database Setup Script (Node.js ES Module)
// Usage: node scripts/setup-email-database.js

import { createClient } from '@libsql/client/web';
import { readFileSync } from 'fs';

// Load environment variables from .env file if it exists
try {
  const envFile = readFileSync('.env', 'utf8');
  const lines = envFile.split('\n');
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim();
    }
  }
  console.log('✅ Loaded environment variables from .env file');
} catch (envErr) {
  console.log('ℹ️  No .env file found, using system environment variables');
}

const databaseUrl = process.env.TURSO_DATABASE_URL || '';
const authToken = process.env.TURSO_AUTH_TOKEN || '';

if (!databaseUrl || !authToken) {
  console.error('❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables');
  console.error('Make sure your .env file contains:');
  console.error('TURSO_DATABASE_URL=your_database_url');
  console.error('TURSO_AUTH_TOKEN=your_auth_token');
  process.exit(1);
}

// Email schema SQL (inline to avoid file system dependencies)
const emailSchemaSql = `
-- Email Events Table
-- Tracks all email bounces, complaints, and delivery events
CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('bounce', 'complaint', 'delivery', 'send')),
  
  -- Bounce-specific fields
  bounce_type TEXT CHECK (bounce_type IN ('hard', 'soft') OR bounce_type IS NULL),
  bounce_sub_type TEXT,
  diagnostic_code TEXT,
  
  -- Complaint-specific fields
  complaint_type TEXT CHECK (complaint_type IN ('spam', 'abuse', 'fraud', 'virus', 'other') OR complaint_type IS NULL),
  user_agent TEXT,
  complaint_source TEXT,
  
  -- Common fields
  message_id TEXT,
  campaign_id TEXT,
  template_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  UNIQUE(email, event_type, created_at)
);

-- Email Suppressions Table
-- Tracks emails that should not receive future emails
CREATE TABLE IF NOT EXISTS email_suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  suppression_type TEXT NOT NULL CHECK (suppression_type IN ('bounce', 'complaint', 'unsubscribe')),
  reason TEXT NOT NULL,
  suppressed_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_permanent INTEGER NOT NULL DEFAULT 1 CHECK (is_permanent IN (0, 1)),
  
  -- Optional: Track when temporary suppressions should be lifted
  suppress_until TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Email Contacts Extension Table
-- Extends the existing contacts table with email-specific compliance data
CREATE TABLE IF NOT EXISTS email_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  contact_id INTEGER, -- References the main contacts table
  
  -- Compliance fields
  has_consented INTEGER NOT NULL DEFAULT 0 CHECK (has_consented IN (0, 1)),
  consent_date TEXT,
  consent_source TEXT, -- 'contact_form', 'newsletter_signup', etc.
  consent_ip_address TEXT,
  consent_user_agent TEXT,
  
  -- Contact status for email marketing
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'bounced', 'complained', 'unsubscribed')),
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Foreign key reference to main contacts table (if contact exists)
  FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE SET NULL
);

-- Daily Email Metrics Table
-- Aggregated daily statistics for monitoring
CREATE TABLE IF NOT EXISTS daily_email_metrics (
  date TEXT PRIMARY KEY,
  emails_sent INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  hard_bounce_count INTEGER DEFAULT 0,
  soft_bounce_count INTEGER DEFAULT 0,
  complaint_count INTEGER DEFAULT 0,
  delivery_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  
  -- Calculated rates (stored for quick access)
  bounce_rate REAL DEFAULT 0.0,
  complaint_rate REAL DEFAULT 0.0,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email);
CREATE INDEX IF NOT EXISTS idx_email_events_type_date ON email_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_email ON email_suppressions(email);
CREATE INDEX IF NOT EXISTS idx_email_contacts_email ON email_contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_contacts_status ON email_contacts(status);
CREATE INDEX IF NOT EXISTS idx_email_contacts_contact_id ON email_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_email_metrics(date);

-- Triggers to update email contact status based on events
CREATE TRIGGER IF NOT EXISTS update_contact_status_on_bounce
  AFTER INSERT ON email_events
  WHEN NEW.event_type = 'bounce' AND NEW.bounce_type = 'hard'
BEGIN
  UPDATE email_contacts 
  SET status = 'bounced', updated_at = datetime('now')
  WHERE email = NEW.email;
END;

CREATE TRIGGER IF NOT EXISTS update_contact_status_on_complaint
  AFTER INSERT ON email_events
  WHEN NEW.event_type = 'complaint'
BEGIN
  UPDATE email_contacts 
  SET status = 'complained', updated_at = datetime('now')
  WHERE email = NEW.email;
END;

-- Trigger to update suppressions when contact is unsubscribed
CREATE TRIGGER IF NOT EXISTS update_suppression_on_unsubscribe
  AFTER UPDATE ON email_contacts
  WHEN NEW.status = 'unsubscribed' AND OLD.status != 'unsubscribed'
BEGIN
  INSERT OR REPLACE INTO email_suppressions (email, suppression_type, reason, is_permanent)
  VALUES (NEW.email, 'unsubscribe', 'User unsubscribed', 1);
END;

-- Views for common queries
CREATE VIEW IF NOT EXISTS email_reputation_summary AS
SELECT 
  date,
  emails_sent,
  bounce_count,
  complaint_count,
  ROUND(bounce_rate, 3) as bounce_rate_percent,
  ROUND(complaint_rate, 3) as complaint_rate_percent,
  CASE 
    WHEN bounce_rate > 5.0 THEN 'WARNING'
    WHEN complaint_rate > 0.1 THEN 'CRITICAL'
    ELSE 'OK'
  END as reputation_status
FROM daily_email_metrics
WHERE date >= date('now', '-30 days')
ORDER BY date DESC;

CREATE VIEW IF NOT EXISTS suppressed_emails AS
SELECT 
  es.*,
  ec.consent_source,
  COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') as contact_name
FROM email_suppressions es
LEFT JOIN email_contacts ec ON es.email = ec.email
LEFT JOIN contacts c ON ec.contact_id = c.id
WHERE es.is_permanent = 1 OR es.suppress_until > datetime('now')
ORDER BY es.suppressed_at DESC;

-- View for email contacts with full contact information
CREATE VIEW IF NOT EXISTS email_contacts_full AS
SELECT 
  ec.*,
  c.first_name,
  c.last_name,
  c.phone,
  c.country_code,
  c.message as original_message,
  c.created_at as contact_created_at
FROM email_contacts ec
LEFT JOIN contacts c ON ec.contact_id = c.id
ORDER BY ec.created_at DESC;
`;

async function setupEmailDatabase() {
  console.log('🚀 Setting up email database schema...');

  const client = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  try {
    // Split SQL more carefully to handle triggers with BEGIN/END blocks
    const statements = [];
    let currentStatement = '';
    let inTrigger = false;
    
    const lines = emailSchemaSql.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('--')) continue;
      
      currentStatement += line + '\n';
      
      // Check if we're starting a trigger
      if (trimmedLine.toLowerCase().includes('create trigger')) {
        inTrigger = true;
      }
      
      // Check for statement end
      if (trimmedLine.endsWith(';')) {
        if (!inTrigger || trimmedLine.toLowerCase().includes('end;')) {
          statements.push(currentStatement.trim());
          currentStatement = '';
          inTrigger = false;
        }
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }
    
    // Filter out empty statements
    const validStatements = statements.filter(s => s.length > 0);

    console.log(`📝 Executing ${validStatements.length} SQL statements...`);

    for (let i = 0; i < validStatements.length; i++) {
      const statement = validStatements[i];
      try {
        await client.execute(statement);
        console.log(`✅ Statement ${i + 1}/${validStatements.length} executed successfully`);
      } catch (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message || error);
        console.error(`Statement: ${statement.substring(0, 100)}...`);
        // Continue with other statements for idempotency
      }
    }

    // Test the setup by inserting a test record
    console.log('\n🧪 Testing database setup...');
    
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO email_contacts 
        (email, has_consented, consent_date, consent_source, status)
        VALUES (?, 1, ?, 'database_setup_test', 'active')
      `,
      args: ['test@everfaz.com', new Date().toISOString()]
    });

    // Check if test record was inserted
    const result = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM email_contacts WHERE email = ?',
      args: ['test@everfaz.com']
    });

    const count = Number(result.rows[0]?.count);
    if (count > 0) {
      console.log('✅ Test record inserted successfully');
      
      // Clean up test record
      await client.execute({
        sql: 'DELETE FROM email_contacts WHERE email = ?',
        args: ['test@everfaz.com']
      });
      console.log('🧹 Test record cleaned up');
    }

    console.log('\n🎉 Email database schema setup completed successfully!');
    console.log('\n📋 Available tables:');
    console.log('   - email_events: Tracks all email bounces, complaints, and delivery events');
    console.log('   - email_suppressions: Tracks emails that should not receive future emails');
    console.log('   - email_contacts: Tracks consent and contact information');
    console.log('   - daily_email_metrics: Aggregated daily statistics for monitoring');
    
    console.log('\n🔍 Available views:');
    console.log('   - email_reputation_summary: Email reputation stats for the last 30 days');
    console.log('   - suppressed_emails: Currently suppressed email addresses');
    console.log('   - email_contacts_full: Email contacts with full contact information');

    console.log('\n✨ You can now use the email system in your application!');

  } catch (error) {
    console.error('💥 Error setting up email database:', error.message || error);
    process.exit(1);
  } finally {
    client.close();
  }
}

// Run the setup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupEmailDatabase().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { setupEmailDatabase };
