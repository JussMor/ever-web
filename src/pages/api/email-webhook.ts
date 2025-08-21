export const prerender = false;

import type { APIRoute } from "astro";
import { createEmailService } from "../../lib/email-service.js";

/**
 * AWS SES Webhook Handler
 * Processes bounce and complaint notifications from AWS SES
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();

    // Verify the request is from AWS SNS (in production, you should verify the signature)
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("text/plain")) {
      return new Response("Invalid content type", { status: 400 });
    }

    // Parse the SNS message
    let snsMessage;
    try {
      snsMessage = JSON.parse(body);
    } catch (error) {
      console.error("Failed to parse SNS message:", error);
      return new Response("Invalid JSON", { status: 400 });
    }

    // Handle SNS subscription confirmation
    if (snsMessage.Type === "SubscriptionConfirmation") {
      console.log("SNS Subscription confirmation received");
      console.log("SubscribeURL:", snsMessage.SubscribeURL);

      // In production, you should automatically confirm the subscription
      // by making a GET request to the SubscribeURL
      return new Response("Subscription confirmation received", {
        status: 200,
      });
    }

    // Handle notifications
    if (snsMessage.Type === "Notification") {
      const emailService = createEmailService(import.meta.env);

      // Process the webhook
      await emailService.processWebhook(snsMessage);

      console.log("Successfully processed email webhook");
      return new Response("Webhook processed successfully", { status: 200 });
    }

    console.log("Unknown SNS message type:", snsMessage.Type);
    return new Response("Unknown message type", { status: 400 });
  } catch (error) {
    console.error("Error processing email webhook:", error);
    return new Response("Internal server error", { status: 500 });
  }
};

// Handle GET requests for testing
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      message: "AWS SES Webhook Endpoint",
      status: "active",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
