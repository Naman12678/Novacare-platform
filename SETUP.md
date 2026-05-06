# NovaCare v2.0 — Complete Setup Guide

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.12+ (for local development)

### Option 1: Docker Compose (Recommended for Demo)

```bash
# 1. Clone and navigate
cd novacare-v2

# 2. Copy environment files
cp backend/.env.example backend/.env
cp agents/.env.example agents/.env

# 3. Start all services
docker compose up --build

# 4. Wait for services to be healthy (~2 minutes)
# Backend: http://localhost:8000
# Agents: http://localhost:8100
# Frontend: http://localhost:5173

# 5. Initialize database
docker compose exec backend npm run db:push
docker compose exec backend npm run db:seed

# 6. Initialize LocalStack (DynamoDB table)
docker compose exec localstack awslocal dynamodb create-table \
  --table-name novacare_patient_state \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

# 7. Run demo scenario
docker compose exec agents python demo/run_demo_scenario.py cardiac
```

### Option 2: Local Development

```bash
# Terminal 1: Backend API
cd backend
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev

# Terminal 2: Python Agent Service
cd agents
pip install -e ".[dev]"
cp .env.example .env
uvicorn novacare.api:app --port 8100 --reload

# Terminal 3: Python Worker (consumes BullMQ jobs)
cd agents
python -m novacare.worker

# Terminal 4: Frontend Dashboard
cd frontend
npm install
npm run dev

# Terminal 5: Supporting services
docker compose up redis postgres localstack
```

## 📁 Project Structure

```
novacare-v2/
├── backend/              # TypeScript API (Express + Prisma + BullMQ)
│   ├── src/
│   │   ├── routes/       # REST API endpoints
│   │   ├── services/     # Business logic
│   │   ├── queues/       # BullMQ job dispatchers
│   │   ├── integrations/ # External API clients
│   │   └── middleware/   # Auth, error handling
│   ├── prisma/           # Database schema + seed
│   └── package.json
│
├── agents/               # Python AI Agents (LangGraph + Bedrock)
│   ├── novacare/
│   │   ├── agents/       # 6 specialized agents
│   │   ├── orchestrator/ # LangGraph workflow
│   │   ├── ml/           # Risk model + feature engineering
│   │   ├── integrations/ # Bedrock, ABDM, UHI clients
│   │   └── core/         # Config, DynamoDB ops
│   ├── api.py            # FastAPI HTTP endpoints
│   ├── worker.py         # BullMQ consumer
│   └── pyproject.toml
│
├── frontend/             # React Dashboard (Vite + TypeScript)
│   ├── src/
│   │   ├── pages/        # Dashboard, Patients, Escalations, Analytics
│   │   └── App.tsx
│   └── package.json
│
├── infrastructure/       # AWS CDK (Python)
│   └── novacare/         # CDK stacks for production deployment
│
├── demo/                 # Hackathon demo scenarios
│   └── run_demo_scenario.py
│
└── docker-compose.yml    # Local development environment
```

## 🎯 Running the Hackathon Demo

The demo simulates a complete 30-day patient journey in ~30 seconds:

```bash
# Cardiac patient (62-year-old, Marathi, post-heart-failure)
python demo/run_demo_scenario.py cardiac

# Expected output:
# ✅ Day 0: Discharge event → Care plan generated in Marathi
# ✅ Day 1-3: Daily check-ins → Patient responding, meds taken
# ⚠️  Day 12: Risk escalation → ORANGE tier, family alert sent
# 💊 Day 14: Pharmacy refill → Jan Aushadhi location sent
# ✅ Day 30: Outcomes → No readmission, 82% adherence, 333x ROI
```

## 🏥 Accessing the Dashboard

1. Open http://localhost:5173
2. Default login: `admin@rubyhall.com` / `demo123`
3. Navigate through:
   - **Dashboard**: Real-time risk heatmap, ROI calculator
   - **Patients**: Active patient list with risk scores
   - **Escalations**: ORANGE/RED tier patients requiring attention
   - **Analytics**: 30-day readmission trends, adherence rates

## 🔧 Configuration

### AWS Bedrock (Required for Production)

```bash
# In agents/.env
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_NOVA_MODEL_ID=amazon.nova-micro-v1:0
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### WhatsApp Business API (Optional)

```bash
# In backend/.env
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
```

### ABDM Integration (Optional)

```bash
# In backend/.env
ABDM_CLIENT_ID=your_client_id
ABDM_CLIENT_SECRET=your_client_secret
ABDM_HIP_ID=your_hip_id
```

## 🧪 Testing

```bash
# Backend tests
cd backend
npm run typecheck
npm run lint

# Agent tests
cd agents
pytest tests/

# Integration test
curl http://localhost:8000/health
curl http://localhost:8100/health
```

## 📊 Key Features Implemented

### ✅ 6 AI Agents (LangGraph + Bedrock)
1. **Discharge Architect**: FHIR parsing, vernacular care plan generation
2. **Daily Pulse**: Adaptive check-ins, NLP extraction
3. **Risk Orchestrator**: LightGBM scoring, SHAP explanations, tiered escalation
4. **Pharmacy Bridge**: Jan Aushadhi integration, UHI lab booking
5. **Family Network**: Caregiver coordination, weekly reports
6. **Outcomes & Learning**: Day 30 outcomes, model retraining

### ✅ Production-Grade Architecture
- **Event-sourced**: All actions logged in DynamoDB + Kinesis
- **Stateful workflows**: LangGraph with DynamoDB checkpointing
- **Async processing**: BullMQ for long-running agent tasks
- **Multi-modal fallback**: WhatsApp → IVR → SMS → Family
- **FHIR R4 compliant**: All clinical data follows ABDM standards

### ✅ India Stack Native
- **ABDM**: Discharge webhooks, FHIR resource exchange
- **UHI**: Teleconsult + lab appointment booking
- **eSanjeevani**: Government teleconsult integration
- **Jan Aushadhi**: Pharmacy locator + refill automation

### ✅ ML Pipeline
- **LightGBM**: Risk scoring with warm-start on MIMIC-III
- **SHAP**: Explainable AI for every escalation
- **SageMaker**: A/B testing, canary deployment
- **Feature Store**: Real-time feature retrieval (<10ms)

## 🚢 Production Deployment (AWS CDK)

```bash
cd infrastructure
pip install -r requirements.txt

# Deploy to AWS
cdk bootstrap aws://ACCOUNT-ID/ap-south-1
cdk deploy --all

# This creates:
# - ECS Fargate (backend + agents)
# - DynamoDB (patient state)
# - Aurora PostgreSQL (FHIR + analytics)
# - SageMaker (risk model endpoint)
# - EventBridge (agent coordination)
# - S3 + CloudFront (frontend)
```

## 📈 Monitoring

- **CloudWatch Logs**: All agent actions logged
- **X-Ray**: Distributed tracing
- **Custom Metrics**: Risk score distribution, escalation rates
- **QuickSight**: Hospital analytics dashboard

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Docker resources
docker system prune -a
docker compose down -v
docker compose up --build
```

### DynamoDB table not found
```bash
# Recreate table in LocalStack
docker compose exec localstack awslocal dynamodb delete-table --table-name novacare_patient_state
docker compose exec localstack awslocal dynamodb create-table \
  --table-name novacare_patient_state \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

### Prisma database out of sync
```bash
cd backend
npm run db:push
npm run db:seed
```

### Agent service not responding
```bash
# Check logs
docker compose logs agents

# Restart
docker compose restart agents
```

## 📞 Support

- **Team**: AvengersJIS
- **Hackathon**: Cognizant Technoverse 2026
- **Documentation**: See `NovaCare-v2-Complete-Technical-Architecture.docx`

## 🎉 Demo Checklist for Judges

- [ ] All services running (`docker compose ps`)
- [ ] Frontend accessible at http://localhost:5173
- [ ] Demo scenario runs successfully
- [ ] Dashboard shows real-time risk heatmap
- [ ] Patient timeline displays 30-day journey
- [ ] ROI calculator shows 333x return
- [ ] SHAP explanations visible in escalation queue
- [ ] Bedrock integration working (or mock fallback)

---

**Built for India. Powered by AI. Delivered at ₹120.**
