// ============================================================
// NovaCare v2.0 — Prisma Database Seed
// Seeds demo hospitals, users, medications, and patients
// ============================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding NovaCare database...");

  // 1. Hospitals
  const rubyHall = await prisma.hospital.upsert({
    where: { hipId: "ruby-hall-pune-001" },
    update: {},
    create: {
      name: "Ruby Hall Clinic, Pune",
      hipId: "ruby-hall-pune-001",
      abdmRegistered: true,
      stateCode: "MH",
      district: "Pune",
      tier: 1,
      contactEmail: "admin@rubyhall.com",
      contactPhone: "+912026163391",
    },
  });

  const apollo = await prisma.hospital.upsert({
    where: { hipId: "apollo-hyd-001" },
    update: {},
    create: {
      name: "Apollo Hospitals, Hyderabad",
      hipId: "apollo-hyd-001",
      abdmRegistered: true,
      stateCode: "TS",
      district: "Hyderabad",
      tier: 1,
      contactEmail: "admin@apollo.com",
      contactPhone: "+914023607777",
    },
  });

  console.log("  ✅ Hospitals seeded");

  // 2. Admin Users
  await prisma.user.upsert({
    where: { email: "admin@novacare.in" },
    update: {},
    create: {
      email: "admin@novacare.in",
      passwordHash: "demo123", // In production: bcrypt hash
      name: "NovaCare Admin",
      role: "ADMIN",
      hospitalId: rubyHall.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "doctor@rubyhall.com" },
    update: {},
    create: {
      email: "doctor@rubyhall.com",
      passwordHash: "demo123",
      name: "Dr. Sneha Kulkarni",
      role: "DOCTOR",
      hospitalId: rubyHall.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "coordinator@rubyhall.com" },
    update: {},
    create: {
      email: "coordinator@rubyhall.com",
      passwordHash: "demo123",
      name: "Anita Deshmukh",
      role: "COORDINATOR",
      hospitalId: rubyHall.id,
    },
  });

  console.log("  ✅ Users seeded");

  // 3. Medications
  const meds = [
    { rxnormCode: "200031", genericName: "Furosemide", brandName: "Lasix", janAushadhiAvailable: true, janAushadhiPrice: 15, brandPrice: 85 },
    { rxnormCode: "35212", genericName: "Metformin", brandName: "Glucophage", janAushadhiAvailable: true, janAushadhiPrice: 25, brandPrice: 180 },
    { rxnormCode: "29046", genericName: "Ramipril", brandName: "Cardace", janAushadhiAvailable: true, janAushadhiPrice: 30, brandPrice: 250 },
    { rxnormCode: "6918", genericName: "Spironolactone", brandName: "Aldactone", janAushadhiAvailable: true, janAushadhiPrice: 20, brandPrice: 120 },
    { rxnormCode: "1191", genericName: "Aspirin", brandName: "Ecosprin", janAushadhiAvailable: true, janAushadhiPrice: 5, brandPrice: 35 },
    { rxnormCode: "321988", genericName: "Atorvastatin", brandName: "Lipitor", janAushadhiAvailable: true, janAushadhiPrice: 18, brandPrice: 200 },
    { rxnormCode: "2556", genericName: "Amlodipine", brandName: "Amlopress", janAushadhiAvailable: true, janAushadhiPrice: 12, brandPrice: 95 },
  ];

  for (const med of meds) {
    await prisma.medication.upsert({
      where: { rxnormCode: med.rxnormCode },
      update: {},
      create: { ...med, dosageForm: "tablet" },
    });
  }

  console.log("  ✅ Medications seeded");

  // 4. Demo Patients
  const patients = [
    {
      abhaId: "72-1234-5678-9012",
      nameEncrypted: "Rajesh Patil",
      dateOfBirth: new Date("1964-03-15"),
      gender: "male",
      pincode: "411001",
      languagePref: "mr",
      contactPhone: "+919876543210",
      hospitalId: rubyHall.id,
      ruralFlag: false,
      diagnosis: "Heart Failure + Diabetes",
    },
    {
      abhaId: "72-5678-1234-5678",
      nameEncrypted: "Sunita Devi",
      dateOfBirth: new Date("1958-07-22"),
      gender: "female",
      pincode: "800001",
      languagePref: "hi",
      contactPhone: "+919876543212",
      hospitalId: rubyHall.id,
      ruralFlag: true,
      diagnosis: "COPD",
    },
    {
      abhaId: "72-9012-3456-7890",
      nameEncrypted: "Venkat Reddy",
      dateOfBirth: new Date("1970-11-05"),
      gender: "male",
      pincode: "500001",
      languagePref: "te",
      contactPhone: "+919876543213",
      hospitalId: apollo.id,
      ruralFlag: false,
      diagnosis: "CKD + Hypertension",
    },
  ];

  for (const p of patients) {
    const { diagnosis, ...patientData } = p;

    const patient = await prisma.patient.upsert({
      where: { abhaId: p.abhaId },
      update: {},
      create: patientData,
    });

    // Create active episode
    await prisma.episode.upsert({
      where: { id: `demo-ep-${p.abhaId.slice(0, 8)}` },
      update: {},
      create: {
        id: `demo-ep-${p.abhaId.slice(0, 8)}`,
        patientAbhaId: p.abhaId,
        hospitalId: p.hospitalId,
        dischargeDate: new Date(Date.now() - 12 * 86400000), // 12 days ago
        diagnosisCodes: [diagnosis],
        status: "ACTIVE",
        currentDay: 12,
        riskScore: p.abhaId.includes("1234") ? 0.72 : 0.35,
        riskTier: p.abhaId.includes("1234") ? "ORANGE" : "GREEN",
      },
    });
  }

  console.log("  ✅ Demo patients seeded");
  console.log("\n🎉 Database seeding complete!");
  console.log("   Login: admin@novacare.in / demo123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
