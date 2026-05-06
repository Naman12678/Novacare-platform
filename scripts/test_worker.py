"""Test the worker's job processing logic directly."""
import asyncio
import json
import redis.asyncio as aioredis
import sys
sys.path.insert(0, '/app')

from novacare.core.config import get_settings
from novacare.core.dynamo import get_patient_state

settings = get_settings()

async def test():
    r = await aioredis.from_url('redis://redis:6379', decode_responses=True)
    
    # Get a job hash
    job_id = "risk-demo-patient-001-day1-3e5f33bc"
    job_hash = await r.hgetall(f"bull:novacare-agent-tasks:{job_id}")
    
    print(f"Job hash keys: {list(job_hash.keys())}")
    print(f"Job name: {job_hash.get('name')}")
    print(f"Job data: {job_hash.get('data')}")
    
    # Parse job data
    job_data = json.loads(job_hash.get('data', '{}'))
    print(f"\nParsed job data: {json.dumps(job_data, indent=2)}")
    
    # Try to get patient state
    print(f"\nGetting patient state for: {job_data.get('patient_abha_id')}")
    try:
        state = await get_patient_state(job_data['patient_abha_id'])
        if state:
            print(f"  Found! Day: {state.get('current_day')}, Risk: {state.get('risk_tier')}")
        else:
            print("  NOT FOUND - this is why the worker fails!")
    except Exception as e:
        print(f"  ERROR: {e}")
    
    await r.aclose()

asyncio.run(test())
