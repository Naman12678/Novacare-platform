# NovaCare v2.0 — Production Deployment Guide

## 🚀 AWS Production Deployment

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** configured with credentials
3. **AWS CDK** installed: `npm install -g aws-cdk`
4. **Python 3.12+** for CDK app
5. **Node.js 20+** for CDK dependencies

### Step 1: Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region (ap-south-1), Output format (json)

# Verify configuration
aws sts get-caller-identity
```

### Step 2: Set Environment Variables

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-south-1
export ENVIRONMENT=production
```

### Step 3: Bootstrap CDK

```bash
cd infrastructure

# Install dependencies
pip install -r requirements.txt

# Bootstrap CDK (one-time per account/region)
cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
```

### Step 4: Configure Production Secrets

```bash
# Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name novacare/prod/whatsapp \
  --secret-string '{"phone_number_id":"YOUR_PHONE_ID","access_token":"YOUR_TOKEN"}' \
  --region $AWS_REGION

aws secretsmanager create-secret \
  --name novacare/prod/abdm \
  --secret-string '{"client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_SECRET"}' \
  --region $AWS_REGION

aws secretsmanager create-secret \
  --name novacare/prod/exotel \
  --secret-string '{"api_key":"YOUR_KEY","api_token":"YOUR_TOKEN","sid":"YOUR_SID"}' \
  --region $AWS_REGION

aws secretsmanager create-secret \
  --name novacare/prod/jwt \
  --secret-string '{"secret":"GENERATE_STRONG_SECRET_HERE"}' \
  --region $AWS_REGION
```

### Step 5: Deploy Infrastructure

```bash
# Synthesize CloudFormation templates
cdk synth

# Review changes
cdk diff

# Deploy all stacks
cdk deploy --all --require-approval never

# Or deploy stacks individually
cdk deploy NovaCareNetworkStack
cdk deploy NovaCareDataStack
cdk deploy NovaCareComputeStack
cdk deploy NovaCareMLStack
cdk deploy NovaCareAPIStack
cdk deploy NovaCareFrontendStack
```

### Step 6: Post-Deployment Configuration

```bash
# Get stack outputs
aws cloudformation describe-stacks \
  --stack-name NovaCareComputeStack \
  --query 'Stacks[0].Outputs' \
  --region $AWS_REGION

# Note down:
# - API Gateway URL
# - CloudFront Distribution URL
# - DynamoDB Table Name
# - Aurora Cluster Endpoint
# - SageMaker Endpoint Name
```

### Step 7: Deploy ML Model

```bash
# Upload pre-trained model to S3
aws s3 cp agents/models/lightgbm_model.pkl \
  s3://novacare-model-artifacts-$AWS_ACCOUNT_ID/models/v2.0.0/model.pkl

# Create SageMaker model
aws sagemaker create-model \
  --model-name novacare-risk-model-v2 \
  --primary-container Image=<LIGHTGBM_IMAGE>,ModelDataUrl=s3://novacare-model-artifacts-$AWS_ACCOUNT_ID/models/v2.0.0/model.pkl \
  --execution-role-arn arn:aws:iam::$AWS_ACCOUNT_ID:role/NovaCare-SageMaker-Role

# Create endpoint configuration
aws sagemaker create-endpoint-config \
  --endpoint-config-name novacare-risk-model-config \
  --production-variants VariantName=AllTraffic,ModelName=novacare-risk-model-v2,InstanceType=ml.t3.medium,InitialInstanceCount=1

# Create endpoint
aws sagemaker create-endpoint \
  --endpoint-name novacare-risk-model \
  --endpoint-config-name novacare-risk-model-config
```

### Step 8: Initialize Database

```bash
# Get Aurora endpoint
AURORA_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier novacare-aurora-cluster \
  --query 'DBClusters[0].Endpoint' \
  --output text)

# Run Prisma migrations
cd backend
DATABASE_URL="postgresql://novacare:$DB_PASSWORD@$AURORA_ENDPOINT:5432/novacare_db" \
  npm run db:push

# Seed initial data
DATABASE_URL="postgresql://novacare:$DB_PASSWORD@$AURORA_ENDPOINT:5432/novacare_db" \
  npm run db:seed
```

### Step 9: Configure ABDM Webhooks

```bash
# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name NovaCareAPIStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Register webhook with ABDM
curl -X POST https://dev.abdm.gov.in/gateway/v1/bridges/addUpdateServices \
  -H "Authorization: Bearer $ABDM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "novacare-hip-001",
    "name": "NovaCare Post-Discharge Care",
    "type": "HIP",
    "active": true,
    "alias": ["novacare"],
    "endpoints": {
      "url": "'$API_URL'/webhook/abdm"
    }
  }'
```

### Step 10: Deploy Frontend

```bash
cd frontend

# Build production bundle
npm run build

# Upload to S3
aws s3 sync dist/ s3://novacare-frontend-$AWS_ACCOUNT_ID/ --delete

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name NovaCareFrontendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

## 🔍 Verification

### Health Checks

```bash
# Backend API
curl https://api.novacare.health/health

# Agent Service (internal)
# Check ECS task logs in CloudWatch

# Frontend
curl https://dashboard.novacare.health
```

### Smoke Tests

```bash
# Test discharge webhook
curl -X POST https://api.novacare.health/webhook/abdm/discharge \
  -H "Content-Type: application/json" \
  -d @test-data/discharge-event.json

# Test risk score API
curl https://api.novacare.health/api/v1/risk/72-1234-5678-9012

# Test translation API
curl -X POST https://api.novacare.health/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Take your medication","target_language":"hi"}'
```

## 📊 Monitoring

### CloudWatch Dashboards

```bash
# Create custom dashboard
aws cloudwatch put-dashboard \
  --dashboard-name NovaCare-Production \
  --dashboard-body file://infrastructure/dashboards/production.json
```

### Alarms

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name novacare-high-error-rate \
  --alarm-description "Alert when error rate > 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# High risk patient count alarm
aws cloudwatch put-metric-alarm \
  --alarm-name novacare-high-risk-patients \
  --alarm-description "Alert when RED tier patients > 10" \
  --metric-name RedTierPatients \
  --namespace NovaCare \
  --statistic Average \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      
      - name: Deploy CDK
        run: |
          cd infrastructure
          pip install -r requirements.txt
          cdk deploy --all --require-approval never
      
      - name: Deploy Frontend
        run: |
          cd frontend
          npm install
          npm run build
          aws s3 sync dist/ s3://novacare-frontend-${{ secrets.AWS_ACCOUNT_ID }}/
```

## 🔐 Security Hardening

### Enable WAF

```bash
# Create WAF Web ACL
aws wafv2 create-web-acl \
  --name novacare-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://infrastructure/waf-rules.json \
  --region $AWS_REGION

# Associate with API Gateway
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:$AWS_REGION:$AWS_ACCOUNT_ID:regional/webacl/novacare-waf \
  --resource-arn arn:aws:apigateway:$AWS_REGION::/restapis/$API_ID/stages/prod
```

### Enable GuardDuty

```bash
aws guardduty create-detector --enable --region $AWS_REGION
```

### Enable CloudTrail

```bash
aws cloudtrail create-trail \
  --name novacare-audit-trail \
  --s3-bucket-name novacare-audit-logs-$AWS_ACCOUNT_ID \
  --is-multi-region-trail \
  --enable-log-file-validation
```

## 💰 Cost Optimization

### Enable Auto-Scaling

```bash
# ECS Service Auto-Scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/novacare-cluster/backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/novacare-cluster/backend-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

### Enable Aurora Serverless v2 Auto-Pause

```bash
aws rds modify-db-cluster \
  --db-cluster-identifier novacare-aurora-cluster \
  --serverlessv2-scaling-configuration MinCapacity=0.5,MaxCapacity=4 \
  --enable-http-endpoint
```

## 🔄 Rollback Procedure

```bash
# Rollback CDK deployment
cdk deploy --rollback

# Rollback ECS service to previous task definition
aws ecs update-service \
  --cluster novacare-cluster \
  --service backend-service \
  --task-definition novacare-backend:PREVIOUS_VERSION

# Rollback frontend
aws s3 sync s3://novacare-frontend-backup/ s3://novacare-frontend-$AWS_ACCOUNT_ID/ --delete
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
```

## 📞 Support

For production issues:
- **CloudWatch Logs**: Check ECS task logs
- **X-Ray**: Trace distributed requests
- **AWS Support**: Open support ticket
- **Team**: team@avengersjis.dev

---

**Production Deployment Checklist:**
- [ ] AWS credentials configured
- [ ] Secrets stored in Secrets Manager
- [ ] CDK stacks deployed
- [ ] ML model deployed to SageMaker
- [ ] Database initialized and seeded
- [ ] ABDM webhooks registered
- [ ] Frontend deployed to CloudFront
- [ ] Health checks passing
- [ ] Monitoring dashboards created
- [ ] Alarms configured
- [ ] WAF enabled
- [ ] Auto-scaling configured
- [ ] Backup strategy in place
- [ ] Rollback procedure tested
