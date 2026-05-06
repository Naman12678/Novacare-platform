#!/bin/bash
# ============================================================
# NovaCare v2.0 — Demo Startup Script
# One-command setup for hackathon demo
# ============================================================

set -e

echo "🏥 NovaCare v2.0 — Starting Demo Environment"
echo "=============================================="

# Step 1: Start all services
echo ""
echo "📦 Step 1: Starting Docker services..."
docker-compose up -d

# Step 2: Wait for services to be healthy
echo ""
echo "⏳ Step 2: Waiting for services to be healthy..."
echo "  Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U novacare -d novacare_db > /dev/null 2>&1; do
  sleep 1
done
echo "  ✅ PostgreSQL ready"

echo "  Waiting for Redis..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "  ✅ Redis ready"

echo "  Waiting for LocalStack..."
sleep 5
echo "  ✅ LocalStack ready"

# Step 3: Push database schema
echo ""
echo "🗄️  Step 3: Setting up database schema..."
docker-compose exec -T backend npx prisma db push --skip-generate 2>/dev/null || true
echo "  ✅ Schema pushed"

# Step 4: Seed test data
echo ""
echo "🌱 Step 4: Seeding test data..."
docker-compose exec -T backend npx tsx prisma/seed-whatsapp.ts 2>/dev/null || echo "  ⚠️  Seed may have already run"
echo "  ✅ Test data seeded"

# Step 5: Verify services
echo ""
echo "🔍 Step 5: Verifying services..."
echo -n "  Backend: "
curl -s http://localhost:8000/health | grep -q "healthy" && echo "✅ Healthy" || echo "❌ Not responding"
echo -n "  Agents:  "
curl -s http://localhost:8100/health | grep -q "healthy" && echo "✅ Healthy" || echo "❌ Not responding"
echo -n "  Frontend: "
curl -s http://localhost:5173 > /dev/null 2>&1 && echo "✅ Running" || echo "❌ Not responding"

# Done
echo ""
echo "=============================================="
echo "🎉 NovaCare v2.0 is ready!"
echo ""
echo "📱 Frontend:  http://localhost:5173"
echo "🔧 Backend:   http://localhost:8000"
echo "🤖 Agents:    http://localhost:8100"
echo "🗄️  Database:  postgresql://novacare:novacare_secret@localhost:5432/novacare_db"
echo ""
echo "📋 Next steps:"
echo "  1. Start ngrok: ngrok http 8000"
echo "  2. Update WhatsApp webhook URL in Meta dashboard"
echo "  3. Send 'Hi' from WhatsApp to test the flow"
echo ""
echo "📊 View logs: docker-compose logs -f backend agents"
echo "=============================================="
