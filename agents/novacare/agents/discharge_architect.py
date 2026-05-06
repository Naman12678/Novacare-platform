# ============================================================
# NovaCare v2.0 — Agent 1: Discharge Architect
# Parses FHIR discharge summary, generates vernacular care plan
# ============================================================

import json
import structlog
from novacare.orchestrator.state import NovaCareState
from novacare.integrations.bedrock_client import invoke_claude, translate_text
from novacare.core.dynamo import append_event

logger = structlog.get_logger(__name__)

CARE_PLAN_SYSTEM_PROMPT = """You are a clinical care plan generator for post-discharge patients in India.
Given a FHIR discharge summary, generate a structured 30-day care plan including:
1. Daily medication schedule with dosage and timing
2. Dietary restrictions and recommendations
3. Activity and exercise guidelines
4. Warning signs that require immediate medical attention
5. Follow-up appointment schedule
6. Lab tests to be completed during the 30-day period

Output as JSON with keys: medications, diet, activity, warning_signs, follow_ups, lab_tests.
Use simple, patient-friendly language. The patient may have limited health literacy."""


async def discharge_architect_node(state: NovaCareState) -> NovaCareState:
    """Agent 1: Parse FHIR discharge summary and generate vernacular care plan."""
    logger.info("agent1_started", abha_id=state["patient_abha_id"])

    try:
        # 1. Parse diagnosis codes and medications from FHIR
        diagnosis_codes = state.get("diagnosis_codes", [])
        medications = state.get("medications", [])

        # 2. Generate care plan via Claude
        fhir_context = json.dumps({
            "diagnoses": diagnosis_codes,
            "medications": medications,
            "comorbidity_count": state.get("comorbidity_count", 0),
            "patient_age_context": "elderly" if state.get("rural_flag") else "adult",
        })

        care_plan_text = await invoke_claude(
            system_prompt=CARE_PLAN_SYSTEM_PROMPT,
            user_message=f"Generate a 30-day care plan for a patient with the following clinical context:\n{fhir_context}",
            max_tokens=3000,
        )

        # 3. Translate care plan to patient's preferred language
        language = state.get("language_pref", "hi")
        if language != "en":
            translated_plan = await translate_text(care_plan_text, language, context="medical care plan")
        else:
            translated_plan = care_plan_text

        # 4. Compute initial risk profile
        comorbidity_count = state.get("comorbidity_count", 0)
        poly_pharmacy = len(medications) > 5
        initial_risk = min(0.3 + (comorbidity_count * 0.05) + (0.1 if poly_pharmacy else 0), 0.5)

        # 5. Log event
        await append_event(
            state["patient_abha_id"],
            "CARE_PLAN_CREATED",
            "discharge_architect",
            {
                "care_plan_length": len(care_plan_text),
                "language": language,
                "initial_risk": initial_risk,
                "medications_count": len(medications),
            },
        )

        logger.info(
            "agent1_completed",
            abha_id=state["patient_abha_id"],
            language=language,
            initial_risk=initial_risk,
        )

        return {
            **state,
            "care_plan_id": f"cp-{state['episode_id'][:8]}",
            "risk_score": initial_risk,
            "risk_tier": "GREEN" if initial_risk < 0.4 else "ORANGE",
            "last_agent": "discharge_architect",
            "current_day": 0,
        }

    except Exception as e:
        logger.error("agent1_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent1: {str(e)}"]}
