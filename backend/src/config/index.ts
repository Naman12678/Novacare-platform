// ============================================================
// NovaCare v2.0 — Application Configuration
// Centralized config loaded from environment variables with validation
// ============================================================

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  // AWS
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().default("test"),
  AWS_SESSION_TOKEN: z.string().optional(),
  AWS_ENDPOINT_URL: z.string().optional(),

  // DynamoDB
  DYNAMODB_TABLE_NAME: z.string().default("novacare_patient_state"),

  // PostgreSQL (Prisma)
  DATABASE_URL: z.string().default("postgresql://novacare:novacare_secret@localhost:5432/novacare_db"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Python Agent Service
  AGENT_SERVICE_URL: z.string().default("http://localhost:8100"),

  // WhatsApp Business API
  WHATSAPP_API_URL: z.string().default("https://graph.facebook.com/v25.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().default("novacare-webhook-verify-2026"),

  // Exotel IVR
  EXOTEL_API_KEY: z.string().default(""),
  EXOTEL_API_TOKEN: z.string().default(""),
  EXOTEL_SID: z.string().default(""),
  EXOTEL_CALLER_ID: z.string().default("09513886363"),
  EXOTEL_APP_ID: z.string().default("1239010"),

  // ABDM
  ABDM_BASE_URL: z.string().default("https://dev.abdm.gov.in"),
  ABDM_CLIENT_ID: z.string().default(""),
  ABDM_CLIENT_SECRET: z.string().default(""),
  ABDM_HIP_ID: z.string().default("novacare-hip-001"),

  // UHI
  UHI_BASE_URL: z.string().default("https://uhigateway.abdm.gov.in"),
  UHI_EUA_ID: z.string().default("novacare-eua-001"),

  // Encryption
  KMS_KEY_ID: z.string().default(""),

  // JWT
  JWT_SECRET: z.string().default("novacare-dev-secret-change-in-production"),
  JWT_EXPIRES_IN: z.string().default("24h"),

  // SageMaker
  SAGEMAKER_ENDPOINT_NAME: z.string().default("novacare-risk-model"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof envSchema>;
