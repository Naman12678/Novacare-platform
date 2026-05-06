// ============================================================
// NovaCare v2.0 — Core Type Definitions
// Shared types for patient state, agents, events, and API responses
// ============================================================

// ---- Risk Tiers ----
export type RiskTier = "GREEN" | "ORANGE" | "RED";

// ---- Contact Channels ----
export type ContactChannel = "WHATSAPP" | "IVR" | "SMS";

// ---- Escalation Status ----
export type EscalationStatus = "PENDING" | "CONFIRMED" | "RESOLVED" | "EXPIRED";

// ---- Agent Identifiers ----
export type AgentId =
  | "discharge_architect"
  | "daily_pulse"
  | "risk_orchestrator"
  | "pharmacy_bridge"
  | "family_network"
  | "outcomes_learning";

// ---- Patient State (mirrors Python NovaCareState) ----
export interface PatientState {
  // Identity
  patient_abha_id: string;
  episode_id: string;
  hospital_id: string;

  // Discharge context
  discharge_date: string;
  diagnosis_codes: string[];
  medications: MedicationEntry[];
  care_plan_id: string;

  // Patient context
  language_pref: string;
  contact_channel: ContactChannel;
  rural_flag: boolean;
  comorbidity_count: number;

  // Daily state
  current_day: number;
  symptom_history: SymptomEntry[];
  med_adherence_streak: number;
  missed_contact_days: number;

  // Risk
  risk_score: number;
  risk_tier: RiskTier;
  shap_explanation: Record<string, number>;

  // Escalation
  active_escalation_id: string | null;
  escalation_tier: RiskTier | null;

  // Caregiver
  caregiver_ids: string[];

  // Outcomes (Day 30)
  readmission_detected: boolean | null;
  teleconsult_attended: boolean | null;
  final_adherence_rate: number | null;

  // Agent coordination
  last_agent: AgentId;
  next_scheduled_action: string;
  errors: string[];
}

// ---- Sub-types ----
export interface MedicationEntry {
  rxnorm_code: string;
  generic_name: string;
  brand_name: string;
  dosage: string;
  frequency: string;
  days_supply: number;
  jan_aushadhi_available: boolean;
}

export interface SymptomEntry {
  day: number;
  scores: number[];
  notes: string;
  timestamp: string;
  source: "patient" | "caregiver";
}

export interface RiskScore {
  score: number;
  tier: RiskTier;
  shap_explanation: Record<string, number>;
  explanation_text: string;
  computed_at: string;
}

// ---- Escalation ----
export interface Escalation {
  escalation_id: string;
  patient_abha_id: string;
  episode_id: string;
  tier: RiskTier;
  trigger_reason: string;
  shap_explanation: string;
  recommended_action: string;
  status: EscalationStatus;
  created_at: string;
  resolved_at: string | null;
  outcome: string | null;
}

// ---- Caregiver ----
export interface Caregiver {
  caregiver_id: string;
  patient_abha_id: string;
  name: string;
  phone: string;
  relationship: string;
  whatsapp_opt_in: boolean;
  language_pref: string;
  last_active_at: string;
}

// ---- EventBridge Events ----
export interface NovaCareEvent<T = unknown> {
  source: string;
  detail_type: string;
  detail: T;
  event_bus_name: string;
  time: string;
}

export interface CarePlanCreatedEvent {
  patient_abha_id: string;
  care_plan_id: string;
  episode_id: string;
  discharge_date: string;
  language: string;
  contact_channel: ContactChannel;
  hospital_id: string;
}

export interface DailyPulseResponseEvent {
  patient_abha_id: string;
  episode_id: string;
  day_number: number;
  symptom_scores: number[];
  med_taken: boolean;
  fhir_observation_ids: string[];
}

export interface RiskThresholdBreachedEvent {
  patient_abha_id: string;
  episode_id: string;
  risk_score: number;
  tier: RiskTier;
  shap_explanation: string;
  recommended_action: string;
}

export interface MedicationNonAdherenceEvent {
  patient_abha_id: string;
  episode_id: string;
  medication_rxnorm_codes: string[];
  missed_days_count: number;
  last_dispensing_date: string;
}

// ---- Agent Task Queue Messages ----
export interface AgentTask {
  task_id: string;
  task_type: AgentTaskType;
  patient_abha_id: string;
  episode_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  priority: number;
}

export type AgentTaskType =
  | "discharge_workflow"
  | "daily_pulse"
  | "risk_assessment"
  | "pharmacy_check"
  | "family_alert"
  | "outcomes_check";

export interface AgentTaskResult {
  task_id: string;
  task_type: AgentTaskType;
  patient_abha_id: string;
  status: "completed" | "failed" | "timeout";
  result: Record<string, unknown>;
  error?: string;
  completed_at: string;
  duration_ms: number;
}

// ---- API Responses ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Dashboard Analytics ----
export interface DashboardOverview {
  active_patients: number;
  risk_breakdown: {
    green: number;
    orange: number;
    red: number;
  };
  todays_escalations: number;
  pending_teleconsults: number;
  readmission_rate_30d: number;
  avg_adherence_rate: number;
  patients_completed_today: number;
}

export interface PatientListItem {
  abha_id: string;
  name: string;
  diagnosis: string;
  current_day: number;
  risk_score: number;
  risk_tier: RiskTier;
  last_contact: string;
  last_contact_channel: ContactChannel;
  next_action: string;
  med_adherence_streak: number;
}

// ---- FHIR Resources (simplified) ----
export interface FHIRResource {
  resourceType: string;
  id: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
  };
  [key: string]: unknown;
}

export interface FHIRBundle {
  resourceType: "Bundle";
  type: "collection" | "document" | "searchset";
  entry: Array<{
    resource: FHIRResource;
    fullUrl?: string;
  }>;
}

// ---- WhatsApp Message Types ----
export interface WhatsAppMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "text" | "template" | "interactive" | "image" | "document";
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: WhatsAppTemplateComponent[];
  };
  interactive?: WhatsAppInteractiveMessage;
}

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  parameters: Array<{
    type: "text" | "image" | "document";
    text?: string;
  }>;
}

export interface WhatsAppInteractiveMessage {
  type: "button" | "list";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{
      type: "reply";
      reply: { id: string; title: string };
    }>;
    button?: string;
    sections?: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

// ---- ABDM Types ----
export interface ABDMConsentRequest {
  purpose: { text: string; code: string };
  patient: { id: string }; // ABHA ID
  hip: { id: string };
  careContexts: Array<{ patientReference: string; careContextReference: string }>;
  permission: {
    accessMode: "VIEW" | "STORE" | "QUERY";
    dateRange: { from: string; to: string };
    frequency: { unit: "HOUR" | "DAY"; value: number; repeats: number };
  };
}

export interface ABDMWebhookPayload {
  requestId: string;
  timestamp: string;
  notification: {
    status: "GRANTED" | "DENIED" | "REVOKED";
    consentRequestId: string;
  };
  patient?: {
    id: string;
    display: string;
  };
  hiTypes?: string[];
  careContexts?: Array<{
    patientReference: string;
    careContextReference: string;
  }>;
}
