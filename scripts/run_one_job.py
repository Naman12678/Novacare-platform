"""Run one job manually to see what happens."""
import asyncio
import json
import sys
import traceback
sys.path.insert(0, '/app')

import redis.asyncio as aioredis

async def run():
    r = await aioredis.from_url('redis://redis:6379', decode_responses=True)
    
    # Re-queue the job
    await r.zadd('bull:novacare-agent-tasks:prioritized', {'risk-demo-patient-001-day1-3e5f33bc': 1.0})
    
    # Pop it like the worker does
    result = await r.zpopmin('bull:novacare-agent-tasks:prioritized', count=1)
    if not result:
        print("No jobs in queue")
        return
    
    job_id = result[0][0]
    print(f"Got job: {job_id}")
    
    # Get hash
    job_hash = await r.hgetall(f"bull:novacare-agent-tasks:{job_id}")
    print(f"Job type: {job_hash.get('name')}")
    
    job_data = json.loads(job_hash.get('data', '{}'))
    print(f"Job data: {json.dumps(job_data)}")
    
    # Now try to process it
    try:
        from novacare.worker import process_risk_assessment
        print("\nCalling process_risk_assessment...")
        result = await process_risk_assessment(job_data, "test-correlation-id")
        print(f"\nSUCCESS! Result risk_score: {result.get('risk_score')}, tier: {result.get('risk_tier')}")
    except Exception as e:
        print(f"\nFAILED: {type(e).__name__}: {e}")
        traceback.print_exc()
    
    await r.aclose()

asyncio.run(run())
