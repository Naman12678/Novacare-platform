// ============================================================
// NovaCare v2.0 — Notification Queue
// Dispatches WhatsApp, IVR, and SMS notifications with fallback
// ============================================================

import { Queue } from "bullmq";
import { redisConnection } from "./agent.queue.js";
import type { ContactChannel } from "../types/index.js";
import pino from "pino";
import { v4 as uuid } from "uuid";

const logger = pino({ name: "notification-queue" });

export const notificationQueue = new Queue("novacare-notifications", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

// ---- Notification Types ----

interface NotificationPayload {
  patient_abha_id: string;
  to_phone: string;
  channel: ContactChannel;
  message_type: string;
  language: string;
  content: Record<string, unknown>;
  fallback_channels: ContactChannel[];
  retry_count?: number;
}

/** Queue a notification with 4-layer fallback: WhatsApp → IVR → SMS → Caregiver */
export async function queueNotification(params: {
  patientAbhaId: string;
  phone: string;
  preferredChannel: ContactChannel;
  messageType: string;
  language: string;
  content: Record<string, unknown>;
  caregiverPhone?: string;
}): Promise<string> {
  const fallbackOrder: ContactChannel[] = ["WHATSAPP", "IVR", "SMS"];
  const channelIndex = fallbackOrder.indexOf(params.preferredChannel);
  const fallbacks = fallbackOrder.slice(channelIndex + 1);

  const jobId = `notif-${params.patientAbhaId}-${params.messageType}-${uuid().slice(0, 8)}`;

  const payload: NotificationPayload = {
    patient_abha_id: params.patientAbhaId,
    to_phone: params.phone,
    channel: params.preferredChannel,
    message_type: params.messageType,
    language: params.language,
    content: params.content,
    fallback_channels: fallbacks,
    retry_count: 0,
  };

  await notificationQueue.add("send_notification", payload, {
    jobId,
    priority: params.messageType === "escalation" ? 1 : 3,
  });

  logger.info({ jobId, channel: params.preferredChannel, messageType: params.messageType }, "Notification queued");
  return jobId;
}

/** Queue a caregiver-specific notification */
export async function queueCaregiverNotification(params: {
  patientAbhaId: string;
  caregiverPhone: string;
  messageType: string;
  language: string;
  content: Record<string, unknown>;
}): Promise<string> {
  const jobId = `caregiver-notif-${params.patientAbhaId}-${uuid().slice(0, 8)}`;

  await notificationQueue.add("send_notification", {
    patient_abha_id: params.patientAbhaId,
    to_phone: params.caregiverPhone,
    channel: "WHATSAPP" as ContactChannel,
    message_type: params.messageType,
    language: params.language,
    content: params.content,
    fallback_channels: ["SMS" as ContactChannel],
    retry_count: 0,
  }, { jobId, priority: 2 });

  logger.info({ jobId }, "Caregiver notification queued");
  return jobId;
}
