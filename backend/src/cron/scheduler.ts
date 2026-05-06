// ============================================================
// NovaCare v2.0 — Cron Scheduler
// Triggers daily pulse check-ins and outcome checks on schedule
// ============================================================

import cron from "node-cron";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { agentBridge } from "../services/agent-bridge.service.js";
import { ivrFallbackService } from "../services/ivr-fallback.service.js";
import pino from "pino";

const logger = pino({ name: "cron-scheduler" });

export function setupCronJobs(): void {
  // Morning pulse: 9:00 AM IST daily
  cron.schedule("30 3 * * *", async () => {  // 3:30 UTC = 9:00 IST
    logger.info("⏰ Morning daily pulse cron triggered");
    await triggerAllDailyPulses();
  });

  // Evening pulse: 8:00 PM IST daily
  cron.schedule("30 14 * * *", async () => {  // 14:30 UTC = 20:00 IST
    logger.info("⏰ Evening daily pulse cron triggered");
    await triggerAllDailyPulses();
  });

  // Day 30 outcomes check: 10:00 AM IST daily
  cron.schedule("30 4 * * *", async () => {  // 4:30 UTC = 10:00 IST
    logger.info("⏰ Day 30 outcomes cron triggered");
    await checkDay30Outcomes();
  });

  // Daily analytics aggregation: 11:00 PM IST
  cron.schedule("30 17 * * *", async () => {
    logger.info("📊 Daily analytics aggregation triggered");
    await aggregateDailyAnalytics();
  });

  // IVR Fallback check: Every 4 hours (6 AM, 10 AM, 2 PM, 6 PM, 10 PM IST)
  cron.schedule("30 0,4,8,12,16 * * *", async () => {
    logger.info("📞 IVR fallback check triggered");
    await ivrFallbackService.checkAndTriggerFallbacks();
  });

  logger.info("✅ Cron jobs scheduled");
}

async function triggerAllDailyPulses(): Promise<void> {
  try {
    const hospitals = await prismaRepository.getAllHospitals();

    for (const hospital of hospitals) {
      const episodes = await prismaRepository.getActiveEpisodesByHospital(hospital.id);

      const patients = episodes.map((ep) => ({
        patientAbhaId: ep.patientAbhaId,
        episodeId: ep.id,
        dayNumber: ep.currentDay + 1,
        contactChannel: "WHATSAPP",
        languagePref: ep.patient?.languagePref || "hi",
      }));

      if (patients.length > 0) {
        await agentBridge.triggerBatchDailyPulse(patients);

        // Increment day counter for all active episodes
        for (const ep of episodes) {
          await prismaRepository.updateEpisode(ep.id, { currentDay: ep.currentDay + 1 });
        }

        logger.info({ hospital: hospital.name, count: patients.length }, "Batch pulse dispatched");
      }
    }
  } catch (error) {
    logger.error({ error }, "Daily pulse cron failed");
  }
}

async function checkDay30Outcomes(): Promise<void> {
  try {
    const hospitals = await prismaRepository.getAllHospitals();

    for (const hospital of hospitals) {
      const episodes = await prismaRepository.getActiveEpisodesByHospital(hospital.id);

      for (const ep of episodes) {
        if (ep.currentDay >= 30) {
          await agentBridge.triggerOutcomesCheck({
            patientAbhaId: ep.patientAbhaId,
            episodeId: ep.id,
            hospitalId: ep.hospitalId,
            carePlanId: ep.carePlanId || "",
          });
          logger.info({ abhaId: ep.patientAbhaId }, "Day 30 outcomes check triggered");
        }
      }
    }
  } catch (error) {
    logger.error({ error }, "Day 30 outcomes cron failed");
  }
}

async function aggregateDailyAnalytics(): Promise<void> {
  try {
    const hospitals = await prismaRepository.getAllHospitals();

    for (const hospital of hospitals) {
      const episodes = await prismaRepository.getActiveEpisodesByHospital(hospital.id);
      const escalations = await prismaRepository.getPendingEscalations(hospital.id);

      let totalRisk = 0;
      let totalAdherence = 0;
      let adherenceCount = 0;
      let greenCount = 0, orangeCount = 0, redCount = 0;

      for (const ep of episodes) {
        totalRisk += ep.riskScore;
        if (ep.adherenceRate != null) { totalAdherence += ep.adherenceRate; adherenceCount++; }
        if (ep.riskTier === "GREEN") greenCount++;
        else if (ep.riskTier === "ORANGE") orangeCount++;
        else if (ep.riskTier === "RED") redCount++;
      }

      await prismaRepository.upsertDailyAnalytics(hospital.id, {
        activePatients: episodes.length,
        readmissionRate: 0,
        avgRiskScore: episodes.length > 0 ? totalRisk / episodes.length : 0,
        avgAdherenceRate: adherenceCount > 0 ? totalAdherence / adherenceCount : 0,
        escalationsGreen: greenCount,
        escalationsOrange: orangeCount,
        escalationsRed: redCount,
        teleconsultsBooked: 0,
        teleconsultsAttended: 0,
      });
    }

    logger.info("📊 Daily analytics aggregation complete");
  } catch (error) {
    logger.error({ error }, "Analytics aggregation failed");
  }
}
