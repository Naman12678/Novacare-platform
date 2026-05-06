// ============================================================
// NovaCare v2.0 — DynamoDB Repository
// Primary patient state store — event-sourced, single-table design
// ============================================================

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { dynamoClient } from "../config/aws.js";
import { config } from "../config/index.js";
import type { PatientState, RiskTier, EscalationStatus, AgentId } from "../types/index.js";

const TABLE_NAME = config.DYNAMODB_TABLE_NAME;

// ---- Key Builders ----
const patientPK = (abhaId: string) => `PATIENT#${abhaId}`;
const eventSK = (timestamp: string, eventType: string) => `EVENT#${timestamp}#${eventType}`;
const stateSK = () => "STATE#CURRENT";
const carePlanSK = (carePlanId: string) => `CAREPLAN#${carePlanId}`;

export class DynamoRepository {
  // ================================================================
  // Patient State — Current snapshot (read by agents and dashboard)
  // ================================================================

  /** Get the current state for a patient episode */
  async getPatientState(abhaId: string): Promise<PatientState | null> {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: patientPK(abhaId), sk: stateSK() },
      })
    );
    return (result.Item as PatientState) ?? null;
  }

  /** Write/update the full patient state snapshot */
  async putPatientState(abhaId: string, state: PatientState): Promise<void> {
    const ttlDays = 37; // Day 30 + 7 grace days
    const dischargeDateMs = new Date(state.discharge_date).getTime();
    const ttl = Math.floor((dischargeDateMs + ttlDays * 86_400_000) / 1000);

    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: patientPK(abhaId),
          sk: stateSK(),
          ...state,
          hospital_id: state.hospital_id,
          discharge_date: state.discharge_date,
          risk_tier: state.risk_tier,
          risk_score: state.risk_score,
          escalation_status: state.active_escalation_id ? "PENDING" : "NONE",
          escalation_created_at: new Date().toISOString(),
          ttl,
          updated_at: new Date().toISOString(),
        },
      })
    );
  }

  /** Partially update patient state fields */
  async updatePatientState(
    abhaId: string,
    updates: Partial<PatientState>
  ): Promise<void> {
    const expressionParts: string[] = [];
    const expressionNames: Record<string, string> = {};
    const expressionValues: Record<string, unknown> = {};

    Object.entries(updates).forEach(([key, value], idx) => {
      const nameAlias = `#f${idx}`;
      const valueAlias = `:v${idx}`;
      expressionParts.push(`${nameAlias} = ${valueAlias}`);
      expressionNames[nameAlias] = key;
      expressionValues[valueAlias] = value;
    });

    expressionParts.push("#updatedAt = :updatedAt");
    expressionNames["#updatedAt"] = "updated_at";
    expressionValues[":updatedAt"] = new Date().toISOString();

    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: patientPK(abhaId), sk: stateSK() },
        UpdateExpression: `SET ${expressionParts.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      })
    );
  }

  // ================================================================
  // Event Log — Immutable event stream per patient
  // ================================================================

  /** Append an immutable event to the patient's event log */
  async appendEvent(
    abhaId: string,
    eventType: string,
    agentId: AgentId,
    data: Record<string, unknown>
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: patientPK(abhaId),
          sk: eventSK(timestamp, eventType),
          agent_id: agentId,
          patient_abha_id: abhaId,
          event_type: eventType,
          event_data: data,
          created_at: timestamp,
        },
      })
    );
  }

  /** Get all events for a patient, optionally filtered by event type prefix */
  async getPatientEvents(
    abhaId: string,
    eventTypePrefix?: string,
    limit: number = 100
  ): Promise<Record<string, unknown>[]> {
    const keyCondition = eventTypePrefix
      ? "pk = :pk AND begins_with(sk, :skPrefix)"
      : "pk = :pk AND begins_with(sk, :skPrefix)";

    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: {
          ":pk": patientPK(abhaId),
          ":skPrefix": eventTypePrefix ? `EVENT#${eventTypePrefix}` : "EVENT#",
        },
        ScanIndexForward: false, // newest first
        Limit: limit,
      })
    );

    return (result.Items as Record<string, unknown>[]) ?? [];
  }

  // ================================================================
  // GSI Queries — Hospital Dashboard
  // ================================================================

  /** Get all active patients for a hospital (GSI-1) */
  async getHospitalPatients(
    hospitalId: string,
    limit: number = 50
  ): Promise<Record<string, unknown>[]> {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "hospital_active_patients_index",
        KeyConditionExpression: "hospital_id = :hid",
        ExpressionAttributeValues: { ":hid": hospitalId },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (result.Items as Record<string, unknown>[]) ?? [];
  }

  /** Get patients by risk tier sorted by score (GSI-2) */
  async getPatientsByRiskTier(
    tier: RiskTier,
    limit: number = 50
  ): Promise<Record<string, unknown>[]> {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "risk_score_index",
        KeyConditionExpression: "risk_tier = :tier",
        ExpressionAttributeValues: { ":tier": tier },
        ScanIndexForward: false, // highest risk first
        Limit: limit,
      })
    );
    return (result.Items as Record<string, unknown>[]) ?? [];
  }

  /** Get pending escalations (GSI-3) */
  async getPendingEscalations(
    status: EscalationStatus = "PENDING",
    limit: number = 50
  ): Promise<Record<string, unknown>[]> {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "escalation_pending_index",
        KeyConditionExpression: "escalation_status = :status",
        ExpressionAttributeValues: { ":status": status },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (result.Items as Record<string, unknown>[]) ?? [];
  }

  // ================================================================
  // Batch Operations
  // ================================================================

  /** Delete all records for a patient (Right to Erasure — DPDP compliance) */
  async deletePatientData(abhaId: string): Promise<void> {
    // First, query all records for this patient
    const allRecords = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": patientPK(abhaId) },
        ProjectionExpression: "pk, sk",
      })
    );

    if (!allRecords.Items || allRecords.Items.length === 0) return;

    // Batch delete in groups of 25 (DynamoDB limit)
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < allRecords.Items.length; i += 25) {
      batches.push(allRecords.Items.slice(i, i + 25));
    }

    for (const batch of batches) {
      await dynamoClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map((item) => ({
              DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
            })),
          },
        })
      );
    }
  }
}

export const dynamoRepository = new DynamoRepository();
