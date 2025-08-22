import { EMAIL_TEMPLATES } from "./template-manifest";

// Import raw file contents so the bundler includes them in the worker build.
// Vite/astro supports the `?raw` suffix which returns the file content as a string.
import contactConfirmationHtml from "./contact-confirmation.html?raw";
import contactConfirmationTxt from "./text-versions/contact-confirmation.txt?raw";
import welcomeTxt from "./text-versions/welcome.txt?raw";
import welcomeHtml from "./welcome.html?raw";

export const TEMPLATES = [
  {
    name: "welcome",
    subject: EMAIL_TEMPLATES.welcome.subject,
    htmlTemplate: String(welcomeHtml),
    textTemplate: String(welcomeTxt),
  },
  {
    name: "contact-confirmation",
    subject: EMAIL_TEMPLATES.contactConfirmation.subject,
    htmlTemplate: String(contactConfirmationHtml),
    textTemplate: String(contactConfirmationTxt),
  },
];

export default TEMPLATES;
