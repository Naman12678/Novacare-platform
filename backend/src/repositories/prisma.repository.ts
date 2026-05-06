// ============================================================
// NovaCare v2.0 — Prisma Repository
// PostgreSQL data access via Prisma ORM for relational data
// ============================================================

import { PrismaClient, EpisodeStatus, UserRole, type Prisma } from "@prisma/client";

// Global Prisma singleton (prevents hot-reload connection exhaustion)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export class PrismaRepository {
  // ================================================================
  // Patients
  // ================================================================

  async createPatient(data: {
    abhaId: string;
    nameEncrypted: string;
    dateOfBirth: Date;
    gender: string;
    pincode: string;
    languagePref: string;
    contactPhone: string;
    hospitalId: string;
    ruralFlag: boolean;
  }) {
    return prisma.patient.create({ data });
  }

  async getPatientByAbhaId(abhaId: string) {
    return prisma.patient.findUnique({
      where: { abhaId },
      include: { hospital: true, caregivers: true },
    });
  }

  async getPatientByPhone(phone: string) {
    // WhatsApp sends phone without '+' prefix (e.g., '918697384274')
    // Normalize: strip any '+' or leading zeros
    const normalizedPhone = phone.replace(/^\+/, '');
    
    return prisma.patient.findFirst({
      where: {
        OR: [
          { contactPhone: normalizedPhone },
          { contactPhone: `+${normalizedPhone}` },
          { contactPhone: phone },
        ],
      },
      include: { hospital: true, episodes: { where: { status: "ACTIVE" }, take: 1 } },
    });
  }

  async getPatientsByHospital(hospitalId: string, page = 1, pageSize = 50) {
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: { hospitalId },
        include: { episodes: { where: { status: "ACTIVE" }, take: 1, orderBy: { createdAt: "desc" } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.patient.count({ where: { hospitalId } }),
    ]);
    return { patients, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async deletePatient(abhaId: string) {
    return prisma.patient.delete({ where: { abhaId } });
  }

  // ================================================================
  // Episodes
  // ================================================================

  async createEpisode(data: {
    patientAbhaId: string;
    hospitalId: string;
    dischargeDate: Date;
    diagnosisCodes: string[];
    carePlanId?: string;
  }) {
    return prisma.episode.create({ data: { ...data, status: "ACTIVE" } });
  }

  async getActiveEpisode(patientAbhaId: string) {
    return prisma.episode.findFirst({
      where: { patientAbhaId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
  }

  async getActiveEpisodesByHospital(hospitalId: string) {
    return prisma.episode.findMany({
      where: { hospitalId, status: "ACTIVE" },
      include: { patient: true },
      orderBy: { riskScore: "desc" },
    });
  }

  async updateEpisode(id: string, data: Prisma.EpisodeUpdateInput) {
    return prisma.episode.update({ where: { id }, data });
  }

  async completeEpisode(id: string, outcome: { readmitted: boolean; adherenceRate: number }) {
    return prisma.episode.update({
      where: { id },
      data: {
        status: outcome.readmitted ? "READMITTED" : "COMPLETED",
        readmitted: outcome.readmitted,
        adherenceRate: outcome.adherenceRate,
        completedAt: new Date(),
      },
    });
  }

  // ================================================================
  // Caregivers
  // ================================================================

  async createCaregiver(data: {
    patientAbhaId: string;
    name: string;
    phoneEncrypted: string;
    relationship: string;
    whatsappOptIn: boolean;
    languagePref: string;
  }) {
    return prisma.caregiver.create({ data });
  }

  async getCaregivers(patientAbhaId: string) {
    return prisma.caregiver.findMany({
      where: { patientAbhaId },
      orderBy: { lastActiveAt: "desc" },
    });
  }

  async updateCaregiverActivity(caregiverId: string) {
    return prisma.caregiver.update({
      where: { id: caregiverId },
      data: { lastActiveAt: new Date() },
    });
  }

  // ================================================================
  // FHIR Resources
  // ================================================================

  async storeFhirResource(data: {
    resourceType: string;
    patientAbhaId: string;
    fhirJson: Prisma.InputJsonValue;
  }) {
    return prisma.fhirResource.create({ data });
  }

  async getFhirResources(patientAbhaId: string, resourceType?: string) {
    return prisma.fhirResource.findMany({
      where: {
        patientAbhaId,
        ...(resourceType && { resourceType }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ================================================================
  // Escalations
  // ================================================================

  async createEscalation(data: {
    patientAbhaId: string;
    episodeId: string;
    tier: string;
    triggerReason: string;
    shapExplanation?: string;
    recommendedAction?: string;
  }) {
    return prisma.escalation.create({ data: { ...data, status: "PENDING" } });
  }

  async getPendingEscalations(hospitalId?: string) {
    return prisma.escalation.findMany({
      where: {
        status: "PENDING",
        ...(hospitalId && { episode: { hospitalId } }),
      },
      include: { patient: true, episode: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolveEscalation(id: string, outcome: string) {
    return prisma.escalation.update({
      where: { id },
      data: { status: "RESOLVED", outcome, resolvedAt: new Date() },
    });
  }

  // ================================================================
  // Medications
  // ================================================================

  async getMedication(rxnormCode: string) {
    return prisma.medication.findUnique({ where: { rxnormCode } });
  }

  async searchMedications(query: string) {
    return prisma.medication.findMany({
      where: {
        OR: [
          { genericName: { contains: query, mode: "insensitive" } },
          { brandName: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 20,
    });
  }

  // ================================================================
  // Hospitals
  // ================================================================

  async getHospital(id: string) {
    return prisma.hospital.findUnique({ where: { id } });
  }

  async getHospitalByHipId(hipId: string) {
    return prisma.hospital.findUnique({ where: { hipId } });
  }

  async getAllHospitals() {
    return prisma.hospital.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }

  // ================================================================
  // Analytics
  // ================================================================

  async upsertDailyAnalytics(hospitalId: string, data: {
    activePatients: number;
    readmissionRate: number;
    avgRiskScore: number;
    avgAdherenceRate: number;
    escalationsGreen: number;
    escalationsOrange: number;
    escalationsRed: number;
    teleconsultsBooked: number;
    teleconsultsAttended: number;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.hospitalAnalytics.upsert({
      where: { hospitalId_reportDate: { hospitalId, reportDate: today } },
      create: { hospitalId, reportDate: today, ...data },
      update: data,
    });
  }

  async getAnalyticsTrend(hospitalId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return prisma.hospitalAnalytics.findMany({
      where: { hospitalId, reportDate: { gte: since } },
      orderBy: { reportDate: "asc" },
    });
  }

  // ================================================================
  // Users (Auth)
  // ================================================================

  async getUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, include: { hospital: true } });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    name: string;
    role: UserRole;
    hospitalId: string;
  }) {
    return prisma.user.create({ data });
  }

  async updateLastLogin(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  // ================================================================
  // Model Versions
  // ================================================================

  async getChampionModel() {
    return prisma.modelVersion.findFirst({
      where: { deploymentStatus: "champion" },
      orderBy: { trainingDate: "desc" },
    });
  }

  async createModelVersion(data: {
    version: string;
    trainingDate: Date;
    validationAuc: number;
    deploymentStatus: string;
    endpointArn?: string;
    trainingDataPath?: string;
  }) {
    return prisma.modelVersion.create({ data });
  }

  // ================================================================
  // Daily Reports
  // ================================================================

  async createDailyReport(data: {
    patientAbhaId: string;
    episodeId: string;
    dayNumber: number;
    feelingScore: number;
    symptoms: string[];
    symptomDetail?: string;
    medTaken: boolean;
    vitals?: Record<string, string>;
    riskScore?: number;
    riskTier?: string;
    source?: string;
  }) {
    return prisma.dailyReport.create({
      data: {
        patientAbhaId: data.patientAbhaId,
        episodeId: data.episodeId,
        dayNumber: data.dayNumber,
        feelingScore: data.feelingScore,
        symptoms: data.symptoms,
        symptomDetail: data.symptomDetail,
        medTaken: data.medTaken,
        vitals: data.vitals || undefined,
        riskScore: data.riskScore,
        riskTier: data.riskTier,
        source: data.source || "whatsapp",
      },
    });
  }

  async getDailyReports(patientAbhaId: string) {
    return prisma.dailyReport.findMany({
      where: { patientAbhaId },
      orderBy: { dayNumber: "asc" },
    });
  }
}

export const prismaRepository = new PrismaRepository();
