# ============================================================
# NovaCare v2.0 — Agent 3: Risk Orchestrator & Escalation Engine
# LightGBM risk scoring with SHAP + tiered escalation
# ============================================================

import structlog
from novacare.orchestrator.state import NovaCareState
from novacare.integrations.bedrock_client import invoke_claude
from novacare.ml.feature_engineer import build_feature_vector
from novacare.ml.risk_model import predict_risk
from novacare.core.dynamo import append_event, update_patient_state

logger = structlog.get_logger(__name__)

ESCALATION_THRESHOLDS = {
    "GREEN": (0.0, 0.4),
    "ORANGE": (0.4, 0.75),
    "RED": (0.75, 1.0),
}


async def risk_orchestrator_node(state: NovaCareState) -> NovaCareState:
    """Agent 3: Compute risk score, generate SHAP explanation, trigger escalation."""
    logger.info("agent3_started", abha_id=state["patient_abha_id"])

    try:
        # 1. Build feature vector from current state
        features = build_feature_vector(state)

        # 2. Run LightGBM inference
        risk_score, shap_values = predict_risk(features)

        # 3. Determine risk tier
        if risk_score > 0.75:
            risk_tier = "RED"
        elif risk_score > 0.4:
            risk_tier = "ORANGE"
        else:
            risk_tier = "GREEN"

        # 4. Generate SHAP explanation for actionable alerts
        shap_explanation = {}
        explanation_text = ""

        if risk_score >= 0.4:
            # Get top contributing features
            top_features = sorted(shap_values.items(), key=lambda x: abs(x[1]), reverse=True)[:5]
            shap_explanation = dict(top_features)

            # Generate human-readable explanation via Claude
            explanation_text = await invoke_claude(
                system_prompt=(
                    "You are a clinical risk explainer. Generate a concise, "
                    "non-alarming 2-sentence explanation of why a patient's "
                    "readmission risk has increased. Use simple language."
                ),
                user_message=(
                    f"Risk score: {risk_score:.2f} ({risk_tier}). "
                    f"Top risk factors: {shap_explanation}. "
                    f"Patient language: {state.get('language_pref', 'en')}. "
                    f"Day {state.get('current_day', 0)} post-discharge."
                ),
                max_tokens=200,
            )

        # 5. Log escalation event if threshold breached
        if risk_tier in ("ORANGE", "RED"):
            await append_event(
                state["patient_abha_id"],
                "RISK_THRESHOLD_BREACHED",
                "risk_orchestrator",
                {
                    "risk_score": risk_score,
                    "tier": risk_tier,
                    "shap_explanation": shap_explanation,
                    "explanation_text": explanation_text,
                },
            )

        # 6. Update DynamoDB
        await update_patient_state(state["patient_abha_id"], {
            "risk_score": str(risk_score),  # DynamoDB number
            "risk_tier": risk_tier,
            "shap_explanation": shap_explanation,
        })

        logger.info(
            "agent3_completed",
            abha_id=state["patient_abha_id"],
            risk_score=risk_score,
            tier=risk_tier,
        )

        return {
            **state,
            "risk_score": risk_score,
            "risk_tier": risk_tier,
            "shap_explanation": shap_explanation,
            "last_agent": "risk_orchestrator",
        }

    except Exception as e:
        logger.error("agent3_failed", error=str(e), abha_id=state["patient_abha_id"])
        return {**state, "errors": state.get("errors", []) + [f"Agent3: {str(e)}"]}
