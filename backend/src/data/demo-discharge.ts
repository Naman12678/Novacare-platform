// ============================================================
// NovaCare v2.0 — Demo Discharge Data (FHIR R4 Format)
// Simulates ABDM discharge webhook payload
// Used when ABDM API is not available (hackathon fallback)
// ============================================================

export const DEMO_PATIENTS = [
  {
    // Patient 1: Cardiac patient (post-MI) — Pune, Marathi speaker
    patient: {
      abhaId: "demo-patient-001",
      name: "Ramesh Kumar",
      age: 62,
      gender: "male",
      dateOfBirth: "1964-03-15",
      phone: "917439342924",
      pincode: "411001", // Pune
      language: "en", // Can be hi, mr, en
      ruralFlag: false,
    },
    hospital: {
      id: "demo-hospital-001",
      name: "Ruby Hall Clinic",
      hipId: "demo-hip-001",
      district: "Pune",
      state: "MH",
      tier: 1,
    },
    caregiver: {
      name: "Priya Kumar",
      phone: "919876543210",
      relationship: "daughter",
      language: "en",
    },
    // FHIR R4 Discharge Summary
    fhirBundle: {
      resourceType: "Bundle",
      type: "document",
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: "Patient",
            id: "demo-patient-001",
            identifier: [{ system: "https://healthid.abdm.gov.in", value: "72-1234-5678-9012" }],
            name: [{ given: ["Ramesh"], family: "Kumar" }],
            gender: "male",
            birthDate: "1964-03-15",
          },
        },
        {
          resource: {
            resourceType: "Condition",
            id: "cond-1",
            code: {
              coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: "I21.9", display: "Acute myocardial infarction, unspecified" }],
              text: "Heart Attack (MI)",
            },
            clinicalStatus: { coding: [{ code: "active" }] },
            severity: { coding: [{ code: "severe" }] },
          },
        },
        {
          resource: {
            resourceType: "Condition",
            id: "cond-2",
            code: {
              coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: "I10", display: "Essential hypertension" }],
              text: "High Blood Pressure",
            },
            clinicalStatus: { coding: [{ code: "active" }] },
          },
        },
        {
          resource: {
            resourceType: "Condition",
            id: "cond-3",
            code: {
              coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: "E11.9", display: "Type 2 diabetes mellitus" }],
              text: "Diabetes Type 2",
            },
            clinicalStatus: { coding: [{ code: "active" }] },
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-1",
            medicationCodeableConcept: {
              coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "1191", display: "Aspirin" }],
              text: "Aspirin 75mg",
            },
            dosageInstruction: [{ text: "75mg once daily in the morning after food", timing: { code: { text: "Morning" } } }],
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-2",
            medicationCodeableConcept: {
              coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "83367", display: "Atorvastatin" }],
              text: "Atorvastatin 40mg",
            },
            dosageInstruction: [{ text: "40mg once daily at night", timing: { code: { text: "Night" } } }],
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-3",
            medicationCodeableConcept: {
              coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "6918", display: "Metoprolol" }],
              text: "Metoprolol 50mg",
            },
            dosageInstruction: [{ text: "50mg twice daily morning and evening", timing: { code: { text: "Morning & Evening" } } }],
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-4",
            medicationCodeableConcept: {
              coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "29046", display: "Ramipril" }],
              text: "Ramipril 5mg",
            },
            dosageInstruction: [{ text: "5mg once daily in the morning", timing: { code: { text: "Morning" } } }],
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "MedicationRequest",
            id: "med-5",
            medicationCodeableConcept: {
              coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "4815", display: "Metformin" }],
              text: "Metformin 500mg",
            },
            dosageInstruction: [{ text: "500mg twice daily with meals", timing: { code: { text: "Morning & Night" } } }],
            status: "active",
          },
        },
        {
          resource: {
            resourceType: "ServiceRequest",
            id: "lab-1",
            code: { coding: [{ code: "2093-3", display: "Total Cholesterol" }], text: "Lipid Profile" },
            occurrenceDateTime: "2026-05-20",
            note: [{ text: "Follow-up lipid panel at Day 14" }],
          },
        },
        {
          resource: {
            resourceType: "ServiceRequest",
            id: "lab-2",
            code: { coding: [{ code: "4548-4", display: "HbA1c" }], text: "HbA1c Test" },
            occurrenceDateTime: "2026-05-27",
            note: [{ text: "Diabetes monitoring at Day 21" }],
          },
        },
        {
          resource: {
            resourceType: "CarePlan",
            id: "careplan-1",
            status: "active",
            intent: "plan",
            title: "30-Day Post-MI Recovery Plan",
            period: { start: new Date().toISOString(), end: new Date(Date.now() + 30 * 86400000).toISOString() },
            activity: [
              { detail: { description: "Daily BP monitoring — target < 130/80 mmHg", status: "in-progress" } },
              { detail: { description: "Blood sugar check — fasting < 130 mg/dL", status: "in-progress" } },
              { detail: { description: "Light walking 15-20 min daily from Day 7", status: "not-started" } },
              { detail: { description: "Low salt, low fat diet. Avoid fried food.", status: "in-progress" } },
              { detail: { description: "No smoking, no alcohol", status: "in-progress" } },
              { detail: { description: "Follow-up with cardiologist at Day 14", status: "scheduled" } },
            ],
          },
        },
      ],
    },
    // Parsed structured data (what Agent 1 would extract)
    parsed: {
      diagnosisCodes: ["I21.9", "I10", "E11.9"],
      diagnosisNames: ["Acute MI (Heart Attack)", "Hypertension", "Type 2 Diabetes"],
      medications: [
        { rxnorm_code: "1191", generic_name: "Aspirin", dosage: "75mg", time: "Morning", purpose: "Blood thinner" },
        { rxnorm_code: "83367", generic_name: "Atorvastatin", dosage: "40mg", time: "Night", purpose: "Cholesterol" },
        { rxnorm_code: "6918", generic_name: "Metoprolol", dosage: "50mg", time: "Morning & Evening", purpose: "Heart rate/BP" },
        { rxnorm_code: "29046", generic_name: "Ramipril", dosage: "5mg", time: "Morning", purpose: "BP control" },
        { rxnorm_code: "4815", generic_name: "Metformin", dosage: "500mg", time: "Morning & Night", purpose: "Diabetes" },
      ],
      labFollowUps: [
        { test: "Lipid Profile", dueDay: 14, date: "2026-05-20" },
        { test: "HbA1c", dueDay: 21, date: "2026-05-27" },
      ],
      warningSignsForPatient: [
        "Chest pain or pressure that doesn't go away",
        "Sudden breathlessness or difficulty breathing",
        "Swelling in legs, ankles, or feet",
        "Sudden dizziness or fainting",
        "Irregular or very fast heartbeat",
      ],
      dietaryRestrictions: [
        "Low salt (< 5g/day)",
        "Low fat — avoid fried/oily food",
        "No smoking, no alcohol",
        "Eat more fruits, vegetables, whole grains",
        "Small frequent meals instead of large ones",
      ],
      activityGuidelines: [
        "Complete bed rest for first 3 days",
        "Light walking from Day 7 (15-20 min)",
        "No heavy lifting for 4 weeks",
        "Avoid stairs for first week",
        "Resume normal activities gradually from Day 21",
      ],
      comorbidityCount: 2, // Hypertension + Diabetes
      polyPharmacy: true, // 5 medications
    },
  },
];

/**
 * Get demo discharge data for a patient
 */
export function getDemoDischargeData(patientIndex: number = 0) {
  return DEMO_PATIENTS[patientIndex] || DEMO_PATIENTS[0];
}

/**
 * Generate the care plan summary text for WhatsApp delivery
 */
export function generateCarePlanSummary(data: typeof DEMO_PATIENTS[0]): string {
  const meds = data.parsed.medications
    .map(m => `  💊 ${m.generic_name} ${m.dosage} — ${m.time} (${m.purpose})`)
    .join("\n");

  const warnings = data.parsed.warningSignsForPatient
    .map(w => `  🚨 ${w}`)
    .join("\n");

  const diet = data.parsed.dietaryRestrictions
    .map(d => `  🥗 ${d}`)
    .join("\n");

  const labs = data.parsed.labFollowUps
    .map(l => `  🧪 ${l.test} — Day ${l.dueDay} (${l.date})`)
    .join("\n");

  return `🏥 *Your 30-Day Care Plan*
━━━━━━━━━━━━━━━━━━━━

*Diagnosis:* ${data.parsed.diagnosisNames.join(", ")}

*Daily Medications:*
${meds}

*Warning Signs (Call 108 immediately):*
${warnings}

*Diet Guidelines:*
${diet}

*Upcoming Lab Tests:*
${labs}

*Activity:*
  🚶 Bed rest first 3 days
  🚶 Light walking from Day 7
  🚶 Normal activities from Day 21

━━━━━━━━━━━━━━━━━━━━
_NovaCare will check in with you daily.
Reply anytime if you have questions._`;
}
