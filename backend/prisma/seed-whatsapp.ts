import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test patient for WhatsApp demo...');

  // Create hospital
  const hospital = await prisma.hospital.upsert({
    where: { id: 'demo-hospital-001' },
    update: {},
    create: {
      id: 'demo-hospital-001',
      name: 'Ruby Hall Clinic, Pune',
      hipId: 'demo-hip-001',
      contactPhone: '+911234567890',
      stateCode: 'MH',
      district: 'Pune',
      tier: 2,
      abdmRegistered: true,
      active: true,
    },
  });

  console.log('✅ Hospital:', hospital.name);

  // Create demo hospital admin user for login
  const user = await prisma.user.upsert({
    where: { email: 'admin@rubyhall.in' },
    update: {
      passwordHash: 'novacare2026',
      name: 'Dr. Sneha Kulkarni',
      role: 'ADMIN',
      hospitalId: 'demo-hospital-001',
    },
    create: {
      email: 'admin@rubyhall.in',
      passwordHash: 'novacare2026',
      name: 'Dr. Sneha Kulkarni',
      role: 'ADMIN',
      hospitalId: 'demo-hospital-001',
    },
  });

  console.log('✅ Admin User:', user.email, '(password: novacare2026)');

  // Create patient - REPLACE PHONE NUMBER WITH YOUR WHATSAPP NUMBER
  const patient = await prisma.patient.upsert({
    where: { abhaId: 'demo-patient-001' },
    update: {
      contactPhone: '917439342924', // UPDATE THIS!
    },
    create: {
      abhaId: 'demo-patient-001',
      nameEncrypted: 'Ramesh Kumar',
      dateOfBirth: new Date('1980-01-01'),
      gender: 'male',
      pincode: '110001',
      languagePref: 'en',
      contactPhone: '917439342924', // Your WhatsApp number
      hospitalId: 'demo-hospital-001',
      ruralFlag: false,
    },
  });

  console.log('✅ Patient:', patient.nameEncrypted, '- Phone:', patient.contactPhone);

  // Create active episode
  const episode = await prisma.episode.upsert({
    where: { id: 'demo-episode-001' },
    update: {},
    create: {
      id: 'demo-episode-001',
      patientAbhaId: 'demo-patient-001',
      hospitalId: 'demo-hospital-001',
      dischargeDate: new Date(),
      diagnosisCodes: ['I21.9'],
      status: 'ACTIVE',
      riskScore: 0.35,
      riskTier: 'GREEN',
      currentDay: 1,
    },
  });

  console.log('✅ Episode: Day 1 of 30');

  // Create caregiver
  const caregiver = await prisma.caregiver.upsert({
    where: { id: 'demo-caregiver-001' },
    update: {},
    create: {
      id: 'demo-caregiver-001',
      patientAbhaId: 'demo-patient-001',
      name: 'Priya Kumar',
      phoneEncrypted: '919876543210', // Caregiver phone
      relationship: 'daughter',
      whatsappOptIn: true,
      languagePref: 'en',
    },
  });

  console.log('✅ Caregiver:', caregiver.name);

  console.log('\n🎉 Test data ready!');
  console.log('🔐 Login: admin@rubyhall.in / novacare2026');
  console.log('📱 Send "Hi" from WhatsApp to test number');
  console.log('✅ You should receive daily check-in!\n');
  console.log('⚠️  IMPORTANT: Update contactPhone in this file to YOUR WhatsApp number!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
