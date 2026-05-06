// ============================================================
// NovaCare v2.0 — Escalation Service
// Manages risk-tier escalation lifecycle
// ============================================================

import { v4 as uuid } from "uuid";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import { agentBridge } from "./agent-bridge.service.js";
import { queueNotification, queueCaregiverNotification } from "../queues/notification.queue.js";
import type { RiskTier, Escalation } from "../types/index.js";
import pino from "pino";

const logger = pino({ name: "escalation-service" });

export class EscalationService {
  /** Create a new escalation from risk orchestrator event */
  async createEscalation(params: {
    patientAbhaId: string;
    episodeId: string;
    riskScore: number;
    tier: RiskTier;
    shapExplanation: string;
    recommendedAction: string;
  }): Promise<Escalation | null> {
    // Deduplication: check if there's an active escalation in last 2 hours
    const existing = await prismaRepository.getPendingEscalations();
    const recentDuplicate = existing.find(
      (e) =>
        e.patientAbhaId === params.patientAbhaId &&
        e.status === "PENDING" &&
        new Date(e.createdAt).getTime() > Date.now() - 2 * 60 * 60 * 1000
    );

    if (recentDuplicate) {
      logger.info({ abhaId: params.patientAbhaId }, "Duplicate escalation skipped (within 2h window)");
      return null;
    }

    // Create escalation record
    const escalation = await prismaRepository.createEscalation({
      patientAbhaId: params.patientAbhaId,
      episodeId: params.episodeId,
      tier: params.tier,
      triggerReason: `Risk score: ${params.riskScore.toFixed(2)} | ${params.recommendedAction}`,
      shapExplanation: params.shapExplanation,
      recommendedAction: params.recommendedAction,
    });

    // Update DynamoDB patient state
    await dynamoRepository.updatePatientState(params.patientAbhaId, {
      active_escalation_id: escalation.id,
      escalation_tier: params.tier,
      risk_score: params.riskScore,
      risk_tier: params.tier,
    });

    // Log event
    await dynamoRepository.appendEvent(params.patientAbhaId, "ESCALATION_CREATED", "risk_orchestrator", {
      escalation_id: escalation.id,
      tier: params.tier,
      risk_score: params.riskScore,
    });

    // Dispatch tier-appropriate notifications
    await this.dispatchEscalationNotifications(params.patientAbhaId, params.tier, escalation.id);

    logger.info(
      { abhaId: params.patientAbhaId, tier: params.tier, score: params.riskScore },
      "Escalation created"
    );

    return escalation as unknown as Escalation;
  }

  /** Resolve an escalation */
  async resolveEscalation(escalationId: string, outcome: string): Promise<void> {
    const escalation = await prismaRepository.resolveEscalation(escalationId, outcome);

    if (escalation) {
      await dynamoRepository.updatePatientState(escalation.patientAbhaId, {
        active_escalation_id: null,
        escalation_tier: null,
      });

      await dynamoRepository.appendEvent(escalation.patientAbhaId, "ESCALATION_RESOLVED", "risk_orchestrator", {
        escalation_id: escalationId,
        outcome,
      });
    }

    logger.info({ escalationId, outcome }, "Escalation resolved");
  }

  /** Get escalation queue for hospital dashboard */
  async getEscalationQueue(hospitalId?: string) {
    return prismaRepository.getPendingEscalations(hospitalId);
  }

  /** Dispatch notifications based on escalation tier */
  private async dispatchEscalationNotifications(
    abhaId: string,
    tier: RiskTier,
    escalationId: string
  ): Promise<void> {
    const patient = await prismaRepository.getPatientByAbhaId(abhaId);
    if (!patient) return;

    // Tier-specific actions
    switch (tier) {
      case "ORANGE":
        // Book eSanjeevani teleconsult via Agent 3
        // Family caregiver alert via Agent 5
        await agentBridge.triggerFamilyAlert({
          patientAbhaId: abhaId,
          episodeId: "", // Will be resolved
          alertType: "escalation",
          riskTier: "ORANGE",
        });
        break;

      case "RED":
        // Hospital coordinator alert
        await queueNotification({
          patientAbhaId: abhaId,
          phone: patient.hospital?.contactPhone || "",
          preferredChannel: "WHATSAPP",
          messageType: "escalation",
          language: "en",
          content: {
            escalation_id: escalationId,
            patient_name: patient.nameEncrypted,
            tier: "RED",
            action: "Immediate hospital coordinator review required. Consider 108 ambulance dispatch.",
          },
        });

        // Family caregiver critical alert
        await agentBridge.triggerFamilyAlert({
          patientAbhaId: abhaId,
          episodeId: "",
          alertType: "escalation",
          riskTier: "RED",
        });
        break;
    }
  }
}

export const escalationService = new EscalationService();
