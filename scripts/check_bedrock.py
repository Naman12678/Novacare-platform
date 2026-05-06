import boto3
import os

client = boto3.client('bedrock', region_name='us-east-1',
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    aws_session_token=os.environ.get('AWS_SESSION_TOKEN'))

try:
    resp = client.list_foundation_models(byProvider='Anthropic')
    print("Available Anthropic models:")
    for m in resp['modelSummaries']:
        print(f"  {m['modelId']}")
except Exception as e:
    print(f"Error listing models: {e}")

# Also try Amazon models
try:
    resp2 = client.list_foundation_models(byProvider='Amazon')
    print("\nAvailable Amazon models:")
    for m in resp2['modelSummaries'][:5]:
        print(f"  {m['modelId']}")
except Exception as e:
    print(f"Error: {e}")
