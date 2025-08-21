import {
  CreateTemplateCommand,
  GetTemplateCommand,
  UpdateTemplateCommand,
} from "@aws-sdk/client-ses";
import type { APIRoute } from "astro";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createAWSEmailService } from "../../../lib/aws-ses.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Template definitions
    const templates = [
      {
        name: "welcome",
        subject: "Welcome to Everfaz - Let's Build Something Amazing Together",
        htmlPath: "../../../../src/emails-templates/welcome.html",
        textPath: "../../../../src/emails-templates/text-versions/welcome.txt",
      },
      {
        name: "contact-confirmation",
        subject: "We Received Your Message - Everfaz Team Will Be In Touch",
        htmlPath: "../../../../src/emails-templates/contact-confirmation.html",
        textPath:
          "../../../../src/emails-templates/text-versions/contact-confirmation.txt",
      },
    ];

    for (const template of templates) {
      try {
        // Read template files
        const htmlTemplatePath = join(__dirname, template.htmlPath);
        const textTemplatePath = join(__dirname, template.textPath);

        const htmlTemplate = readFileSync(htmlTemplatePath, "utf-8");
        const textTemplate = readFileSync(textTemplatePath, "utf-8");

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
