// ============================================================
// NovaCare v2.0 — WhatsApp Business Cloud API Client
// Handles outbound messages: text, templates, interactive, media
// ============================================================

import { config } from "../config/index.js";
import type { WhatsAppMessage, WhatsAppInteractiveMessage, ContactChannel } from "../types/index.js";
import pino from "pino";

const logger = pino({ name: "whatsapp-client" });

const API_BASE = `${config.WHATSAPP_API_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}`;

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export class WhatsAppClient {
  private headers: Record<string, string>;

  constructor() {
    this.headers = {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };
  }

  /** Send a raw WhatsApp message payload */
  private async sendMessage(payload: WhatsAppMessage): Promise<WhatsAppApiResponse | null> {
    try {
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error({ error, to: payload.to }, "WhatsApp API error");
        return null;
      }

      const data = (await response.json()) as WhatsAppApiResponse;
      logger.info({ messageId: data.messages?.[0]?.id, to: payload.to }, "WhatsApp message sent");
      return data;
    } catch (error) {
      logger.error({ error, to: payload.to }, "WhatsApp send failed");
      return null;
    }
  }

  /** Send a plain text message */
  async sendText(to: string, text: string): Promise<string | null> {
    const result = await this.sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
    return result?.messages?.[0]?.id ?? null;
  }

  /** Send a template message (e.g., care plan delivery) */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    parameters: string[]
  ): Promise<string | null> {
    const result = await this.sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    });
    return result?.messages?.[0]?.id ?? null;
  }

  /** Send an interactive button message (daily check-in) */
  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string
  ): Promise<string | null> {
    const interactive: WhatsAppInteractiveMessage = {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((btn) => ({
          type: "reply" as const,
          reply: { id: btn.id, title: btn.title },
        })),
      },
    };

    if (header) interactive.header = { type: "text", text: header };
    if (footer) interactive.footer = { text: footer };

    const result = await this.sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    });
    return result?.messages?.[0]?.id ?? null;
  }

  /** Send an interactive list message (multi-option selection) */
  async sendInteractiveList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    header?: string
  ): Promise<string | null> {
    const interactive: WhatsAppInteractiveMessage = {
      type: "list",
      body: { text: body },
      action: { button: buttonText, sections },
    };

    if (header) interactive.header = { type: "text", text: header };

    const result = await this.sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    });
    return result?.messages?.[0]?.id ?? null;
  }

  // ================================================================
  // NovaCare-Specific Message Templates
  // ================================================================

  /** Send Day 0 care plan delivery */
  async sendCarePlan(
    to: string,
    patientName: string,
    carePlanSummary: string,
    language: string
  ): Promise<string | null> {
    return this.sendTemplate(to, "novacare_care_plan", language, [
      patientName,
      carePlanSummary,
    ]);
  }

  /** Send daily check-in interactive message */
  async sendDailyCheckIn(
    to: string,
    dayNumber: number,
    language: string
  ): Promise<string | null> {
    const bodyTexts: Record<string, string> = {
      hi: `🏥 NovaCare दैनिक जांच — दिन ${dayNumber}\n\nआज आप कैसा महसूस कर रहे हैं?`,
      en: `🏥 NovaCare Daily Check-in — Day ${dayNumber}\n\nHow are you feeling today?`,
      mr: `🏥 NovaCare दैनिक तपासणी — दिवस ${dayNumber}\n\nआज तुम्हाला कसे वाटत आहे?`,
      ta: `🏥 NovaCare தினசரி பரிசோதனை — நாள் ${dayNumber}\n\nஇன்று உங்களுக்கு எப்படி உணர்கிறீர்கள்?`,
      te: `🏥 NovaCare రోజువారీ చెక్-ఇన్ — రోజు ${dayNumber}\n\nమీరు ఈరోజు ఎలా భావిస్తున్నారు?`,
      bn: `🏥 NovaCare দৈনিক চেক-ইন — দিন ${dayNumber}\n\nআজ আপনি কেমন অনুভব করছেন?`,
    };

    const buttonTexts: Record<string, string[]> = {
      hi: ["बेहतर", "ठीक है", "तबीयत खराब"],
      en: ["Better", "Same", "Worse"],
      mr: ["चांगले", "तसेच", "वाईट"],
      ta: ["நன்றாக", "சரியாக", "மோசமாக"],
      te: ["మెరుగ్గా", "అలాగే", "అధ్వాన్నంగా"],
      bn: ["ভালো", "একই রকম", "খারাপ"],
    };

    const lang = language in bodyTexts ? language : "en";

    return this.sendInteractiveButtons(
      to,
      bodyTexts[lang],
      [
        { id: "feeling_better", title: buttonTexts[lang][0] },
        { id: "feeling_same", title: buttonTexts[lang][1] },
        { id: "feeling_worse", title: buttonTexts[lang][2] },
      ],
      "NovaCare",
      `Day ${dayNumber}/30`
    );
  }

  /** Send medication reminder */
  async sendMedicationReminder(
    to: string,
    medications: Array<{ name: string; dosage: string; time: string }>,
    language: string
  ): Promise<string | null> {
    const medList = medications
      .map((m) => `💊 ${m.name} — ${m.dosage} (${m.time})`)
      .join("\n");

    const headerTexts: Record<string, string> = {
      hi: "💊 दवाई रिमाइंडर",
      en: "💊 Medication Reminder",
      mr: "💊 औषध स्मरणपत्र",
    };

    const bodyTexts: Record<string, string> = {
      hi: `आज की दवाइयाँ:\n\n${medList}\n\nक्या आपने सभी दवाइयाँ ले ली हैं?`,
      en: `Today's medications:\n\n${medList}\n\nHave you taken all your medications?`,
      mr: `आजची औषधे:\n\n${medList}\n\nतुम्ही सर्व औषधे घेतली आहेत का?`,
    };

    const lang = language in bodyTexts ? language : "en";

    return this.sendInteractiveButtons(
      to,
      bodyTexts[lang],
      [
        { id: "meds_taken_yes", title: "✅ Yes / हाँ" },
        { id: "meds_taken_no", title: "❌ No / नहीं" },
      ],
      headerTexts[lang] || headerTexts.en
    );
  }

  /** Send caregiver alert */
  async sendCaregiverAlert(
    to: string,
    patientName: string,
    alertMessage: string,
    actionItems: string[]
  ): Promise<string | null> {
    const actions = actionItems.map((a, i) => `${i + 1}. ${a}`).join("\n");
    const body = `⚠️ Alert for ${patientName}\n\n${alertMessage}\n\n📋 Action items:\n${actions}`;

    return this.sendText(to, body);
  }

  /** Send pharmacy/lab location card */
  async sendLocationCard(
    to: string,
    title: string,
    address: string,
    timings: string,
    mapsUrl: string
  ): Promise<string | null> {
    const body = `📍 ${title}\n\n${address}\n\n🕐 Timings: ${timings}\n\n🗺️ Directions: ${mapsUrl}`;
    return this.sendText(to, body);
  }
}

export const whatsappClient = new WhatsAppClient();
