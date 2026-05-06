"""Test zpopmin behavior to understand the return format."""
import asyncio
import redis.asyncio as aioredis

async def test():
    r = await aioredis.from_url('redis://redis:6379', decode_responses=True)
    
    # Add a test item to the sorted set
    await r.zadd("bull:novacare-agent-tasks:prioritized", {"test-job-123": 1.0})
    
    # Now pop it
    result = await r.zpopmin("bull:novacare-agent-tasks:prioritized", count=1)
    print(f"zpopmin result type: {type(result)}")
    print(f"zpopmin result: {result}")
    
    if result:
        print(f"  result[0] type: {type(result[0])}")
        print(f"  result[0]: {result[0]}")
        if isinstance(result[0], tuple):
            print(f"  job_id (tuple[0]): {result[0][0]}")
        elif isinstance(result[0], list):
            print(f"  job_id (list[0]): {result[0][0]}")
        else:
            print(f"  job_id (direct): {result[0]}")
    
    await r.aclose()

asyncio.run(test())
