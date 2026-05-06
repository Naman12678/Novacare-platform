// ============================================================
// NovaCare v2.0 — AWS Service Client Factory
// Centralized AWS SDK client creation with LocalStack support
// ============================================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { S3Client } from "@aws-sdk/client-s3";
import { SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { config } from "./index.js";

/** Common AWS config — automatically routes to LocalStack in dev */
const awsConfig = {
  region: config.AWS_REGION,
  ...(config.AWS_ENDPOINT_URL && {
    endpoint: config.AWS_ENDPOINT_URL,
  }),
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    ...(config.AWS_SESSION_TOKEN && { sessionToken: config.AWS_SESSION_TOKEN }),
  },
};

// ---- DynamoDB ----
const dynamoBaseClient = new DynamoDBClient(awsConfig);
export const dynamoClient = DynamoDBDocumentClient.from(dynamoBaseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// ---- EventBridge ----
export const eventBridgeClient = new EventBridgeClient(awsConfig);

// ---- S3 ----
export const s3Client = new S3Client({
  ...awsConfig,
  forcePathStyle: true, // Required for LocalStack
});

// ---- SageMaker Runtime ----
export const sagemakerClient = new SageMakerRuntimeClient(awsConfig);

// ---- Secrets Manager ----
export const secretsClient = new SecretsManagerClient(awsConfig);
