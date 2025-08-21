export const prerender = false;

import type { APIRoute } from "astro";
import { createEmailService } from "../../lib/email-service.js";

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const email = formData.get("email") as string;

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Valid email address is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const emailService = createEmailService(import.meta.env);
    const success = await emailService.unsubscribeEmail(email);

    if (success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Successfully unsubscribed",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to unsubscribe",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error processing unsubscribe:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get("email");

  if (email) {
    // Auto-unsubscribe for GET requests with email parameter
    const emailService = createEmailService(import.meta.env);
    await emailService.unsubscribeEmail(email);
  }

  // Redirect to the unsubscribe page
  return new Response("", {
    status: 302,
    headers: {
      Location: `/unsubscribe${email ? `?email=${encodeURIComponent(email)}&success=true` : ""}`,
    },
  });
};
