import {
  SESClient,
  SendEmailCommand,
  SendTemplatedEmailCommand,
} from "@aws-sdk/client-ses";

export interface EmailContact {
  email: string;
  name?: string;
  hasConsented: boolean; // Explicit consent tracking
  consentDate: Date;
  source: string; // Where they opted in from
}

export interface BounceComplaintHandler {
  handleBounce: (bounceEvent: {
    email: string;
    bounceType: "hard" | "soft";
    bounceSubType: string;
    timestamp: Date;
    diagnosticCode?: string;
  }) => Promise<void>;
  handleComplaint: (complaintEvent: {
    email: string;
    complaintType: "spam" | "abuse" | "fraud" | "virus" | "other";
    timestamp: Date;
    userAgent?: string;
    complaintSource?: string;
  }) => Promise<void>;
}

export class AWSEmailService {
  private sesClient: SESClient;
  private bounceHandler?: BounceComplaintHandler;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    bounceHandler?: BounceComplaintHandler,
  ) {
    this.sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.bounceHandler = bounceHandler;
  }

  /**
   * Get SES client for admin operations (template management, etc.)
   */
  getSESClient(): SESClient {
    return this.sesClient;
  }

  /**
   * Send email with AUP compliance checks
   */
  async sendEmail(params: {
    to: EmailContact[];
    from: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    replyTo?: string;
  }): Promise<boolean> {
    try {
      // Compliance check: Only send to consented recipients
      const consentedRecipients = params.to.filter(
        (contact) => contact.hasConsented,
      );

      if (consentedRecipients.length === 0) {
        console.warn(
          "No consented recipients found. Email not sent for compliance reasons.",
        );
        return false;
      }

      // Add compliance footer to all emails
      const complianceFooter = this.getComplianceFooter();
      const htmlBodyWithCompliance = `${params.htmlBody}${complianceFooter.html}`;
      const textBodyWithCompliance = `${params.textBody}\n\n${complianceFooter.text}`;

      for (const contact of consentedRecipients) {
        const command = new SendEmailCommand({
          Source: params.from,
          Destination: {
            ToAddresses: [contact.email],
          },
          Message: {
            Subject: {
              Data: params.subject,
              Charset: "UTF-8",
            },
            Body: {
              Html: {
                Data: htmlBodyWithCompliance,
                Charset: "UTF-8",
              },
              Text: {
                Data: textBodyWithCompliance,
                Charset: "UTF-8",
              },
            },
          },
          ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
          // Add custom headers for tracking
          Tags: [
            {
              Name: "ConsentSource",
              Value: contact.source,
            },
            {
              Name: "ConsentDate",
              Value: contact.consentDate.toISOString(),
            },
          ],
        });

        await this.sesClient.send(command);
      }

      return true;
    } catch (error) {
      console.error("Failed to send email:", error);

      // Handle bounces and complaints if error indicates delivery issues
      if (error instanceof Error && error.message.includes("bounce")) {
        for (const contact of params.to) {
          await this.bounceHandler?.handleBounce({
            email: contact.email,
            bounceType: "hard",
            bounceSubType: "General",
            timestamp: new Date(),
            diagnosticCode: error.message,
          });
        }
      }

      return false;
    }
  }

  /**
   * Send templated email with compliance
   */
  async sendTemplatedEmail(params: {
    to: EmailContact[];
    from: string;
    templateName: string;
    templateData: Record<string, string>;
    replyTo?: string;
  }): Promise<boolean> {
    try {
      const consentedRecipients = params.to.filter(
        (contact) => contact.hasConsented,
      );

      if (consentedRecipients.length === 0) {
        console.warn(
          "No consented recipients found. Templated email not sent for compliance reasons.",
        );
        return false;
      }

      for (const contact of consentedRecipients) {
        // Add compliance data to template
        const templateDataWithCompliance = {
          ...params.templateData,
          unsubscribeUrl: `https://everfaz.com/unsubscribe?email=${encodeURIComponent(contact.email)}`,
          companyName: "Everfaz",
          companyAddress: "Your Business Address Here",
          consentReminder: `You received this email because you opted in on ${contact.consentDate.toLocaleDateString()} from ${contact.source}.`,
        };

        const command = new SendTemplatedEmailCommand({
          Source: params.from,
          Destination: {
            ToAddresses: [contact.email],
          },
          Template: params.templateName,
          TemplateData: JSON.stringify(templateDataWithCompliance),
          ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
          Tags: [
            {
              Name: "ConsentSource",
              Value: contact.source,
            },
            {
              Name: "ConsentDate",
              Value: contact.consentDate.toISOString().replace(/[<>:]/g, "-"),
            },
            {
              Name: "Template",
              Value: params.templateName,
            },
          ],
        });

        await this.sesClient.send(command);
      }

      return true;
    } catch (error) {
      console.error("Failed to send templated email:", error);
      return false;
    }
  }

  /**
   * Get compliance footer for all emails
   */
  private getComplianceFooter() {
    return {
      html: `
        <div style="margin-top: 40px; padding: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666;">
          <p><strong>Why did you receive this email?</strong></p>
          <p>You received this email because you explicitly requested to receive communications from Everfaz. 
          We only send emails to recipients who have specifically opted in to receive our messages.</p>
          
          <p><strong>Unsubscribe</strong></p>
          <p>You can <a href="{{unsubscribeUrl}}">unsubscribe here</a> at any time.</p>
          
          <p><strong>Our Commitment</strong></p>
          <p>We comply with the AWS Acceptable Use Policy and maintain proper bounce and complaint handling processes.</p>
          
          <p>{{companyName}}<br>
          {{companyAddress}}</p>
        </div>
      `,
      text: `
        
Why did you receive this email?
You received this email because you explicitly requested to receive communications from Everfaz. 
We only send emails to recipients who have specifically opted in to receive our messages.

Unsubscribe:
You can unsubscribe at: {{unsubscribeUrl}}

Our Commitment:
We comply with the AWS Acceptable Use Policy and maintain proper bounce and complaint handling processes.

{{companyName}}
{{companyAddress}}
      `,
    };
  }
}

/**
 * Default bounce and complaint handler implementation
 */
export class DefaultBounceComplaintHandler implements BounceComplaintHandler {
  async handleBounce(bounceEvent: {
    email: string;
    bounceType: "hard" | "soft";
    bounceSubType: string;
    timestamp: Date;
    diagnosticCode?: string;
  }): Promise<void> {
    console.log(
      `Handling bounce for ${bounceEvent.email} (type: ${bounceEvent.bounceType})`,
    );

    // In production, you should:
    // 1. Remove email from active mailing lists
    // 2. Log the bounce in your database
    // 3. Update email status to "bounced"
    // 4. For hard bounces, permanently suppress the email

    if (bounceEvent.bounceType === "hard") {
      console.log(
        `Hard bounce detected for ${bounceEvent.email} - adding to suppression list`,
      );
      // TODO: Add to suppression list in database
    }
  }

  async handleComplaint(complaintEvent: {
    email: string;
    complaintType: "spam" | "abuse" | "fraud" | "virus" | "other";
    timestamp: Date;
    userAgent?: string;
    complaintSource?: string;
  }): Promise<void> {
    console.log(`Handling complaint for ${complaintEvent.email}`);

    // In production, you should:
    // 1. Immediately remove email from all mailing lists
    // 2. Log the complaint in your database
    // 3. Update email status to "complained"
    // 4. Add to global suppression list

    console.log(
      `Complaint detected for ${complaintEvent.email} - adding to suppression list`,
    );
    // TODO: Add to suppression list in database
  }
}

/**
 * Factory function to create AWS SES service with environment variables
 */
export function createAWSEmailService(
  env?: any,
  bounceHandler?: BounceComplaintHandler,
): AWSEmailService {
  const accessKeyId =
    env?.AWS_ACCESS_KEY_ID || import.meta.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey =
    env?.AWS_SECRET_ACCESS_KEY || import.meta.env.AWS_SECRET_ACCESS_KEY || "";
  const region = env?.AWS_REGION || import.meta.env.AWS_REGION || "us-east-1";

  // Use provided bounce handler or create default one
  const handler = bounceHandler || new DefaultBounceComplaintHandler();

  return new AWSEmailService(accessKeyId, secretAccessKey, region, handler);
}
