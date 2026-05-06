# ============================================================
# NovaCare v2.0 — Feature Engineering
# Build feature vectors from patient state for risk model
# ============================================================

import numpy as np
from novacare.orchestrator.state import NovaCareState


def build_feature_vector(state: NovaCareState) -> dict:
    """
    Build feature vector from patient state for risk model inference.
    
    Features:
    - age_bucket: 0-3 (40-50, 50-60, 60-70, 70+)
    - comorbidity_count: 0-5+
    - poly_pharmacy: 0/1 (>5 medications)
    - rural_flag: 0/1
    - current_day: 1-30
    - symptom_trend_slope: -1 to 1 (7-day rolling)
    - med_adherence_streak: 0-30
    - missed_contact_days: 0-30
    - diagnosis_severity: 0-3 (based on ICD-10 codes)
    """
    
    # Static features
    comorbidity_count = min(state.get("comorbidity_count", 0), 5)
    medications = state.get("medications", [])
    poly_pharmacy = 1 if len(medications) > 5 else 0
    rural_flag = 1 if state.get("rural_flag", False) else 0
    
    # Temporal features
    current_day = state.get("current_day", 1)
    med_adherence_streak = state.get("med_adherence_streak", 0)
    missed_contact_days = state.get("missed_contact_days", 0)
    
    # Symptom trend (7-day rolling slope)
    symptom_history = state.get("symptom_history", [])
    symptom_trend_slope = _calculate_symptom_slope(symptom_history)
    
    # Diagnosis severity (simplified)
    diagnosis_codes = state.get("diagnosis_codes", [])
    diagnosis_severity = _calculate_diagnosis_severity(diagnosis_codes)
    
    # Age bucket (mock - in real system, calculate from DOB)
    age_bucket = 2  # Assume 60-70 for demo
    
    features = {
        "age_bucket": age_bucket,
        "comorbidity_count": comorbidity_count,
        "poly_pharmacy": poly_pharmacy,
        "rural_flag": rural_flag,
        "current_day": current_day,
        "symptom_trend_slope": symptom_trend_slope,
        "med_adherence_streak": med_adherence_streak,
        "missed_contact_days": missed_contact_days,
        "diagnosis_severity": diagnosis_severity,
    }
    
    return features


def _calculate_symptom_slope(history: list) -> float:
    """Calculate 7-day symptom trend slope."""
    if len(history) < 2:
        return 0.0
    
    recent = history[-7:]  # Last 7 days
    scores = [np.mean(day.get("scores", [3])) for day in recent]
    
    if len(scores) < 2:
        return 0.0
    
    # Simple linear regression slope
    x = np.arange(len(scores))
    slope = np.polyfit(x, scores, 1)[0]
    
    # Normalize to -1 to 1
    return np.clip(slope, -1, 1)


def _calculate_diagnosis_severity(codes: list[str]) -> int:
    """
    Calculate diagnosis severity from ICD-10 codes.
    0 = low, 1 = moderate, 2 = high, 3 = critical
    """
    # Simplified severity mapping
    high_severity_prefixes = ["I50", "I21", "I63", "J44", "N18"]  # HF, MI, Stroke, COPD, CKD
    
    for code in codes:
        for prefix in high_severity_prefixes:
            if code.startswith(prefix):
                return 3
    
    return 1 if len(codes) > 0 else 0
