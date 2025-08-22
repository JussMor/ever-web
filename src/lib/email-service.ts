import type { TemplateName } from "../emails-templates/template-manifest.js";
import {
  EMAIL_TEMPLATES,
  getComplianceRequirements,
  validateTemplateData,
} from "../emails-templates/template-manifest.js";
import {
  AWSEmailService,
  createAWSEmailService,
  type EmailContact,
} from "./aws-ses.js";
import { BounceComplaintHandler } from "./bounce-complaint-handler.js";
import { createTursoClient } from "./turso.js";

export class EmailService {
  private awsEmailService: AWSEmailService;
  private bounceHandler: BounceComplaintHandler;
  private tursoClient: ReturnType<typeof createTursoClient>;
  private env?: any;

  constructor(env?: any) {
    this.env = env;
    this.bounceHandler = new BounceComplaintHandler(env);
    this.awsEmailService = createAWSEmailService(env, this.bounceHandler);
    this.tursoClient = createTursoClient(env);
  }

  /**
   * Record a new email contact with proper consent tracking
   */
  async addEmailContact(params: {
    email: string;
    name?: string;
    consentSource: string;
    ipAddress?: string;
    userAgent?: string;
    contactId?: number; // Reference to main contacts table
  }): Promise<boolean> {
    try {
      // Check if email already exists and is not suppressed
      const suppression = await this.bounceHandler.isEmailSuppressed(
        params.email,
      );
      if (suppression.isSuppressed) {
        console.warn(
          `Cannot add contact ${params.email}: currently suppressed (${suppression.reason})`,
        );
        return false;
      }

      // Insert or update email contact record
      await this.tursoClient.execute({
        sql: `
          INSERT OR REPLACE INTO email_contacts 
          (email, contact_id, has_consented, consent_date, consent_source, consent_ip_address, consent_user_agent, status)
          VALUES (?, ?, 1, ?, ?, ?, ?, 'active')
        `,
        args: [
          params.email,
          params.contactId || null,
          new Date().toISOString(),
          params.consentSource,
          params.ipAddress || null,
          params.userAgent || null,
        ],
      });

      console.log(
        `Email contact added: ${params.email} (source: ${params.consentSource})`,
      );
      return true;
    } catch (error) {
      console.error("Error adding email contact:", error);
      return false;
    }
  }

  /**
   * Send email using template with full compliance checks
   */
  async sendTemplatedEmail(params: {
    to: string | string[];
    templateName: TemplateName;
    templateData: Record<string, string>;
    from?: string;
    replyTo?: string;
  }): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
    const errors: string[] = [];
    let sentCount = 0;

    try {
      // Validate template exists and data is complete
      const template = EMAIL_TEMPLATES[params.templateName];
      if (!template) {
        return { success: false, sentCount: 0, errors: ["Template not found"] };
      }

      const validation = validateTemplateData(
        params.templateName,
        params.templateData,
      );
      if (!validation.isValid) {
        return {
          success: false,
          sentCount: 0,
          errors: [
            `Missing required variables: ${validation.missingVariables.join(", ")}`,
          ],
        };
      }

      // Get compliance requirements
      const complianceReqs = getComplianceRequirements(params.templateName);

      // Convert email addresses to array
      const emailAddresses = Array.isArray(params.to) ? params.to : [params.to];

      // Get contact information for each recipient
      const recipients: EmailContact[] = [];

      for (const email of emailAddresses) {
        try {
          // Check if email is suppressed
          const suppression = await this.bounceHandler.isEmailSuppressed(email);
          if (suppression.isSuppressed) {
            errors.push(`${email}: suppressed (${suppression.reason})`);
            continue;
          }

          // Get contact details from database (using the coordinated view)
          const result = await this.tursoClient.execute({
            sql: `
              SELECT 
                ec.email, 
                COALESCE(c.first_name || ' ' || c.last_name, 'Valued Customer') as name,
                ec.has_consented, 
                ec.consent_date, 
                ec.consent_source 
              FROM email_contacts ec
              LEFT JOIN contacts c ON ec.contact_id = c.id
              WHERE ec.email = ? AND ec.status = 'active'
            `,
            args: [email],
          });

          if (result.rows.length === 0) {
            // For transactional emails, we can proceed without explicit consent record
            if (!complianceReqs.requiresExplicitConsent) {
              recipients.push({
                email,
                hasConsented: true, // Implied consent for transactional emails
                consentDate: new Date(),
                source: "transactional_relationship",
              });
            } else {
              errors.push(`${email}: no consent record found`);
            }
            continue;
          }

          const row = result.rows[0];
          if (!row.has_consented && complianceReqs.requiresExplicitConsent) {
            errors.push(`${email}: no explicit consent`);
            continue;
          }

          recipients.push({
            email: row.email as string,
            name: (row.name as string) || undefined,
            hasConsented: Boolean(row.has_consented),
            consentDate: new Date(row.consent_date as string),
            source: row.consent_source as string,
          });
        } catch (error) {
          errors.push(`${email}: error checking contact (${error})`);
        }
      }

      if (recipients.length === 0) {
        return { success: false, sentCount: 0, errors };
      }

      // Send email via AWS SES
      const success = await this.awsEmailService.sendTemplatedEmail({
        to: recipients,
        from:
          params.from ||
          this.env?.EMAIL ||
          import.meta.env.EMAIL ||
          "contact@everfaz.com",
        templateName: template.name, // Use the actual SES template name from manifest
        templateData: {
          ...params.templateData,
          // Add compliance-required fields
          companyName: "Everfaz",
          companyAddress: "Your Business Address, City, State, ZIP",
        },
        replyTo: params.replyTo,
      });

      if (success) {
        sentCount = recipients.length;

        // Log successful sends
        for (const recipient of recipients) {
          await this.logEmailEvent({
            email: recipient.email,
            eventType: "send",
            templateName: params.templateName,
          });
        }
      }

      return { success, sentCount, errors };
    } catch (error) {
      console.error("Error sending templated email:", error);
      return {
        success: false,
        sentCount,
        errors: [...errors, `Send error: ${error}`],
      };
    }
  }

  /**
   * Send contact form confirmation email
   * Note: Email contact should already be added before calling this method
   */
  async sendContactConfirmation(params: {
    email: string;
    name: string;
    subject: string;
    message: string;
  }): Promise<boolean> {
    try {
      // Send confirmation email using SES template (templates created via scripts/create-ses-templates.js)
      const result = await this.sendTemplatedEmail({
        to: params.email,
        templateName: "contactConfirmation",
        templateData: {
          name: params.name,
          email: params.email,
          subject: params.subject,
          submissionDate: new Date().toLocaleDateString(),
        },
      });

      if (!result.success) {
        console.error(
          `sendContactConfirmation failed for ${params.email}:`,
          result.errors,
        );
      }

      return result.success;
    } catch (error) {
      console.error(
        `sendContactConfirmation error for ${params.email}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Send welcome email to new contacts
   */
  async sendWelcomeEmail(email: string, name?: string): Promise<boolean> {
    const result = await this.sendTemplatedEmail({
      to: email,
      templateName: "welcome",
      templateData: {
        name: name || "there",
      },
    });

    return result.success;
  }

  /**
   * Unsubscribe an email address
   */
  async unsubscribeEmail(email: string): Promise<boolean> {
    try {
      // Add to suppressions
      await this.bounceHandler.unsubscribeEmail(email, "user_request");

      // Update contact status
      await this.tursoClient.execute({
        sql: `UPDATE email_contacts SET status = 'unsubscribed', updated_at = ? WHERE email = ?`,
        args: [new Date().toISOString(), email],
      });

      console.log(`Email unsubscribed: ${email}`);
      return true;
    } catch (error) {
      console.error("Error unsubscribing email:", error);
      return false;
    }
  }

  /**
   * Get email reputation statistics
   */
  async getReputationStats() {
    return await this.bounceHandler.getEmailReputationStats();
  }

  /**
   * Process AWS SES webhooks for bounces and complaints
   */
  async processWebhook(webhookBody: any): Promise<void> {
    try {
      const message = JSON.parse(webhookBody.Message);

      switch (message.eventType || message.notificationType) {
        case "bounce":
          await this.processBounceWebhook(message);
          break;

        case "complaint":
          await this.processComplaintWebhook(message);
          break;

        case "delivery":
          await this.processDeliveryWebhook(message);
          break;

        default:
          console.log(
            "Unknown webhook event type:",
            message.eventType || message.notificationType,
          );
      }
    } catch (error) {
      console.error("Error processing webhook:", error);
      throw error;
    }
  }

  // Private helper methods

  private async logEmailEvent(params: {
    email: string;
    eventType: string;
    templateName?: string;
    messageId?: string;
  }): Promise<void> {
    await this.tursoClient.execute({
      sql: `
        INSERT INTO email_events (email, event_type, template_name, message_id)
        VALUES (?, ?, ?, ?)
      `,
      args: [
        params.email,
        params.eventType,
        params.templateName || null,
        params.messageId || null,
      ],
    });
  }

  private async processBounceWebhook(message: any): Promise<void> {
    const bounce = message.bounce;

    for (const recipient of bounce.bouncedRecipients) {
      await this.bounceHandler.handleBounce({
        email: recipient.emailAddress,
        bounceType: bounce.bounceType === "Permanent" ? "hard" : "soft",
        bounceSubType: bounce.bounceSubType,
        timestamp: new Date(message.mail.timestamp),
        diagnosticCode: recipient.diagnosticCode,
      });
    }
  }

  private async processComplaintWebhook(message: any): Promise<void> {
    const complaint = message.complaint;

    for (const recipient of complaint.complainedRecipients) {
      await this.bounceHandler.handleComplaint({
        email: recipient.emailAddress,
        complaintType: complaint.complaintSubType || "spam",
        timestamp: new Date(message.mail.timestamp),
        userAgent: complaint.userAgent,
        complaintSource: complaint.complaintFeedbackType,
      });
    }
  }

  private async processDeliveryWebhook(message: any): Promise<void> {
    // Log successful deliveries
    for (const recipient of message.mail.destination) {
      await this.logEmailEvent({
        email: recipient,
        eventType: "delivery",
        messageId: message.mail.messageId,
      });
    }
  }
}

/**
 * Factory function to create email service
 */
export function createEmailService(env?: any): EmailService {
  return new EmailService(env);
}
