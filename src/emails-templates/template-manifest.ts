/**
 * Email Template Manifest
 * Defines all available email templates with their metadata and compliance settings
 */

export interface EmailTemplate {
  name: string;
  description: string;
  subject: string;
  requiredVariables: string[];
  complianceLevel: "high" | "medium" | "low";
  category: "transactional" | "marketing" | "notification";
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    name: "welcome",
    description:
      "Welcome email for new contacts who opt-in through the website",
    subject: "Welcome to Everfaz - Let's Build Something Amazing Together",
    requiredVariables: ["name"],
    complianceLevel: "high",
    category: "transactional",
  },

  contactConfirmation: {
    name: "contact-confirmation",
    description: "Confirmation email sent after contact form submission",
    subject: "We Received Your Message - Everfaz Team Will Be In Touch",
    requiredVariables: ["name", "email", "subject", "submissionDate"],
    complianceLevel: "high",
    category: "transactional",
  },

  projectUpdate: {
    name: "project-update",
    description: "Update email for ongoing projects",
    subject: "Project Update: {{projectName}}",
    requiredVariables: ["name", "projectName", "updateDetails"],
    complianceLevel: "medium",
    category: "notification",
  },

  newsletter: {
    name: "newsletter",
    description: "Monthly newsletter with company updates and insights",
    subject: "Everfaz Insights - {{month}} {{year}} Edition",
    requiredVariables: ["name", "month", "year", "insights"],
    complianceLevel: "high",
    category: "marketing",
  },
} as const;

/**
 * Validates if all required template variables are provided
 */
export function validateTemplateData(
  templateName: string,
  templateData: Record<string, string>,
): {
  isValid: boolean;
  missingVariables: string[];
} {
  const template = EMAIL_TEMPLATES[templateName];

  if (!template) {
    return {
      isValid: false,
      missingVariables: ["Template not found"],
    };
  }

  const missingVariables = template.requiredVariables.filter(
    (variable) => !(variable in templateData) || !templateData[variable],
  );

  return {
    isValid: missingVariables.length === 0,
    missingVariables,
  };
}

/**
 * Gets compliance requirements for a template
 */
export function getComplianceRequirements(templateName: string): {
  requiresExplicitConsent: boolean;
  requiresUnsubscribeLink: boolean;
  requiresCompanyInfo: boolean;
  maxFrequency?: string;
} {
  const template = EMAIL_TEMPLATES[templateName];

  if (!template) {
    throw new Error(`Template ${templateName} not found`);
  }

  const baseRequirements = {
    requiresExplicitConsent: true,
    requiresUnsubscribeLink: true,
    requiresCompanyInfo: true,
  };

  switch (template.category) {
    case "transactional":
      return {
        ...baseRequirements,
        requiresExplicitConsent: false, // Transactional emails can be sent based on business relationship
      };

    case "marketing":
      return {
        ...baseRequirements,
        maxFrequency: "weekly",
      };

    case "notification":
      return {
        ...baseRequirements,
        maxFrequency: "as-needed",
      };

    default:
      return baseRequirements;
  }
}

export type TemplateName = keyof typeof EMAIL_TEMPLATES;
