# ============================================================
# NovaCare v2.0 — Python Agent Service (FastAPI)
# Thin HTTP API for sync calls + health checks
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import structlog

from novacare.core.config import get_settings
from novacare.core.dynamo import get_patient_state
from novacare.integrations.bedrock_client import translate_text, invoke_claude
from novacare.ml.feature_engineer import build_feature_vector
from novacare.ml.risk_model import predict_risk

logger = structlog.get_logger(__name__)
settings = get_settings()

app = FastAPI(
    title="NovaCare Agent Service",
    description="AI Agent Service for NovaCare v2.0 Post-Discharge Care Platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Health Check ----

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "novacare-agents",
        "version": "2.0.0",
        "agents": {
            "discharge_architect": True,
            "daily_pulse": True,
            "risk_orchestrator": True,
            "pharmacy_bridge": True,
            "family_network": True,
            "outcomes_learning": True,
        },
        "model_version": "v2.0.0-demo",
    }


# ---- Sync Endpoints (called by TS backend via HTTP) ----

@app.get("/api/risk/{abha_id}")
async def get_risk_score(abha_id: str):
    """Get current risk score for a patient (sync call from TS backend)."""
    state = await get_patient_state(abha_id)
    if not state:
        raise HTTPException(status_code=404, detail="Patient state not found")

    features = build_feature_vector(state)
    score, shap_values = predict_risk(features)

    tier = "RED" if score > 0.75 else "ORANGE" if score > 0.4 else "GREEN"

    return {
        "score": score,
        "tier": tier,
        "shap_explanation": shap_values,
        "explanation_text": f"Risk score {score:.2f} ({tier})",
        "computed_at": __import__("datetime").datetime.utcnow().isoformat(),
    }


class TranslateRequest(BaseModel):
    text: str
    target_language: str
    context: str = "medical"


@app.post("/api/translate")
async def translate(req: TranslateRequest):
    """Translate text using Bedrock Claude (sync call from TS backend)."""
    translated = await translate_text(req.text, req.target_language, req.context)
    return {"translated_text": translated}


class ParseFHIRRequest(BaseModel):
    fhir_bundle: dict


@app.post("/api/parse-fhir")
async def parse_fhir(req: ParseFHIRRequest):
    """Parse FHIR discharge summary and extract structured data."""
    bundle = req.fhir_bundle

    # Extract from FHIR bundle structure
    diagnosis_codes = []
    medications = []
    follow_up_labs = []

    entries = bundle.get("entry", [])
    for entry in entries:
        resource = entry.get("resource", {})
        resource_type = resource.get("resourceType", "")

        if resource_type == "Condition":
            code = resource.get("code", {}).get("coding", [{}])[0].get("code", "")
            if code:
                diagnosis_codes.append(code)

        elif resource_type == "MedicationRequest":
            med = resource.get("medicationCodeableConcept", {})
            medications.append({
                "rxnorm_code": med.get("coding", [{}])[0].get("code", ""),
                "generic_name": med.get("text", "Unknown"),
                "dosage": resource.get("dosageInstruction", [{}])[0].get("text", ""),
            })

        elif resource_type == "ServiceRequest":
            follow_up_labs.append(
                resource.get("code", {}).get("text", "Lab test")
            )

    return {
        "diagnosis_codes": diagnosis_codes,
        "medications": medications,
        "follow_up_labs": follow_up_labs,
        "dietary_restrictions": [],
    }


# ---- Agent Invocation Endpoint (for direct testing) ----

class AgentInvokeRequest(BaseModel):
    agent_name: str
    patient_abha_id: str
    payload: dict = {}


@app.post("/api/invoke-agent")
async def invoke_agent(req: AgentInvokeRequest):
    """Directly invoke an agent (for testing/demo purposes)."""
    from novacare.orchestrator.graph import novacare_graph

    state = await get_patient_state(req.patient_abha_id)
    if not state:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Run graph from specified agent
    try:
        result = await novacare_graph.ainvoke(state)
        return {"status": "completed", "result": dict(result)}
    except Exception as e:
        logger.error("agent_invoke_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
