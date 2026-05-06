#!/bin/bash
# ============================================================
# NovaCare v2.0 — Agent Service Startup
# Runs both FastAPI server and BullMQ worker process
# ============================================================

echo "Starting NovaCare Agent Service..."

# Start the BullMQ worker in background, redirect output to stdout/stderr
python -m novacare.worker 2>&1 &
WORKER_PID=$!
echo "Worker started (PID: $WORKER_PID)"

# Start FastAPI server in foreground
uvicorn novacare.api:app --host 0.0.0.0 --port 8100 --workers 2 &
API_PID=$!
echo "API server started (PID: $API_PID)"

# Wait for either process to exit
wait -n $WORKER_PID $API_PID

# If one exits, kill the other
echo "A process exited, shutting down..."
kill $WORKER_PID $API_PID 2>/dev/null
wait
