# ============================================================
# NovaCare v2.0 — State Validation with Pydantic
# Ensures state consistency between agent transitions
# ============================================================

from pydantic import BaseModel, Field, field_validator
from typing import Optional
import structlog

logger = structlog.get_logger(__name__)


class NovaCareStateValidator(BaseModel):
    """Pydantic model for validating NovaCareState between agent transitions."""
    
    # Identity (required)
    patient_abha_id: str = Field(..., min_length=1, max_length=100)
    episode_id: str = Field(..., min_length=1, max_length=100)
    hospital_id: str = Field(..., min_length=1, max_length=100)
    
    # Discharge Context
    discharge_date: str = Field(..., min_length=1)
    diagnosis_codes: list[str] = Field(default_factory=list)
    medications: list[dict] = Field(default_factory=list)
    care_plan_id: str = Field(default="")
    
    # Patient Context
    language_pref: str = Field(default="hi", pattern="^(hi|en|mr|ta|te|bn|kn|gu|ml|pa|or|as)$")
    contact_channel: str = Field(default="WHATSAPP", pattern="^(WHATSAPP|IVR|SMS)$")
    rural_flag: bool = Field(default=False)
    comorbidity_count: int = Field(default=0, ge=0, le=20)
    
    # Daily State
    current_day: int = Field(default=0, ge=0, le=60)
    symptom_history: list[dict] = Field(default_factory=list)
    med_adherence_streak: int = Field(default=0, ge=0, le=60)
    missed_contact_days: int = Field(default=0, ge=0, le=60)
    
    # Risk
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    risk_tier: str = Field(default="GREEN", pattern="^(GREEN|ORANGE|RED)$")
    shap_explanation: dict = Field(default_factory=dict)
    
    # Escalation
    active_escalation_id: Optional[str] = None
    escalation_tier: Optional[str] = None
    
    # Caregiver
    caregiver_ids: list[str] = Field(default_factory=list)
    
    # Outcomes
    readmission_detected: Optional[bool] = None
    teleconsult_attended: Optional[bool] = None
    final_adherence_rate: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    
    # Agent coordination
    last_agent: str = Field(default="")
    next_scheduled_action: str = Field(default="")
    errors: list[str] = Field(default_factory=list)
    
    @field_validator('symptom_history')
    @classmethod
    def validate_symptom_history(cls, v):
        """Validate symptom history structure."""
        for entry in v:
            if not isinstance(entry, dict):
                raise ValueError("Each symptom history entry must be a dict")
            if 'day' not in entry:
                raise ValueError("Symptom history entry must have 'day' field")
        return v
    
    @field_validator('medications')
    @classmethod
    def validate_medications(cls, v):
        """Validate medications structure."""
        for med in v:
            if not isinstance(med, dict):
                raise ValueError("Each medication must be a dict")
        return v
    
    class Config:
        """Pydantic config."""
        str_strip_whitespace = True
        validate_assignment = True


def validate_state(state: dict, agent_name: str) -> tuple[bool, list[str]]:
    """
    Validate state dictionary against schema.
    
    Args:
        state: State dictionary to validate
        agent_name: Name of agent performing validation
    
    Returns:
        (is_valid, errors): Tuple of validation result and error messages
    """
    try:
        NovaCareStateValidator(**state)
        logger.info("state_validation_passed", agent=agent_name)
        return True, []
    except Exception as e:
        errors = [str(e)]
        logger.error("state_validation_failed", agent=agent_name, errors=errors)
        return False, errors


def validate_state_transition(
    old_state: dict,
    new_state: dict,
    agent_name: str,
) -> tuple[bool, list[str]]:
    """
    Validate state transition between agents.
    
    Checks:
    - New state is valid
    - Required fields haven't been removed
    - Day counter only increments (no time travel)
    - Risk score is within bounds
    
    Args:
        old_state: State before agent execution
        new_state: State after agent execution
        agent_name: Name of agent that performed transition
    
    Returns:
        (is_valid, errors): Tuple of validation result and error messages
    """
    errors = []
    
    # Validate new state schema
    is_valid, schema_errors = validate_state(new_state, agent_name)
    if not is_valid:
        return False, schema_errors
    
    # Check identity fields haven't changed
    identity_fields = ['patient_abha_id', 'episode_id', 'hospital_id']
    for field in identity_fields:
        if old_state.get(field) != new_state.get(field):
            errors.append(f"Identity field '{field}' cannot be modified")
    
    # Check day counter only increments
    old_day = old_state.get('current_day', 0)
    new_day = new_state.get('current_day', 0)
    if new_day < old_day:
        errors.append(f"Day counter cannot go backwards: {old_day} -> {new_day}")
    
    # Check risk score bounds
    risk_score = new_state.get('risk_score', 0.0)
    if not (0.0 <= risk_score <= 1.0):
        errors.append(f"Risk score out of bounds: {risk_score}")
    
    # Check risk tier matches score
    risk_tier = new_state.get('risk_tier', 'GREEN')
    if risk_score >= 0.75 and risk_tier != 'RED':
        errors.append(f"Risk tier mismatch: score={risk_score}, tier={risk_tier}")
    elif 0.4 <= risk_score < 0.75 and risk_tier != 'ORANGE':
        errors.append(f"Risk tier mismatch: score={risk_score}, tier={risk_tier}")
    elif risk_score < 0.4 and risk_tier != 'GREEN':
        errors.append(f"Risk tier mismatch: score={risk_score}, tier={risk_tier}")
    
    if errors:
        logger.error(
            "state_transition_validation_failed",
            agent=agent_name,
            errors=errors,
        )
        return False, errors
    
    logger.info("state_transition_validated", agent=agent_name)
    return True, []
