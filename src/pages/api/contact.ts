export const prerender = false;

import type { APIRoute } from 'astro';
import { createTursoClient } from '../../lib/turso';
import type { ContactResponse, ContactSubmission, DatabaseContact } from '../../types/contact';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get env from locals (Cloudflare Pages v2) or fall back to import.meta.env for dev
    const env = (locals as any).runtime?.env;
    
    // Create Turso client (works in both dev and production)
    const turso = createTursoClient(env);
    
    // Parse the form data
    const body = await request.json() as ContactSubmission;
    
    // Validate required fields
    if (!body.firstName || !body.lastName || !body.email || !body.message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert into database
    const result = await turso.execute({
      sql: `
        INSERT INTO contacts (first_name, last_name, email, phone, country_code, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        body.firstName,
        body.lastName,
        body.email,
        body.phone || null,
        body.countryCode || null,
        body.message
      ]
    });

    const response: ContactResponse = {
      success: true,
      message: 'Contact saved successfully',
      id: Number(result.lastInsertRowid)
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 201, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error saving contact:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Optional: GET endpoint to retrieve contacts (for admin use)
// comment for security
// export const GET: APIRoute = async ({ locals }) => {
//   try {
//     // Get env from locals (Cloudflare Pages v2) or fall back to import.meta.env for dev
//     const env = (locals as any).runtime?.env;
    
//     // Create Turso client (works in both dev and production)
//     const turso = createTursoClient(env);
    
//     const result = await turso.execute('SELECT * FROM contacts ORDER BY created_at DESC');
    
//     // Convert BigInt values to numbers and map to typed objects for JSON serialization
//     const contacts: DatabaseContact[] = result.rows.map((row: any) => ({
//       id: Number(row.id),
//       first_name: String(row.first_name),
//       last_name: String(row.last_name),
//       email: String(row.email),
//       phone: row.phone ? String(row.phone) : null,
//       country_code: row.country_code ? String(row.country_code) : null,
//       message: String(row.message),
//       created_at: String(row.created_at)
//     }));
    
//     return new Response(
//       JSON.stringify({ contacts }),
//       { 
//         status: 200, 
//         headers: { 'Content-Type': 'application/json' } 
//       }
//     );
//   } catch (error) {
//     console.error('Error fetching contacts:', error);
//     return new Response(
//       JSON.stringify({ error: 'Internal server error' }),
//       { status: 500, headers: { 'Content-Type': 'application/json' } }
//     );
//   }
// };
