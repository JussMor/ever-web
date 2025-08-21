#!/usr/bin/env node

/**
 * Script to create AWS SES email templates
 * Usage: node scripts/create-ses-templates.js
 */

import { CreateTemplateCommand, GetTemplateCommand, SESClient, UpdateTemplateCommand } from '@aws-sdk/client-ses';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
const envFile = readFileSync(join(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

async function createSESTemplates() {
  console.log('🚀 Creating AWS SES email templates...');

  // Initialize SES client
  const sesClient = new SESClient({
    region: env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  // Template definitions
  const templates = [
    {
      name: 'welcome',
      subject: 'Welcome to Everfaz - Let\'s Build Something Amazing Together',
      htmlPath: '../src/emails-templates/welcome.html',
      textPath: '../src/emails-templates/text-versions/welcome.txt',
    },
    {
      name: 'contact-confirmation',
      subject: 'We Received Your Message - Everfaz Team Will Be In Touch',
      htmlPath: '../src/emails-templates/contact-confirmation.html',
      textPath: '../src/emails-templates/text-versions/contact-confirmation.txt',
    }
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const template of templates) {
    try {
      console.log(`\n📧 Processing template: ${template.name}`);
      
      // Read template files
      const htmlTemplatePath = join(__dirname, template.htmlPath);
      const textTemplatePath = join(__dirname, template.textPath);
      
      console.log(`   Reading HTML: ${htmlTemplatePath}`);
      console.log(`   Reading text: ${textTemplatePath}`);
      
      const htmlTemplate = readFileSync(htmlTemplatePath, 'utf-8');
      const textTemplate = readFileSync(textTemplatePath, 'utf-8');

      // Check if template already exists
      let templateExists = false;
      try {
        await sesClient.send(new GetTemplateCommand({ TemplateName: template.name }));
        templateExists = true;
        console.log(`   ✅ Template exists, will update`);
      } catch (error) {
        if (error.name === 'TemplateDoesNotExistException') {
          console.log(`   ➕ Template doesn't exist, will create`);
        } else {
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
        await sesClient.send(new UpdateTemplateCommand({
          Template: templateData
        }));
        console.log(`   ✅ Updated template: ${template.name}`);
      } else {
        // Create new template
        await sesClient.send(new CreateTemplateCommand({
          Template: templateData
        }));
        console.log(`   ✅ Created template: ${template.name}`);
      }

      successCount++;

    } catch (error) {
      console.error(`   ❌ Failed to process template ${template.name}:`, error.message);
      console.error(`      Error details:`, error);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);

  if (errorCount === 0) {
    console.log('\n🎉 All SES templates created successfully!');
    console.log('\nYou can now use sendTemplatedEmail() in your email service.');
  } else {
    console.log('\n⚠️  Some templates failed to create. Please check the errors above.');
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  createSESTemplates().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}
