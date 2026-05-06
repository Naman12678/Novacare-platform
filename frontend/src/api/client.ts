// ============================================================
// NovaCare v2.0 — Frontend API Client
// Centralized API calls to backend with auth and error handling
// ============================================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ---- Types ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

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
  risk_tier: 'GREEN' | 'ORANGE' | 'RED';
  last_contact: string;
  last_contact_channel: string;
  next_action: string;
  med_adherence_streak: number;
}

export interface Escalation {
  escalation_id: string;
  patient_abha_id: string;
  patient_name?: string;
  episode_id: string;
  tier: 'GREEN' | 'ORANGE' | 'RED';
  trigger_reason: string;
  shap_explanation: string;
  recommended_action: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  outcome: string | null;
}

export interface AnalyticsTrend {
  report_date: string;
  active_patients: number;
  readmission_rate: number;
  avg_risk_score: number;
  avg_adherence_rate: number;
  escalations_green: number;
  escalations_orange: number;
  escalations_red: number;
  teleconsults_booked: number;
  teleconsults_attended: number;
}

// ---- Auth Token Management ----
export function getToken(): string | null {
  return localStorage.getItem('novacare_token');
}

export function setToken(token: string): void {
  localStorage.setItem('novacare_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('novacare_token');
}

// ---- HTTP Client ----
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API call failed:', endpoint, error);
    throw error;
  }
}

// ---- Auth API ----
export async function login(email: string, password: string): Promise<{
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    hospital: { id: string; name: string };
  };
}> {
  const response = await apiCall<{
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      hospital: { id: string; name: string };
    };
  }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (response.data) {
    setToken(response.data.token);
  }

  return response.data!;
}

export function logout(): void {
  clearToken();
}

// ---- Dashboard API ----
export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const response = await apiCall<DashboardOverview>('/api/v1/dashboard/overview');
  return response.data!;
}

export async function fetchPatients(
  page: number = 1,
  pageSize: number = 50
): Promise<{
  patients: PatientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const response = await apiCall<PatientListItem[]>(
    `/api/v1/dashboard/patients?page=${page}&pageSize=${pageSize}`
  );
  
  return {
    patients: response.data || [],
    total: (response as any).total || 0,
    page: (response as any).page || 1,
    pageSize: (response as any).pageSize || 50,
    totalPages: (response as any).totalPages || 1,
  };
}

export async function fetchPatientDetails(abhaId: string): Promise<{
  patient: any;
  state: any;
  events: any[];
}> {
  const response = await apiCall<{
    patient: any;
    state: any;
    events: any[];
  }>(`/api/v1/dashboard/patient/${abhaId}`);
  return response.data!;
}

// ---- Escalations API ----
export async function fetchEscalations(): Promise<Escalation[]> {
  const response = await apiCall<Escalation[]>('/api/v1/escalations');
  return response.data || [];
}

export async function resolveEscalation(
  escalationId: string,
  outcome: string
): Promise<void> {
  await apiCall(`/api/v1/escalations/${escalationId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  });
}

// ---- Analytics API ----
export async function fetchAnalyticsTrend(days: number = 30): Promise<AnalyticsTrend[]> {
  const response = await apiCall<AnalyticsTrend[]>(
    `/api/v1/analytics/trend?days=${days}`
  );
  return response.data || [];
}

// ---- Agent Control API ----
export async function triggerDailyPulse(abhaId: string): Promise<{ jobId: string }> {
  const response = await apiCall<{ jobId: string }>('/api/v1/agents/trigger-pulse', {
    method: 'POST',
    body: JSON.stringify({ abhaId }),
  });
  return response.data!;
}

export async function triggerIVRCall(abhaId: string): Promise<{ callSid: string | null }> {
  const response = await apiCall<{ callSid: string | null }>('/api/v1/agents/trigger-ivr', {
    method: 'POST',
    body: JSON.stringify({ abhaId }),
  });
  return response.data!;
}

export async function getAgentTaskStatus(jobId: string): Promise<any> {
  const response = await apiCall(`/api/v1/agents/task/${jobId}`);
  return response.data;
}

export async function getAgentServiceHealth(): Promise<any> {
  const response = await apiCall('/api/v1/agents/health');
  return response.data;
}

// ---- Patient API ----
export async function registerPatient(data: {
  abhaId: string;
  name: string;
  dateOfBirth: string;
  gender: string;
  pincode: string;
  languagePref: string;
  contactPhone: string;
  hospitalId: string;
  caregiverPhone?: string;
  caregiverName?: string;
  caregiverRelationship?: string;
}): Promise<{ episodeId: string; jobId: string }> {
  const response = await apiCall<{ episodeId: string; jobId: string }>(
    '/api/v1/patients/register',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return response.data!;
}

export async function submitPulseResponse(
  abhaId: string,
  data: {
    feelingScore: number;
    medTaken: boolean;
    freeText?: string;
  }
): Promise<void> {
  await apiCall(`/api/v1/patients/${abhaId}/pulse`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
