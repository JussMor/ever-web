import {
  CreateTemplateCommand,
  GetTemplateCommand,
  UpdateTemplateCommand,
} from "@aws-sdk/client-ses";
import type { APIRoute } from "astro";
import { createAWSEmailService } from "../../../lib/aws-ses.js";

export const prerender = false;

/**
 * Admin endpoint to create/update SES email templates
 * POST /api/admin/create-ses-templates
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get env from locals (Cloudflare Pages v2) or fall back to import.meta.env for dev
    const env = (locals as any).runtime?.env;

    // Use the factory function instead of duplicating SES client creation
    const awsEmailService = createAWSEmailService(env);
    const sesClient = awsEmailService.getSESClient();

    const results = [];
    const errors = [];

    // Template definitions - embedded to work in Cloudflare Workers
    const templates = [
      {
        name: "welcome",
        subject: "Welcome to Everfaz - Let's Build Something Amazing Together",
        htmlTemplate: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Everfaz</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <h1 style="color: #1e293b; font-size: 28px; font-weight: 600; margin: 0;">Welcome to Everfaz!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Hi {{name}},</p>
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Thank you for your interest in Everfaz! We're excited to connect with you.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://everfaz.com" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Visit Our Website</a>
              </div>
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0;">Best regards,<br>The Everfaz Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        textTemplate: `Hi {{name}},

Thank you for your interest in Everfaz! We're excited to connect with you and help bring your digital vision to life.

Our team will review your inquiry and get back to you within 24 hours with next steps.

Visit our website: https://everfaz.com

Best regards,
The Everfaz Team

{{consentReminder}}
Unsubscribe: {{unsubscribeUrl}}
{{companyName}} - {{companyAddress}}`,
      },
      {
        name: "contact-confirmation",
        subject: "We Received Your Message - Everfaz Team Will Be In Touch",
        htmlTemplate: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We Received Your Message - Everfaz</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e2e8f0;">
              <h1 style="color: #1e293b; font-size: 28px; font-weight: 600; margin: 0;">Message Received!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Hi {{name}},</p>
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Thank you for reaching out to Everfaz! We've successfully received your message.</p>
              <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 20px; margin: 30px 0;">
                <h3 style="color: #0c4a6e; font-size: 16px; margin: 0 0 12px;">Your Message Summary:</h3>
                <p style="color: #075985; font-size: 14px; margin: 0 0 8px;"><strong>Subject:</strong> {{subject}}</p>
                <p style="color: #075985; font-size: 14px; margin: 0 0 8px;"><strong>Email:</strong> {{email}}</p>
                <p style="color: #075985; font-size: 14px; margin: 0;"><strong>Submitted:</strong> {{submissionDate}}</p>
              </div>
              <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0;">Looking forward to working with you!<br><br>Best regards,<br>The Everfaz Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        textTemplate: `Hi {{name}},

Thank you for reaching out to Everfaz! We've successfully received your message and appreciate you taking the time to contact us.

Your Message Summary:
- Subject: {{subject}}
- Email: {{email}} 
- Submitted: {{submissionDate}}

What happens next?
- Our team will review your inquiry within 24 hours
- We'll reach out to schedule a discovery call if your project is a good fit  
- You'll receive a detailed proposal within 48-72 hours

Looking forward to working with you!

Best regards,
The Everfaz Team

{{consentReminder}}
Unsubscribe: {{unsubscribeUrl}}
{{companyName}} - {{companyAddress}}`,
      },
    ];

    for (const template of templates) {
      try {
        // Use embedded templates instead of reading files (Cloudflare Workers compatible)
        const htmlTemplate = template.htmlTemplate;
        const textTemplate = template.textTemplate;

        // Check if template already exists
        let templateExists = false;
        try {
          await sesClient.send(
            new GetTemplateCommand({ TemplateName: template.name }),
          );
          templateExists = true;
        } catch (error: any) {
          if (error.name !== "TemplateDoesNotExistException") {
            throw error;
          }
        }

        const templateData = {
          TemplateName: template.name,
          SubjectPart: template.subject,
          HtmlPart: htmlTemplate,
          TextPart: textTemplate,
        };

        if (templateExists) {
          // Update existing template
          await sesClient.send(
            new UpdateTemplateCommand({
              Template: templateData,
            }),
          );
          results.push(`Updated template: ${template.name}`);
        } else {
          // Create new template
          await sesClient.send(
            new CreateTemplateCommand({
              Template: templateData,
            }),
          );
          results.push(`Created template: ${template.name}`);
        }
      } catch (error: any) {
        const errorMsg = `Failed to process template ${template.name}: ${error.message}`;
        console.error(errorMsg, error);
        errors.push(errorMsg);
      }
    }

    const response = {
      success: errors.length === 0,
      results,
      errors,
      message:
        errors.length === 0
          ? "All templates processed successfully"
          : `${results.length} succeeded, ${errors.length} failed`,
    };

    return new Response(JSON.stringify(response), {
      status: errors.length === 0 ? 200 : 207, // 207 = Multi-Status
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating SES templates:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

/**
 * List existing SES templates
 * GET /api/admin/create-ses-templates
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = (locals as any).runtime?.env;

    // Use the factory function instead of duplicating SES client creation
    const awsEmailService = createAWSEmailService(env);
    const sesClient = awsEmailService.getSESClient();

    // List templates (SES doesn't have a direct list command, so we'll try to get our known templates)
    const templateNames = ["welcome", "contact-confirmation"];
    const templates = [];
    const errors = [];

    for (const name of templateNames) {
      try {
        const result = await sesClient.send(
          new GetTemplateCommand({ TemplateName: name }),
        );
        templates.push({
          name,
          subject: result.Template?.SubjectPart,
          exists: true,
        });
      } catch (error: any) {
        if (error.name === "TemplateDoesNotExistException") {
          templates.push({
            name,
            exists: false,
          });
        } else {
          errors.push(`Error checking template ${name}: ${error.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        templates,
        errors,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error listing SES templates:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
