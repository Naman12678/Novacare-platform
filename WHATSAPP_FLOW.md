# NovaCare WhatsApp Patient-Initiated Flow

## Overview
NovaCare uses a **patient-initiated** WhatsApp flow where patients message "Hi" daily to receive their check-ins. This approach is **100% FREE** within Meta's 24-hour customer service window.

## Flow Architecture

### Day 0: Patient Onboarding
```
Hospital → Discharge → Patient receives QR code/link
Patient → Scans QR → WhatsApp opens with "START" pre-filled
Patient → Sends "START" → NovaCare receives webhook
NovaCare → Sends welcome message
```

### Day 1-30: Daily Check-ins
```
Patient → Messages "Hi" or "Good morning" → Opens 24h window
NovaCare → Sends daily check-in with interactive buttons
Patient → Clicks button (Better/Same/Worse)
NovaCare → Sends medication reminder
NovaCare → Logs to DynamoDB
NovaCare → Triggers Agent 2 (Daily Pulse) for analysis
```

### Escalation Flow
```
Patient → Clicks "Worse" button
NovaCare → Sends alert message
NovaCare → Triggers Agent 3 (Risk Orchestrator)
Agent 3 → Calculates risk score
Agent 3 → Escalates to doctor if needed
```

## Message Types

### 1. Welcome Message (Day 0)
- **Type**: Plain text
- **Trigger**: Patient sends "START" or "Hi" for first time
- **Cost**: FREE (within 24h window)

### 2. Daily Check-in
- **Type**: Interactive buttons
- **Buttons**: Better / Same / Worse
- **Trigger**: Patient messages daily
- **Cost**: FREE (within 24h window)

### 3. Medication Reminder
- **Type**: Interactive buttons
- **Buttons**: Yes / No
- **Trigger**: Sent 2 seconds after check-in
- **Cost**: FREE (within 24h window)

### 4. Escalation Alert
- **Type**: Plain text
- **Trigger**: Patient clicks "Worse"
- **Cost**: FREE (within 24h window)

## Cost Analysis

### Per Patient (30 days)
- **If patient messages daily**: ₹0 (100% FREE)
- **If patient misses 5 days**: ₹0.50 (5 × ₹0.10 utility template)
- **Average cost**: ₹0.20 per patient per month

### For 100 Patients
- **Best case**: ₹0 (all patients message daily)
- **Realistic**: ₹20 (average 1 missed day per patient)
- **Worst case**: ₹300 (10 missed days per patient)

## Technical Implementation

### Webhook Handler
- **Endpoint**: `/webhook/whatsapp`
- **Method**: POST
- **Verification**: GET with hub.challenge
- **Service**: `whatsapp-flow.service.ts`

### Database
- **Patient lookup**: PostgreSQL (Prisma)
- **Event logging**: DynamoDB
- **State management**: DynamoDB

### Agent Integration
- **Agent 2 (Daily Pulse)**: Analyzes patient responses
- **Agent 3 (Risk Orchestrator)**: Escalates high-risk patients
- **Agent 4 (Pharmacy Bridge)**: Medication refill alerts

## Setup Instructions

### 1. Meta Developer Account
- Create app at https://developers.facebook.com/
- Add WhatsApp product
- Get test phone number (free, 5 recipients)

### 2. Webhook Configuration
- **URL**: `https://your-domain.com/webhook/whatsapp`
- **Verify Token**: `novacare-webhook-verify-2026`
- **Subscribe to**: `messages`

### 3. Environment Variables
```bash
WHATSAPP_API_URL=https://graph.facebook.com/v25.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_token
WHATSAPP_VERIFY_TOKEN=novacare-webhook-verify-2026
```

### 4. Test
```bash
# Send "Hi" to test number from your WhatsApp
# You should receive daily check-in with buttons
```

## Production Considerations

### Scaling Beyond 5 Test Numbers
1. Verify business (1-3 days)
2. Add your own phone number
3. Add payment method
4. Messaging limits increase automatically:
   - Tier 1: 1,000/day
   - Tier 2: 10,000/day
   - Tier 3: 100,000/day

### Message Templates (Optional)
For proactive messages (when patient doesn't message first):
- Create templates in Meta dashboard
- Get approval (15 min - 24 hours)
- Use for Day 0 onboarding only

### Monitoring
- Check webhook logs: `docker-compose logs -f backend`
- Monitor DynamoDB events
- Track patient engagement rates

## Troubleshooting

### Patient Not Receiving Messages
1. Check if phone number is verified in Meta dashboard
2. Check webhook logs for errors
3. Verify backend is running: `docker-compose ps`
4. Check ngrok is running (for local testing)

### Messages Not Free
1. Ensure patient messages you first (opens 24h window)
2. Check message type (templates cost money, text is free)
3. Verify within 24h window

### Webhook Not Receiving
1. Check ngrok URL is correct
2. Verify token matches: `novacare-webhook-verify-2026`
3. Check "messages" is subscribed in Meta dashboard
4. Test webhook: `curl "https://your-url/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=novacare-webhook-verify-2026&hub.challenge=test"`

## Future Enhancements

1. **Multi-language Support**: Hindi, Marathi, Tamil, Telugu, Bengali
2. **Voice Messages**: For low-literacy patients
3. **Image Support**: Wound photos, prescription images
4. **Group Chats**: Family caregiver coordination
5. **Chatbot**: AI-powered responses for common questions
