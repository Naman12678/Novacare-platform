import asyncio
import redis.asyncio as aioredis
import json

async def test():
    r = await aioredis.from_url('redis://redis:6379', decode_responses=True)
    
    # Check what job hashes exist
    keys = await r.keys('bull:novacare-agent-tasks:risk*')
    print(f'Risk job keys: {keys}')
    
    for key in keys:
        data = await r.hgetall(key)
        print(f'\nJob {key}:')
        for k, v in data.items():
            print(f'  {k} = {str(v)[:80]}')
    
    # Also check if there are any jobs at all
    all_keys = await r.keys('bull:novacare-agent-tasks:*')
    print(f'\nAll queue keys: {all_keys}')
    
    await r.aclose()

asyncio.run(test())
