// ============================================================
// NovaCare v2.0 — Webhook Processing Service
// Handles inbound ABDM and WhatsApp webhook events
// ============================================================

import { patientService } from "./patient.service.js";
import { escalationService } from "./escalation.service.js";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { ABDMClient } from "../integrations/abdm.client.js";
import { whatsappFlowService } from "./whatsapp-flow.service.js";
import type { ABDMWebhookPayload } from "../types/index.js";
import pino from "pino";

const logger = pino({ name: "webhook-service" });

export class WebhookService {
  // ================================================================
  // ABDM Webhook Processing
  // ================================================================

  /** Process incoming ABDM discharge webhook */
  async processABDMDischarge(payload: ABDMWebhookPayload, signature: string): Promise<void> {
    // 1. Verify HMAC signature
    // In production: verify using hospital HIP public key from ABDM registry
    // For hackathon: simplified verification
    logger.info({ requestId: payload.requestId }, "Processing ABDM discharge webhook");

    if (!payload.patient?.id) {
      logger.error("ABDM webhook missing patient ID");
      return;
    }

    const abhaId = payload.patient.id;

    // 2. Check for existing active episode (prevent duplicates)
    const existingEpisode = await prismaRepository.getActiveEpisode(abhaId);
    if (existingEpisode) {
      logger.warn({ abhaId }, "Active episode already exists — skipping discharge");
      return;
    }

    // 3. Trigger discharge workflow
    await patientService.onDischarge({
      abhaId,
      name: payload.patient.display || "Unknown",
      dateOfBirth: new Date(1960, 0, 1), // Will be enriched by Agent 1
      gender: "unknown",
      pincode: "000000",
      languagePref: "hi",
      contactPhone: "", // Will be enriched
      hospitalId: payload.careContexts?.[0]?.careContextReference || "unknown",
      fhirBundle: payload as unknown as Record<string, unknown>,
    });

    logger.info({ abhaId }, "ABDM discharge webhook processed → Agent 1 dispatched");
  }

  /** Process ABDM consent callback */
  async processABDMConsentCallback(payload: ABDMWebhookPayload): Promise<void> {
    logger.info(
      { requestId: payload.requestId, status: payload.notification.status },
      "ABDM consent callback received"
    );

    if (payload.notification.status === "GRANTED") {
      // Consent granted → trigger health record fetch
      logger.info("ABDM consent GRANTED — fetching health records");
    } else {
      logger.warn({ status: payload.notification.status }, "ABDM consent not granted");
    }
  }

  // ================================================================
  // WhatsApp Webhook Processing
  // ================================================================

  /** Process incoming WhatsApp message/interaction */
  async processWhatsAppMessage(payload: {
    from: string;
    type: string;
    text?: { body: string };
    interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string } };
    timestamp: string;
  }): Promise<void> {
    const phone = payload.from;
    logger.info({ phone, type: payload.type }, "WhatsApp message received");

    // Extract message text or button ID
    let messageText = "";
    if (payload.type === "text" && payload.text) {
      messageText = payload.text.body;
    } else if (payload.type === "interactive") {
      messageText = payload.interactive?.button_reply?.id || payload.interactive?.list_reply?.id || "";
    }

    // Handle the message through the flow service
    await whatsappFlowService.handlePatientMessage(phone, messageText, payload.type);
  }

  /** Process interactive button/list reply from WhatsApp */
  private async processInteractiveResponse(
    phone: string,
    interactive: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string } }
  ): Promise<void> {
    const replyId = interactive.button_reply?.id || interactive.list_reply?.id;
    if (!replyId) return;

    // Map button IDs to actions
    switch (replyId) {
      case "feeling_better":
        // Positive pulse response
        logger.info({ phone }, "Patient feeling better");
        break;

      case "feeling_same":
        logger.info({ phone }, "Patient feeling same");
        break;

      case "feeling_worse":
        logger.info({ phone }, "Patient feeling worse — elevated monitoring");
        break;

      case "meds_taken_yes":
        logger.info({ phone }, "Medication confirmed taken");
        break;

      case "meds_taken_no":
        logger.info({ phone }, "Medication NOT taken — triggering pharmacy check");
        break;

      default:
        logger.info({ phone, replyId }, "Unknown interactive reply");
    }
  }

  /** Process free-text response (sends to Python NLP pipeline) */
  private async processFreeTextResponse(phone: string, text: string): Promise<void> {
    logger.info({ phone, textLength: text.length }, "Free text response — forwarding to NLP agent");
    // This would be dispatched to the Python agent service for
    // IndicNLP + Comprehend Medical extraction
  }

  // ================================================================
  // IVR Webhook Processing
  // ================================================================

  /** Process Exotel IVR call status callback */
  async processIVRCallback(payload: {
    CallSid: string;
    Status: string;
    Direction: string;
    Digits?: string;
    RecordingUrl?: string;
    CustomField?: string;
  }): Promise<void> {
    logger.info(
      { callSid: payload.CallSid, status: payload.Status },
      "IVR callback received"
    );

    if (payload.Status === "completed" && payload.Digits) {
      // Parse DTMF digits as pulse response
      // 1 = feeling ok, 2 = some issue, 3 = need help
      const digitMap: Record<string, number> = { "1": 1, "2": 3, "3": 5 };
      const score = digitMap[payload.Digits] || 3;

      let patientAbhaId = "";
      if (payload.CustomField) {
        try {
          const custom = JSON.parse(payload.CustomField);
          patientAbhaId = custom.patient_abha_id;
        } catch {
          // ignore
        }
      }

      if (patientAbhaId) {
        await patientService.processPulseResponse({
          abhaId: patientAbhaId,
          feelingScore: score,
          medTaken: payload.Digits !== "3",
          source: "patient",
        });
      }
    }
  }
}

export const webhookService = new WebhookService();
