// ============================================================
// NovaCare v2.0 — Exotel IVR Client
// Handles outbound IVR calls for patient follow-up
// Uses Exotel Connect API + ExoML for dynamic IVR flows
// ============================================================

import { config } from "../config/index.js";
import pino from "pino";

const logger = pino({ name: "exotel-client" });

interface ExotelCallResponse {
  Call: {
    Sid: string;
    Status: string;
    DateCreated: string;
    Direction: string;
  };
}

export class ExotelClient {
  private baseUrl: string;
  private authHeader: string;
  private callerId: string;
  private appId: string;

  constructor() {
    // Exotel API v1 URL format
    this.baseUrl = `https://api.exotel.com/v1/Accounts/${config.EXOTEL_SID}`;
    this.authHeader = Buffer.from(
      `${config.EXOTEL_API_KEY}:${config.EXOTEL_API_TOKEN}`
    ).toString("base64");
    this.callerId = config.EXOTEL_CALLER_ID;
    this.appId = config.EXOTEL_APP_ID;
  }

  /**
   * Initiate an outbound IVR call to a patient.
   * Uses Exotel's Connect API with an ExoML app for the IVR flow.
   * 
   * The ExoML app (configured in Exotel dashboard) handles:
   * - Playing the greeting/question
   * - Collecting DTMF input (keypress)
   * - Posting results to our webhook
   */
  async makeCall(params: {
    to: string;
    customField?: string;
    statusCallbackUrl?: string;
  }): Promise<ExotelCallResponse | null> {
    try {
      // Format phone number (Exotel expects 10 digits or with country code)
      const phone = this.formatPhone(params.to);

      const formData = new URLSearchParams();
      formData.append("From", phone);              // Patient's number (Exotel calls them first)
      formData.append("CallerId", this.callerId);  // Shows this number on caller ID
      formData.append("Url", `http://my.exotel.com/exoml/start_voice/${this.appId}`);
      
      if (params.customField) {
        formData.append("CustomField", params.customField);
      }
      if (params.statusCallbackUrl) {
        formData.append("StatusCallback", params.statusCallbackUrl);
      }
      
      // Time limit: 3 minutes max
      formData.append("TimeLimit", "180");

      logger.info({ phone, appId: this.appId }, "Initiating Exotel IVR call");

      const response = await fetch(`${this.baseUrl}/Calls/connect.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${this.authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText, phone }, "Exotel call failed");
        return null;
      }

      const data = (await response.json()) as ExotelCallResponse;
      logger.info({ callSid: data.Call?.Sid, status: data.Call?.Status, phone }, "Exotel call initiated");
      return data;
    } catch (error) {
      logger.error({ error, to: params.to }, "Exotel API error");
      return null;
    }
  }

  /**
   * Send daily pulse IVR call — fallback when WhatsApp doesn't get a response.
   * The IVR flow asks: "How are you feeling? Press 1 for good, 2 for issues, 3 for help"
   */
  async sendDailyPulseIVR(params: {
    phone: string;
    dayNumber: number;
    language: string;
    patientAbhaId: string;
    patientName: string;
  }): Promise<string | null> {
    const ngrokUrl = this.getWebhookBaseUrl();

    const result = await this.makeCall({
      to: params.phone,
      customField: JSON.stringify({
        type: "daily_pulse",
        patient_abha_id: params.patientAbhaId,
        patient_name: params.patientName,
        day_number: params.dayNumber,
        language: params.language,
      }),
      statusCallbackUrl: `${ngrokUrl}/webhook/ivr/status`,
    });

    if (result?.Call?.Sid) {
      logger.info({
        callSid: result.Call.Sid,
        patient: params.patientAbhaId,
        day: params.dayNumber,
      }, "Daily pulse IVR call initiated");
    }

    return result?.Call?.Sid ?? null;
  }

  /**
   * Send escalation IVR call to family caregiver when patient is unresponsive.
   */
  async sendCaregiverAlertIVR(params: {
    phone: string;
    patientName: string;
    patientAbhaId: string;
    riskTier: string;
  }): Promise<string | null> {
    const ngrokUrl = this.getWebhookBaseUrl();

    const result = await this.makeCall({
      to: params.phone,
      customField: JSON.stringify({
        type: "caregiver_alert",
        patient_abha_id: params.patientAbhaId,
        patient_name: params.patientName,
        risk_tier: params.riskTier,
      }),
      statusCallbackUrl: `${ngrokUrl}/webhook/ivr/status`,
    });

    return result?.Call?.Sid ?? null;
  }

  /**
   * Get call details/recording
   */
  async getCallDetails(callSid: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/Calls/${callSid}.json`, {
        headers: { "Authorization": `Basic ${this.authHeader}` },
      });
      if (!response.ok) return null;
      return response.json() as Promise<Record<string, unknown>>;
    } catch {
      return null;
    }
  }

  /**
   * Format phone number for Exotel API
   * Exotel accepts: 09876543210 or 919876543210
   */
  private formatPhone(phone: string): string {
    // Remove any + prefix
    let cleaned = phone.replace(/^\+/, "");
    // If starts with 91 and is 12 digits, it's already correct
    if (cleaned.startsWith("91") && cleaned.length === 12) {
      return cleaned;
    }
    // If 10 digits, add 0 prefix (local format)
    if (cleaned.length === 10) {
      return `0${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Get the webhook base URL (ngrok in dev, actual domain in prod)
   */
  private getWebhookBaseUrl(): string {
    // In production, this would be the actual domain
    // For dev, we use the backend's own URL (Exotel will call back to ngrok)
    return config.CORS_ORIGINS.split(",")[0] || "http://localhost:8000";
  }
}

export const exotelClient = new ExotelClient();
