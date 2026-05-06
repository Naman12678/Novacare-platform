// ============================================================
// NovaCare v2.0 — Webhook Routes
// ABDM discharge, WhatsApp, and IVR callback receivers
// ============================================================

import { Router, type Request, type Response } from "express";
import { webhookService } from "../services/webhook.service.js";
import { ivrFallbackService } from "../services/ivr-fallback.service.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import { config } from "../config/index.js";
import pino from "pino";

const logger = pino({ name: "webhook-routes" });
const router = Router();

// ================================================================
// ABDM Webhooks
// ================================================================

/** POST /webhook/abdm/discharge — Receive ABDM discharge event */
router.post(
  "/abdm/discharge",
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-abdm-signature"] as string || "";

    logger.info({ requestId: req.body?.requestId }, "ABDM discharge webhook received");

    // Process asynchronously — respond immediately to ABDM
    webhookService.processABDMDischarge(req.body, signature).catch((err) =>
      logger.error({ err }, "ABDM discharge processing failed")
    );

    res.status(200).json({ status: "acknowledged", timestamp: new Date().toISOString() });
  })
);

/** POST /webhook/abdm/consent — ABDM consent callback */
router.post(
  "/abdm/consent",
  asyncHandler(async (req: Request, res: Response) => {
    await webhookService.processABDMConsentCallback(req.body);
    res.status(200).json({ status: "acknowledged" });
  })
);

/** POST /webhook/abdm/data-push — ABDM health information push */
router.post(
  "/abdm/data-push",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("ABDM data push received");
    // Store FHIR data pushed by ABDM
    res.status(200).json({ status: "acknowledged" });
  })
);

// ================================================================
// WhatsApp Webhooks
// ================================================================

/** GET /webhook/whatsapp — WhatsApp verification challenge */
router.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;

  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
    logger.info("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    logger.warn("WhatsApp webhook verification failed");
    res.sendStatus(403);
  }
});

/** POST /webhook/whatsapp — Receive WhatsApp messages */
router.post(
  "/whatsapp",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;

    // WhatsApp Cloud API sends nested structure
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Log all incoming webhooks for debugging
    logger.info({
      hasEntry: !!entry,
      hasChanges: !!changes,
      hasValue: !!value,
      hasMessages: !!value?.messages,
      hasStatuses: !!value?.statuses,
      field: changes?.field,
    }, "WhatsApp webhook POST received");

    if (value?.messages) {
      for (const message of value.messages) {
        logger.info({
          from: message.from,
          type: message.type,
          textBody: message.text?.body,
          interactiveType: message.interactive?.type,
          buttonReplyId: message.interactive?.button_reply?.id,
        }, "Processing WhatsApp message");

        await webhookService.processWhatsAppMessage({
          from: message.from,
          type: message.type,
          text: message.text,
          interactive: message.interactive,
          timestamp: message.timestamp,
        });
      }
    }

    // WhatsApp requires 200 response
    res.sendStatus(200);
  })
);

// ================================================================
// Exotel IVR Webhooks
// ================================================================

/** POST /webhook/ivr/status — Exotel call status callback */
router.post(
  "/ivr/status",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info({ body: req.body }, "IVR status callback received");

    await ivrFallbackService.processIVRResult({
      callSid: req.body.CallSid || req.body.Sid || "",
      status: req.body.Status || req.body.CallStatus || "",
      digits: req.body.digits || req.body.Digits || "",
      customField: req.body.CustomField || "",
    });

    res.status(200).json({ status: "acknowledged" });
  })
);

/** POST /webhook/ivr/applet — Exotel IVR applet handler (dynamic TwiML-like responses) */
router.post(
  "/ivr/applet",
  asyncHandler(async (req: Request, res: Response) => {
    // Return ExoML response for IVR flow
    const customField = req.body.CustomField ? JSON.parse(req.body.CustomField) : {};
    const language = customField.language || "en";
    const dayNumber = customField.day_number || 1;

    const prompts: Record<string, string> = {
      hi: `नमस्ते! यह NovaCare की दैनिक जांच है, दिन ${dayNumber}। कृपया बताएं: अच्छा महसूस हो रहा है तो 1 दबाएं, कुछ परेशानी है तो 2 दबाएं, मदद चाहिए तो 3 दबाएं।`,
      en: `Hello! This is your NovaCare daily check-in, day ${dayNumber}. Please press: 1 if feeling good, 2 if some issues, 3 if you need help.`,
      mr: `नमस्कार! हे NovaCare दैनंदिन तपासणी आहे, दिवस ${dayNumber}. कृपया दाबा: 1 चांगले वाटत असल्यास, 2 काही समस्या असल्यास, 3 मदत हवी असल्यास.`,
    };

    const prompt = prompts[language] || prompts.en;

    // Return Exotel-compatible XML
    res.set("Content-Type", "application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/webhook/ivr/status" timeout="10">
    <Say>${prompt}</Say>
  </Gather>
  <Say>No input received. Goodbye.</Say>
</Response>`);
  })
);

export default router;
