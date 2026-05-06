// ============================================================
// NovaCare v2.0 — ABDM (Ayushman Bharat Digital Mission) Client
// Handles FHIR resource CRUD, consent management, and webhook verification
// ============================================================

import { config } from "../config/index.js";
import pino from "pino";
import crypto from "crypto";

const logger = pino({ name: "abdm-client" });

interface ABDMTokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface ABDMConsentResponse {
  requestId: string;
  consentRequestId: string;
  status: string;
}

export class ABDMClient {
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.baseUrl = config.ABDM_BASE_URL;
    this.clientId = config.ABDM_CLIENT_ID;
    this.clientSecret = config.ABDM_CLIENT_SECRET;
  }

  /** Get or refresh ABDM access token */
  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/cert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        }),
      });

      const data = (await response.json()) as ABDMTokenResponse;
      this.accessToken = data.accessToken;
      this.tokenExpiry = Date.now() + data.expiresIn * 1000 - 60_000; // 1 min buffer
      return this.accessToken;
    } catch (error) {
      logger.error({ error }, "ABDM token refresh failed");
      throw new Error("Failed to authenticate with ABDM");
    }
  }

  /** Make authenticated request to ABDM */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-CM-ID": "sbx", // sandbox; change to "abdm" for production
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ path, status: response.status, error }, "ABDM API error");
      throw new Error(`ABDM API error: ${response.status}`);
    }

    return response.json() as T;
  }

  // ================================================================
  // Consent Management
  // ================================================================

  /** Request consent to access patient's ABDM records */
  async requestConsent(params: {
    patientAbhaId: string;
    hipId: string;
    purpose: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<ABDMConsentResponse> {
    const requestId = crypto.randomUUID();

    return this.request<ABDMConsentResponse>("/v0.5/consent-requests/init", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        consent: {
          purpose: { text: params.purpose, code: "CAREMGT" },
          patient: { id: params.patientAbhaId },
          hip: { id: params.hipId },
          hiu: { id: config.ABDM_HIP_ID },
          requester: {
            name: "NovaCare v2.0",
            identifier: { type: "REGNO", value: config.ABDM_HIP_ID, system: "https://www.mciindia.org" },
          },
          hiTypes: ["DiagnosticReport", "Prescription", "DischargeSummary", "OPConsultation"],
          permission: {
            accessMode: "VIEW",
            dateRange: { from: params.dateFrom, to: params.dateTo },
            dataEraseAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            frequency: { unit: "HOUR", value: 1, repeats: 0 },
          },
        },
      }),
    });
  }

  // ================================================================
  // Health Information Exchange
  // ================================================================

  /** Fetch FHIR health records for a patient (after consent granted) */
  async fetchHealthRecords(params: {
    consentId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<Record<string, unknown>> {
    const requestId = crypto.randomUUID();

    return this.request("/v0.5/health-information/cm/request", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        hiRequest: {
          consent: { id: params.consentId },
          dateRange: { from: params.dateFrom, to: params.dateTo },
          dataPushUrl: `${config.ABDM_BASE_URL}/webhook/abdm/data-push`, // NovaCare's data receiver
          keyMaterial: {
            cryptoAlg: "ECDH",
            curve: "Curve25519",
            dhPublicKey: { expiry: new Date(Date.now() + 86_400_000).toISOString(), parameters: "Curve25519" },
          },
        },
      }),
    });
  }

  // ================================================================
  // FHIR Resource Operations
  // ================================================================

  /** Push FHIR resource to ABDM patient locker */
  async pushFhirResource(params: {
    patientAbhaId: string;
    careContextReference: string;
    resource: Record<string, unknown>;
  }): Promise<void> {
    await this.request("/v0.5/health-information/notify", {
      method: "POST",
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        notification: {
          patient: { id: params.patientAbhaId },
          careContext: { careContextReference: params.careContextReference },
          hiTypes: [params.resource.resourceType],
          date: new Date().toISOString(),
        },
      }),
    });

    logger.info(
      { abhaId: params.patientAbhaId, resourceType: params.resource.resourceType },
      "FHIR resource pushed to ABDM"
    );
  }

  /** Discover patient care contexts */
  async discoverCareContexts(patientAbhaId: string): Promise<Record<string, unknown>> {
    return this.request(`/v0.5/care-contexts/discover`, {
      method: "POST",
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        patient: { id: patientAbhaId, name: "", gender: "", yearOfBirth: "" },
      }),
    });
  }

  /** Check for readmission records (Day 30 outcome check) */
  async checkReadmission(patientAbhaId: string, sinceDays: number = 30): Promise<boolean> {
    try {
      const sinceDate = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const records = await this.request<{ entries?: unknown[] }>(
        `/v1/patients/${patientAbhaId}/admissions?since=${sinceDate}`
      );
      return (records.entries?.length ?? 0) > 0;
    } catch {
      logger.warn({ patientAbhaId }, "Readmission check failed — defaulting to false");
      return false;
    }
  }

  /** Get pharmacy dispensing history for refill gap detection */
  async getDispensingHistory(
    patientAbhaId: string
  ): Promise<Array<{ medicationCode: string; dispensedDate: string; daysSupply: number }>> {
    try {
      const records = await this.request<{ entries: Array<Record<string, unknown>> }>(
        `/abdm/pharmacy/dispensing-history/${patientAbhaId}`
      );
      return (records.entries || []).map((entry: Record<string, unknown>) => ({
        medicationCode: entry.medicationCode as string,
        dispensedDate: entry.dispensedDate as string,
        daysSupply: entry.daysSupply as number,
      }));
    } catch {
      logger.warn({ patientAbhaId }, "Dispensing history unavailable");
      return [];
    }
  }

  // ================================================================
  // Webhook Verification
  // ================================================================

  /** Verify ABDM webhook HMAC-SHA256 signature */
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    hipPublicKey: string
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac("sha256", hipPublicKey)
        .update(payload)
        .digest("hex");
      return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  }
}

export const abdmClient = new ABDMClient();
