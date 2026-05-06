# ============================================================
# NovaCare v2.0 — LangGraph State Schema
# Shared TypedDict flowing through all 6 agents
# ============================================================

from typing import TypedDict


class NovaCareState(TypedDict):
    """Shared state object flowing through all 6 LangGraph agents."""

    # Identity
    patient_abha_id: str
    episode_id: str
    hospital_id: str

    # Discharge Context
    discharge_date: str
    diagnosis_codes: list[str]
    medications: list[dict]
    care_plan_id: str

    # Patient Context
    language_pref: str
    contact_channel: str   # WHATSAPP | IVR | SMS
    rural_flag: bool
    comorbidity_count: int

    # Daily State
    current_day: int
    symptom_history: list[dict]
    med_adherence_streak: int
    missed_contact_days: int

    # Risk
    risk_score: float
    risk_tier: str           # GREEN | ORANGE | RED
    shap_explanation: dict

    # Escalation
    active_escalation_id: str | None
    escalation_tier: str | None

    # Caregiver
    caregiver_ids: list[str]

    # Outcomes (Day 30)
    readmission_detected: bool | None
    teleconsult_attended: bool | None
    final_adherence_rate: float | None

    # Agent coordination
    last_agent: str
    next_scheduled_action: str
    errors: list[str]
