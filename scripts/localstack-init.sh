#!/bin/bash
# ============================================================
# LocalStack Initialization — Creates AWS resources for local dev
# ============================================================

set -e

echo "Initializing LocalStack AWS resources..."

# Wait for LocalStack to be ready
sleep 2

# Create DynamoDB table (novacare_patient_state)
awslocal dynamodb create-table \
  --table-name novacare_patient_state \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=hospital_id,AttributeType=S \
    AttributeName=discharge_date,AttributeType=S \
    AttributeName=risk_tier,AttributeType=S \
    AttributeName=risk_score,AttributeType=N \
    AttributeName=escalation_status,AttributeType=S \
    AttributeName=escalation_created_at,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"hospital_active_patients_index","KeySchema":[{"AttributeName":"hospital_id","KeyType":"HASH"},{"AttributeName":"discharge_date","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"risk_score_index","KeySchema":[{"AttributeName":"risk_tier","KeyType":"HASH"},{"AttributeName":"risk_score","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"escalation_pending_index","KeySchema":[{"AttributeName":"escalation_status","KeyType":"HASH"},{"AttributeName":"escalation_created_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1 || echo "DynamoDB table already exists"

# Create S3 buckets
awslocal s3 mb s3://novacare-model-artifacts --region us-east-1 2>/dev/null || true
awslocal s3 mb s3://novacare-training-data --region us-east-1 2>/dev/null || true
awslocal s3 mb s3://novacare-fhir-archive --region us-east-1 2>/dev/null || true
awslocal s3 mb s3://novacare-patient-documents --region us-east-1 2>/dev/null || true

# Create EventBridge event bus
awslocal events create-event-bus --name novacare-events --region us-east-1 2>/dev/null || true

# Create SQS queues (used as dead-letter queues)
awslocal sqs create-queue --queue-name novacare-agent-dlq --region us-east-1 2>/dev/null || true

# Seed initial DynamoDB state for demo patient
awslocal dynamodb put-item \
  --table-name novacare_patient_state \
  --item '{
    "pk": {"S": "PATIENT#demo-patient-001"},
    "sk": {"S": "STATE#CURRENT"},
    "patient_abha_id": {"S": "demo-patient-001"},
    "episode_id": {"S": "demo-episode-001"},
    "hospital_id": {"S": "demo-hospital-001"},
    "discharge_date": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "diagnosis_codes": {"L": [{"S": "I21.9"}]},
    "medications": {"L": [{"M": {"generic_name": {"S": "Aspirin"}, "dosage": {"S": "75mg"}, "time": {"S": "Morning"}, "rxnorm_code": {"S": "1191"}}}, {"M": {"generic_name": {"S": "Atorvastatin"}, "dosage": {"S": "40mg"}, "time": {"S": "Night"}, "rxnorm_code": {"S": "83367"}}}, {"M": {"generic_name": {"S": "Metoprolol"}, "dosage": {"S": "50mg"}, "time": {"S": "Morning"}, "rxnorm_code": {"S": "6918"}}}]},
    "care_plan_id": {"S": "cp-demo-001"},
    "language_pref": {"S": "en"},
    "contact_channel": {"S": "WHATSAPP"},
    "rural_flag": {"BOOL": false},
    "comorbidity_count": {"N": "2"},
    "current_day": {"N": "1"},
    "symptom_history": {"L": []},
    "med_adherence_streak": {"N": "0"},
    "missed_contact_days": {"N": "0"},
    "risk_score": {"N": "0.35"},
    "risk_tier": {"S": "GREEN"},
    "shap_explanation": {"M": {}},
    "caregiver_ids": {"L": [{"S": "demo-caregiver-001"}]},
    "last_agent": {"S": "discharge_architect"},
    "next_scheduled_action": {"S": ""},
    "errors": {"L": []},
    "version": {"N": "0"}
  }' \
  --region us-east-1 || echo "Demo patient state already exists"

echo "✅ LocalStack initialization complete!"
echo "  - DynamoDB table: novacare_patient_state (with 3 GSIs)"
echo "  - S3 buckets: model-artifacts, training-data, fhir-archive, patient-documents"
echo "  - EventBridge: novacare-events"
echo "  - SQS: novacare-agent-dlq"
echo "  - Demo patient state seeded"
