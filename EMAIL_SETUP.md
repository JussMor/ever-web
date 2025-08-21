# AWS SES Email Setup Guide

This guide will help you set up AWS SES with full compliance for bounce handling, complaint management, and proper consent tracking.

## 🚀 Quick Start

### 1. Prerequisites

- AWS Account with SES access
- Turso Database (already configured)
- Environment variables set in `.env`

### 2. Database Setup

Run the email database setup:

```bash
# Navigate to the project root
cd /path/to/everweb

# Run the setup script (make sure your TURSO env vars are set)
npx ts-node scripts/setup-email-database.ts
```

### 3. AWS SES Configuration

#### Step 1: Verify Your Domain/Email

1. Go to AWS SES Console
2. Navigate to "Verified identities"
3. Click "Create identity"
4. Add your domain `everfaz.com` or email `contact@everfaz.com`
5. Follow verification steps (DNS records or email confirmation)

#### Step 2: Move Out of Sandbox

1. In SES Console, go to "Account dashboard"
2. Click "Request production access"
3. Fill out the form with these compliance details:

**Use case description:**

```
We send transactional emails to users who contact us through our website contact form. We also send marketing emails only to users who have explicitly opted in. All emails include unsubscribe links and we maintain proper bounce/complaint handling.
```

**Website URL:** `https://everfaz.com`

**Mail type:** Both transactional and promotional

**Expected sending volume:** Start with your expected numbers

**How you handle bounces and complaints:**

```
We have implemented automated bounce and complaint handling:
- All bounces and complaints are processed via SNS webhooks
- Hard bounces result in immediate email suppression
- Complaints result in immediate suppression and removal from all lists
- We maintain bounce rates below 5% and complaint rates below 0.1%
- We have a comprehensive unsubscribe system with one-click unsubscribe
```

**Compliance with AWS AUP:**

```
We comply with the AWS Acceptable Use Policy by:
- Only sending to recipients who have specifically requested our emails
- Maintaining explicit consent records with timestamps and sources
- Including clear unsubscribe links in all emails
- Honoring all unsubscribe requests immediately
- Maintaining proper bounce and complaint handling processes
```

#### Step 3: Set up SNS for Bounces and Complaints

1. Go to Amazon SNS Console
2. Create two topics:
   - `ses-bounces-everfaz`
   - `ses-complaints-everfaz`

3. For each topic, create a subscription:
   - Protocol: HTTPS
   - Endpoint: `https://yourdomain.com/api/email-webhook`

4. Back in SES Console, go to "Configuration sets"
5. Create a configuration set named `everfaz-emails`
6. Add event destinations for bounces and complaints pointing to your SNS topics

### 4. Environment Variables

Make sure these are set in your `.env`:

```bash
# AWS SES
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# Email settings
EMAIL=contact@everfaz.com

# Turso (already set)
TURSO_DATABASE_URL=your_database_url
TURSO_AUTH_TOKEN=your_auth_token
```

## 📧 Using the Email System

### Sending Contact Confirmations

The contact form automatically sends confirmation emails when someone submits the form.

### Sending Custom Emails

```typescript
import { createEmailService } from "./src/lib/email-service";

const emailService = createEmailService();

// Send welcome email
await emailService.sendWelcomeEmail("user@example.com", "John Doe");

// Send templated email
await emailService.sendTemplatedEmail({
  to: "user@example.com",
  templateName: "welcome",
  templateData: {
    name: "John Doe",
  },
});
```

### Adding Email Contacts

```typescript
// Add contact with consent tracking
await emailService.addEmailContact({
  email: "user@example.com",
  name: "John Doe",
  consentSource: "contact_form",
  ipAddress: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
});
```

## 🛡️ Compliance Features

### Consent Tracking

- Every email contact includes consent date, source, and IP address
- Only emails with explicit consent receive marketing emails
- Transactional emails (like contact confirmations) don't require explicit marketing consent

### Bounce Handling

- Hard bounces: Immediate suppression
- Soft bounces: Suppressed after 3 bounces in 7 days
- All bounces logged with timestamps and diagnostic codes

### Complaint Handling

- All complaints result in immediate permanent suppression
- Complaint rates monitored (AWS requires <0.1%)
- Automatic alerts when complaint rates are high

### Unsubscribe System

- One-click unsubscribe links in all emails
- Web-based unsubscribe page at `/unsubscribe`
- API endpoint at `/api/unsubscribe`
- All unsubscribes result in permanent suppression

## 📊 Monitoring

### Email Reputation Stats

```typescript
const emailService = createEmailService();
const stats = await emailService.getReputationStats();
console.log(`Bounce rate: ${stats.bounceRate}%`);
console.log(`Complaint rate: ${stats.complaintRate}%`);
```

### Database Views

Query the database for insights:

```sql
-- Overall reputation summary
SELECT * FROM email_reputation_summary
ORDER BY date DESC LIMIT 30;

-- All suppressed emails
SELECT * FROM suppressed_emails;

-- Recent email events
SELECT * FROM email_events
WHERE created_at > datetime('now', '-7 days')
ORDER BY created_at DESC;
```

## 🔧 Available Email Templates

### 1. Welcome Email (`welcome`)

- **Purpose:** Welcome new contacts
- **Required data:** `name`
- **Compliance:** High (includes full compliance footer)

### 2. Contact Confirmation (`contact-confirmation`)

- **Purpose:** Confirm contact form submissions
- **Required data:** `name`, `email`, `subject`, `submissionDate`
- **Compliance:** High (transactional email)

## 🚨 Important Notes

### AWS SES Limits

- **Sandbox:** 200 emails/day, 1 email/second
- **Production:** Starts at 200/day, can be increased
- Monitor your sending quota in SES Console

### Compliance Requirements

1. **Bounce Rate:** Keep below 5%
2. **Complaint Rate:** Keep below 0.1%
3. **Suppression:** Honor all bounces, complaints, and unsubscribes
4. **Consent:** Only send marketing emails to consenting users

### Webhook Security

In production, verify SNS webhook signatures:

```typescript
// TODO: Add SNS signature verification
// AWS provides libraries for this
```

## 🔍 Troubleshooting

### High Bounce Rate

1. Check your email list quality
2. Remove old/invalid emails
3. Use double opt-in for new signups

### High Complaint Rate

1. Review email content (avoid spam triggers)
2. Check sending frequency
3. Ensure clear unsubscribe links
4. Review email list sources

### Emails Not Sending

1. Check AWS SES sending quota
2. Verify your domain/email in SES
3. Check for suppressed emails
4. Review CloudWatch logs

### Database Errors

1. Ensure email schema is set up: `npx ts-node scripts/setup-email-database.ts`
2. Check Turso connection
3. Verify environment variables

## 📚 File Structure

```
src/
├── lib/
│   ├── aws-ses.ts                 # AWS SES integration
│   ├── email-service.ts           # Main email service
│   └── bounce-complaint-handler.ts # Bounce/complaint handling
├── emails-templates/
│   ├── welcome.html               # Welcome email template
│   ├── contact-confirmation.html  # Contact confirmation template
│   ├── template-manifest.ts       # Template definitions
│   └── text-versions/            # Text versions of templates
├── pages/api/
│   ├── email-webhook.ts          # SNS webhook handler
│   ├── unsubscribe.ts            # Unsubscribe API
│   └── contact.ts                # Updated contact form
├── pages/unsubscribe/
│   └── index.astro               # Unsubscribe page
└── db/
    └── email-schema.sql          # Database schema
```

This setup ensures full AWS SES compliance with proper bounce handling, complaint management, and consent tracking while maintaining excellent email deliverability.
