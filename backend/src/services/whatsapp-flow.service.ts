// ============================================================
// NovaCare v2.0 — WhatsApp Conversational Flow Service
// Multi-step medical chatbot with AI-powered responses
// ============================================================

import { whatsappClient } from "../integrations/whatsapp.client.js";
import { prismaRepository } from "../repositories/prisma.repository.js";
import { dynamoRepository } from "../repositories/dynamo.repository.js";
import { agentBridge } from "./agent-bridge.service.js";
import { getDemoDischargeData, generateCarePlanSummary } from "../data/demo-discharge.js";
import pino from "pino";

const logger = pino({ name: "whatsapp-flow" });

// ---- Conversation Session State ----
interface Session {
  step: "language" | "greeting" | "feeling" | "symptoms" | "symptom_detail" | "medication" | "vitals" | "complete" | "chat";
  language: string; // en, hi, mr, ta, te, bn
  dayNumber: number;
  feelingScore: number;
  symptoms: string[];
  symptomDetail: string;
  medTaken: boolean | null;
  medsMissed: string[];
  vitals: { bp?: string; sugar?: string; weight?: string };
  carePlanSent: boolean;
  lastActivity: number;
}

// Multilingual message templates
const MESSAGES: Record<string, Record<string, string>> = {
  language_ask: {
    en: "🏥 *NovaCare*\n\nWelcome! Please choose your preferred language:\n\nकृपया अपनी भाषा चुनें:",
  },
  feeling_ask: {
    en: "🏥 *NovaCare Check-in — Day {day}/30*\n\nHi! Time for your daily health check.\n\n*How are you feeling today?*",
    hi: "🏥 *NovaCare जांच — दिन {day}/30*\n\nनमस्ते! आज की स्वास्थ्य जांच का समय है।\n\n*आज आप कैसा महसूस कर रहे हैं?*",
    mr: "🏥 *NovaCare तपासणी — दिवस {day}/30*\n\nनमस्कार! दैनिक आरोग्य तपासणीची वेळ.\n\n*आज तुम्हाला कसे वाटत आहे?*",
    ta: "🏥 *NovaCare பரிசோதனை — நாள் {day}/30*\n\nவணக்கம்! தினசரி சுகாதார பரிசோதனை.\n\n*இன்று எப்படி உணர்கிறீர்கள்?*",
    te: "🏥 *NovaCare చెక్-ఇన్ — రోజు {day}/30*\n\nనమస్కారం! రోజువారీ ఆరోగ్య తనిఖీ.\n\n*ఈరోజు మీరు ఎలా ఉన్నారు?*",
    bn: "🏥 *NovaCare চেক-ইন — দিন {day}/30*\n\nনমস্কার! দৈনিক স্বাস্থ্য পরীক্ষা.\n\n*আজ আপনি কেমন অনুভব করছেন?*",
  },
  feeling_buttons: {
    en: "Better|Same|Worse",
    hi: "बेहतर|ठीक है|खराब",
    mr: "चांगले|तसेच|वाईट",
    ta: "நன்றாக|சரி|மோசம்",
    te: "మెరుగ్గా|అలాగే|అధ్వాన్నం",
    bn: "ভালো|একই|খারাপ",
  },
  symptom_worse: {
    en: "I'm sorry to hear that 😔\n\n*What's bothering you the most?*",
    hi: "सुनकर दुख हुआ 😔\n\n*सबसे ज्यादा क्या परेशानी है?*",
    mr: "ऐकून वाईट वाटले 😔\n\n*सर्वात जास्त काय त्रास होतोय?*",
    ta: "வருத்தமாக உள்ளது 😔\n\n*என்ன பிரச்சனை?*",
    te: "బాధగా ఉంది 😔\n\n*ఏమి ఇబ్బంది?*",
    bn: "শুনে দুঃখিত 😔\n\n*সবচেয়ে বেশি কী সমস্যা?*",
  },
  symptom_same: {
    en: "Okay, noted. Any new issues since yesterday?",
    hi: "ठीक है। कल से कोई नई समस्या?",
    mr: "ठीक आहे. कालपासून काही नवीन समस्या?",
    ta: "சரி. நேற்றிலிருந்து புதிய பிரச்சனை?",
    te: "సరే. నిన్నటి నుండి కొత్త సమస్య?",
    bn: "ঠিক আছে। গতকাল থেকে নতুন সমস্যা?",
  },
  symptom_buttons_worse: {
    en: "Chest pain|Breathing issue|Swelling",
    hi: "सीने में दर्द|सांस की तकलीफ|सूजन",
    mr: "छातीत दुखणे|श्वास घेण्यास त्रास|सूज",
    ta: "நெஞ்சு வலி|மூச்சு திணறல்|வீக்கம்",
    te: "ఛాతీ నొప్పి|శ్వాస ఇబ్బంది|వాపు",
    bn: "বুকে ব্যথা|শ্বাসকষ্ট|ফোলা",
  },
  symptom_buttons_same: {
    en: "Tired/weak|Dizzy|Nothing new",
    hi: "थकान/कमजोरी|चक्कर|कुछ नहीं",
    mr: "थकवा/अशक्तपणा|चक्कर|काही नाही",
    ta: "சோர்வு|தலைசுற்றல்|ஒன்றுமில்லை",
    te: "అలసట|తలతిరుగుట|ఏమీ లేదు",
    bn: "ক্লান্তি|মাথা ঘোরা|কিছু নেই",
  },
  med_ask: {
    en: "*Medication Check:*\n\n{meds}\n\n*Did you take all your medicines?*",
    hi: "*दवाई जांच:*\n\n{meds}\n\n*क्या आपने सभी दवाइयाँ ली हैं?*",
    mr: "*औषध तपासणी:*\n\n{meds}\n\n*तुम्ही सर्व औषधे घेतली का?*",
    ta: "*மருந்து சரிபார்ப்பு:*\n\n{meds}\n\n*எல்லா மருந்துகளும் எடுத்தீர்களா?*",
    te: "*మందుల తనిఖీ:*\n\n{meds}\n\n*అన్ని మందులు తీసుకున్నారా?*",
    bn: "*ওষুধ পরীক্ষা:*\n\n{meds}\n\n*সব ওষুধ খেয়েছেন?*",
  },
  med_buttons: {
    en: "Yes, all taken|Missed some|Not taken",
    hi: "हाँ, सब ली|कुछ छूट गई|नहीं ली",
    mr: "हो, सर्व घेतली|काही राहिली|नाही घेतली",
    ta: "ஆம், எல்லாம்|சில தவறிவிட்டன|இல்லை",
    te: "అవును, అన్నీ|కొన్ని మిస్|తీసుకోలేదు",
    bn: "হ্যাঁ, সব|কিছু বাদ|খাইনি",
  },
  vitals_ask: {
    en: "*Vitals (optional):*\n\nDo you have BP or sugar readings?\nType them or skip.",
    hi: "*जांच (वैकल्पिक):*\n\nBP या शुगर रीडिंग है?\nटाइप करें या skip करें।",
    mr: "*तपासणी (ऐच्छिक):*\n\nBP किंवा शुगर रीडिंग आहे?\nटाइप करा किंवा skip करा.",
    ta: "*பரிசோதனை (விருப்பம்):*\n\nBP அல்லது சர்க்கரை?\nதட்டச்சு செய்யுங்கள் அல்லது skip.",
    te: "*పరీక్ష (ఐచ్ఛికం):*\n\nBP లేదా షుగర్?\nటైప్ చేయండి లేదా skip.",
    bn: "*পরীক্ষা (ঐচ্ছিক):*\n\nBP বা সুগার আছে?\nটাইপ করুন বা skip করুন।",
  },
  vitals_buttons: {
    en: "Skip & finish|Enter BP|Enter sugar",
    hi: "Skip करें|BP दें|Sugar दें",
    mr: "Skip करा|BP द्या|Sugar द्या",
    ta: "Skip|BP|Sugar",
    te: "Skip|BP|Sugar",
    bn: "Skip|BP|Sugar",
  },
  checkin_complete: {
    en: "✅ *Check-in Complete — Day {day}*\n\nFeeling: {feel}\nSymptoms: {symp}\nMedications: {med}\nVitals: {vitals}\n\n_Your care team is monitoring your progress._\n\n💬 Type *report* for your health history.",
    hi: "✅ *जांच पूरी — दिन {day}*\n\nमहसूस: {feel}\nलक्षण: {symp}\nदवाइयाँ: {med}\nजांच: {vitals}\n\n_आपकी देखभाल टीम आपकी प्रगति देख रही है।_\n\n💬 *report* टाइप करें अपना इतिहास देखने के लिए।",
    mr: "✅ *तपासणी पूर्ण — दिवस {day}*\n\nवाटते: {feel}\nलक्षणे: {symp}\nऔषधे: {med}\nतपासणी: {vitals}\n\n_तुमची काळजी टीम तुमच्या प्रगतीवर लक्ष ठेवत आहे._\n\n💬 *report* टाइप करा.",
    ta: "✅ *பரிசோதனை முடிந்தது — நாள் {day}*\n\nஉணர்வு: {feel}\nஅறிகுறிகள்: {symp}\nமருந்துகள்: {med}\n\n💬 *report* தட்டச்சு செய்யுங்கள்.",
    te: "✅ *చెక్-ఇన్ పూర్తి — రోజు {day}*\n\nభావన: {feel}\nలక్షణాలు: {symp}\nమందులు: {med}\n\n💬 *report* టైప్ చేయండి.",
    bn: "✅ *চেক-ইন সম্পূর্ণ — দিন {day}*\n\nঅনুভূতি: {feel}\nলক্ষণ: {symp}\nওষুধ: {med}\n\n💬 *report* টাইপ করুন।",
  },
  better_reply: {
    en: "That's great to hear! 🎉 Keep it up.",
    hi: "बहुत अच्छा! 🎉 ऐसे ही रहें।",
    mr: "छान! 🎉 असेच चालू ठेवा.",
    ta: "மிக நல்லது! 🎉",
    te: "చాలా బాగుంది! 🎉",
    bn: "দারুণ! 🎉",
  },
};

function msg(key: string, lang: string, vars?: Record<string, string>): string {
  const template = MESSAGES[key]?.[lang] || MESSAGES[key]?.["en"] || "";
  if (!vars) return template;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);
}

// In-memory sessions (per phone). In production use Redis.
const sessions = new Map<string, Session>();

// Session timeout: 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;

export class WhatsAppFlowService {
  /**
   * Main entry point — routes messages to appropriate handler
   */
  async handlePatientMessage(phone: string, messageText: string, messageType: string): Promise<void> {
    logger.info({ phone, messageText: messageText.substring(0, 50), messageType }, "Processing message");

    try {
      // 1. Find patient
      const patient = await prismaRepository.getPatientByPhone(phone);
      if (!patient) {
        await whatsappClient.sendText(phone,
          "🏥 *NovaCare*\n\nYou're not registered in our system. Please contact your hospital to enroll in the post-discharge care program.\n\nIf you think this is an error, call your hospital helpline.");
        return;
      }

    // 2. Get active episode
    const episode = await prismaRepository.getActiveEpisode(patient.abhaId);
    if (!episode) {
      await whatsappClient.sendText(phone, "Hello! You don't have an active care episode. Contact your hospital to start.");
      return;
    }

    const dayNumber = this.calculateDayNumber(episode.dischargeDate);
    if (dayNumber > 30) {
      await this.handleCompletedJourney(phone, patient.abhaId);
      return;
    }

    // 3. Get or create session
    let session = sessions.get(phone);
    if (!session || Date.now() - session.lastActivity > SESSION_TIMEOUT) {
      session = this.createSession(dayNumber);
      sessions.set(phone, session);
    }
    session.lastActivity = Date.now();
    session.dayNumber = dayNumber;

    // 4. Route based on message type
    if (messageType === "interactive") {
      await this.handleButton(phone, patient.abhaId, messageText, session, patient.languagePref);
    } else {
      await this.handleText(phone, patient.abhaId, messageText, session, patient.languagePref);
    }

    } catch (error) {
      logger.error({ error, phone }, "WhatsApp flow error — sending fallback response");
      try {
        await whatsappClient.sendText(phone, "Sorry, I encountered an issue. Please try again in a moment. Type *Hi* to restart your check-in.");
      } catch { /* ignore send failure */ }
    }
  }

  // ================================================================
  // TEXT MESSAGE HANDLER
  // ================================================================

  private async handleText(phone: string, abhaId: string, text: string, session: Session, lang: string): Promise<void> {
    const lower = text.toLowerCase().trim();

    // Check for emergency keywords
    if (this.isEmergency(lower)) {
      await this.handleEmergency(phone, abhaId);
      return;
    }

    // Check for stop/reset keywords
    if (lower === "stop" || lower === "reset" || lower === "end" || lower === "bye" || lower === "quit" || lower === "exit") {
      sessions.delete(phone);
      await whatsappClient.sendText(phone, "👋 Session ended. Type *Hi* anytime to start a new check-in.\n\n_NovaCare is always here for you._");
      return;
    }

    // If in vitals step, parse vital reading
    if (session.step === "vitals") {
      await this.parseVitals(phone, abhaId, text, session, lang);
      return;
    }

    // If in symptom_detail step, record the detail
    if (session.step === "symptom_detail") {
      session.symptomDetail = text;
      session.step = "medication";
      sessions.set(phone, session);
      await this.askMedication(phone, abhaId, session, lang);
      return;
    }

    // If session is complete or chat mode, handle as free-text medical query
    if (session.step === "complete" || session.step === "chat") {
      await this.handleMedicalQuery(phone, abhaId, text, session, lang);
      return;
    }

    // Default: ask language or start check-in
    if (session.step === "language") {
      await this.askLanguage(phone, session);
    } else {
      await this.startCheckIn(phone, abhaId, session, session.language);
    }
  }

  // ================================================================
  // BUTTON RESPONSE HANDLER
  // ================================================================

  private async handleButton(phone: string, abhaId: string, buttonId: string, session: Session, lang: string): Promise<void> {
    switch (session.step) {
      case "language":
        await this.processLanguageSelection(phone, abhaId, buttonId, session);
        break;
      case "greeting":
      case "feeling":
        await this.processFeelingResponse(phone, abhaId, buttonId, session, lang);
        break;
      case "symptoms":
        await this.processSymptomResponse(phone, abhaId, buttonId, session, lang);
        break;
      case "medication":
        await this.processMedicationResponse(phone, abhaId, buttonId, session, lang);
        break;
      case "vitals":
        await this.processVitalsButton(phone, abhaId, buttonId, session, lang);
        break;
      default:
        await this.startCheckIn(phone, abhaId, session, lang);
    }
  }

  // ================================================================
  // LANGUAGE SELECTION
  // ================================================================

  private async askLanguage(phone: string, session: Session): Promise<void> {
    session.step = "language";
    sessions.set(phone, session);

    await whatsappClient.sendInteractiveButtons(
      phone,
      "🏥 *NovaCare*\n\nWelcome! Please choose your language:\nकृपया अपनी भाषा चुनें:\n\nSelect below:",
      [
        { id: "lang_en", title: "English" },
        { id: "lang_hi", title: "हिन्दी (Hindi)" },
        { id: "lang_mr", title: "मराठी (Marathi)" },
      ],
      "Language / भाषा"
    );
  }

  private async processLanguageSelection(phone: string, abhaId: string, buttonId: string, session: Session): Promise<void> {
    const langMap: Record<string, string> = {
      lang_en: "en",
      lang_hi: "hi",
      lang_mr: "mr",
      lang_ta: "ta",
      lang_te: "te",
      lang_bn: "bn",
    };

    session.language = langMap[buttonId] || "en";
    session.step = "greeting";
    sessions.set(phone, session);

    // Start the check-in in chosen language
    await this.startCheckIn(phone, abhaId, session, session.language);
  }

  // ================================================================
  // CHECK-IN FLOW STEPS
  // ================================================================

  private async startCheckIn(phone: string, abhaId: string, session: Session, lang: string): Promise<void> {
    const day = session.dayNumber;

    // Day 1: Send care plan first (only once)
    if (day <= 1 && !session.carePlanSent) {
      const demoData = getDemoDischargeData();
      const carePlan = generateCarePlanSummary(demoData);
      await whatsappClient.sendText(phone, carePlan);
      session.carePlanSent = true;
      sessions.set(phone, session);

      // Wait 3 seconds then start check-in
      await this.delay(3000);
    }

    session.step = "feeling";
    sessions.set(phone, session);

    const buttons = msg("feeling_buttons", lang).split("|");

    await whatsappClient.sendInteractiveButtons(
      phone,
      msg("feeling_ask", lang, { day: String(day) }),
      [
        { id: "feel_better", title: buttons[0] || "Better" },
        { id: "feel_same", title: buttons[1] || "Same" },
        { id: "feel_worse", title: buttons[2] || "Worse" },
      ],
      "NovaCare",
      `Day ${day}`
    );

    // Non-blocking DynamoDB logging (don't crash if DynamoDB is down)
    dynamoRepository.appendEvent(abhaId, "checkin_started", "daily_pulse", { day, channel: "whatsapp" }).catch(e => logger.warn({ e }, "DynamoDB log failed (non-critical)"));
  }

  private async processFeelingResponse(phone: string, abhaId: string, buttonId: string, session: Session, lang: string): Promise<void> {
    const l = session.language || lang;
    switch (buttonId) {
      case "feel_better": session.feelingScore = 1; break;
      case "feel_same": session.feelingScore = 3; break;
      case "feel_worse": session.feelingScore = 5; break;
      default: session.feelingScore = 3;
    }

    session.step = "symptoms";
    sessions.set(phone, session);

    if (session.feelingScore >= 4) {
      const btns = msg("symptom_buttons_worse", l).split("|");
      await whatsappClient.sendInteractiveButtons(
        phone,
        msg("symptom_worse", l),
        [
          { id: "sym_chest", title: btns[0] || "Chest pain" },
          { id: "sym_breath", title: btns[1] || "Breathing issue" },
          { id: "sym_swell", title: btns[2] || "Swelling" },
        ],
        "Symptoms"
      );
    } else if (session.feelingScore === 3) {
      const btns = msg("symptom_buttons_same", l).split("|");
      await whatsappClient.sendInteractiveButtons(
        phone,
        msg("symptom_same", l),
        [
          { id: "sym_fatigue", title: btns[0] || "Tired/weak" },
          { id: "sym_dizzy", title: btns[1] || "Dizzy" },
          { id: "sym_none", title: btns[2] || "Nothing new" },
        ],
        "Quick Check"
      );
    } else {
      // Feeling better — skip symptoms
      session.symptoms = [];
      session.step = "medication";
      sessions.set(phone, session);
      await whatsappClient.sendText(phone, "That's great to hear! 🎉 Keep it up.");
      await this.delay(1000);
      await this.askMedication(phone, abhaId, session, lang);
    }
  }

  private async processSymptomResponse(phone: string, abhaId: string, buttonId: string, session: Session, lang: string): Promise<void> {
    const symptomMap: Record<string, string> = {
      sym_chest: "chest_pain",
      sym_breath: "breathing_difficulty",
      sym_swell: "leg_swelling",
      sym_fatigue: "fatigue",
      sym_dizzy: "dizziness",
      sym_none: "none",
    };

    const symptom = symptomMap[buttonId] || "unknown";
    if (symptom !== "none") {
      session.symptoms.push(symptom);
    }

    // For serious symptoms, ask for more detail
    if (["chest_pain", "breathing_difficulty"].includes(symptom)) {
      session.step = "symptom_detail";
      sessions.set(phone, session);
      await whatsappClient.sendText(phone,
        "⚠️ That's important to note.\n\n*Can you describe it briefly?*\n(e.g., \"pain when walking\" or \"breathless at rest\")\n\nOr type \"skip\" to continue.");
      return;
    }

    session.step = "medication";
    sessions.set(phone, session);
    await this.askMedication(phone, abhaId, session, lang);
  }

  private async askMedication(phone: string, abhaId: string, session: Session, lang: string): Promise<void> {
    const l = session.language || lang;
    const state = await dynamoRepository.getPatientState(abhaId);
    const meds = state?.medications || [];

    let medList = "";
    if (meds.length > 0) {
      medList = (meds as any[]).map((m: any) =>
        `  💊 ${m.generic_name} ${m.dosage} (${m.time})`
      ).join("\n");
    }

    const body = msg("med_ask", l, { meds: medList || "Your prescribed medicines" });
    const btns = msg("med_buttons", l).split("|");

    await whatsappClient.sendInteractiveButtons(
      phone,
      body,
      [
        { id: "med_all", title: btns[0] || "Yes, all taken" },
        { id: "med_some", title: btns[1] || "Missed some" },
        { id: "med_none", title: btns[2] || "Not taken" },
      ],
      "Medications"
    );
  }

  private async processMedicationResponse(phone: string, abhaId: string, buttonId: string, session: Session, lang: string): Promise<void> {
    const l = session.language || lang;
    switch (buttonId) {
      case "med_all": session.medTaken = true; break;
      case "med_some": session.medTaken = false; break;
      case "med_none": session.medTaken = false; break;
    }

    session.step = "vitals";
    sessions.set(phone, session);

    const btns = msg("vitals_buttons", l).split("|");

    await whatsappClient.sendInteractiveButtons(
      phone,
      msg("vitals_ask", l),
      [
        { id: "vital_skip", title: btns[0] || "Skip & finish" },
        { id: "vital_bp", title: btns[1] || "Enter BP" },
        { id: "vital_sugar", title: btns[2] || "Enter sugar" },
      ],
      "Vitals"
    );
  }

  private async processVitalsButton(phone: string, abhaId: string, buttonId: string, session: Session, lang: string): Promise<void> {
    if (buttonId === "vital_skip") {
      await this.completeCheckIn(phone, abhaId, session, lang);
    } else if (buttonId === "vital_bp") {
      await whatsappClient.sendText(phone, "Please type your BP reading (e.g., *130/85*):");
    } else if (buttonId === "vital_sugar") {
      await whatsappClient.sendText(phone, "Please type your blood sugar reading (e.g., *140 mg/dL*):");
    }
  }

  private async parseVitals(phone: string, abhaId: string, text: string, session: Session, lang: string): Promise<void> {
    const lower = text.toLowerCase();
    if (lower === "skip" || lower === "done") {
      await this.completeCheckIn(phone, abhaId, session, lang);
      return;
    }

    // Parse BP (format: 130/85)
    const bpMatch = text.match(/(\d{2,3})\s*[\/\\]\s*(\d{2,3})/);
    if (bpMatch) {
      session.vitals.bp = `${bpMatch[1]}/${bpMatch[2]}`;
      await whatsappClient.sendText(phone, `✅ BP recorded: ${session.vitals.bp} mmHg`);
    }

    // Parse sugar (just a number)
    const sugarMatch = text.match(/(\d{2,3})\s*(mg)?/i);
    if (sugarMatch && !bpMatch) {
      session.vitals.sugar = `${sugarMatch[1]} mg/dL`;
      await whatsappClient.sendText(phone, `✅ Sugar recorded: ${session.vitals.sugar}`);
    }

    sessions.set(phone, session);
    await this.delay(1500);
    await this.completeCheckIn(phone, abhaId, session, lang);
  }

  // ================================================================
  // CHECK-IN COMPLETION & RISK SCORING
  // ================================================================

  private async completeCheckIn(phone: string, abhaId: string, session: Session, lang: string): Promise<void> {
    session.step = "complete";
    sessions.set(phone, session);

    const day = session.dayNumber;
    const feelText = session.feelingScore <= 2 ? "Better 😊" : session.feelingScore <= 3 ? "Same 😐" : "Worse 😟";
    const sympText = session.symptoms.length > 0 ? session.symptoms.map(s => s.replace(/_/g, " ")).join(", ") : "None";
    const medText = session.medTaken === true ? "All taken ✅" : session.medTaken === false ? "Missed ❌" : "Not reported";
    const vitalLines: string[] = [];
    if (session.vitals.bp) vitalLines.push(`BP: ${session.vitals.bp}`);
    if (session.vitals.sugar) vitalLines.push(`Sugar: ${session.vitals.sugar}`);
    const vitalsText = vitalLines.length > 0 ? vitalLines.join(" | ") : "Not provided";

    // Get risk score from agent service
    let riskText = "";
    try {
      const riskResult = await agentBridge.getRiskScore(abhaId);
      if (riskResult) {
        const tierEmoji = riskResult.tier === "GREEN" ? "🟢" : riskResult.tier === "ORANGE" ? "🟠" : "🔴";
        riskText = `\nRisk Score: ${tierEmoji} ${riskResult.tier} (${(riskResult.score * 100).toFixed(0)}%)`;
      }
    } catch { /* non-critical */ }

    // Send summary with risk score
    await whatsappClient.sendText(phone,
      `✅ *Check-in Complete — Day ${day}*\n\n` +
      `Feeling: ${feelText}\n` +
      `Symptoms: ${sympText}\n` +
      `Medications: ${medText}\n` +
      `Vitals: ${vitalsText}${riskText}\n\n` +
      `_Your data has been recorded. Our AI is monitoring your health._\n\n` +
      `💬 Type *report* for full history | *stop* to end`
    );

    // Log to DynamoDB
    try {
      await dynamoRepository.appendEvent(abhaId, "checkin_completed", "daily_pulse", {
        day, feeling_score: session.feelingScore, symptoms: session.symptoms,
        symptom_detail: session.symptomDetail, med_taken: session.medTaken,
        vitals: session.vitals,
      });
    } catch (e) { logger.warn({ e }, "Failed to log checkin event"); }

    // Store daily report in PostgreSQL for patient history
    try {
      const episode = await prismaRepository.getActiveEpisode(abhaId);
      if (episode) {
        await prismaRepository.createDailyReport({
          patientAbhaId: abhaId,
          episodeId: episode.id,
          dayNumber: day,
          feelingScore: session.feelingScore,
          symptoms: session.symptoms,
          symptomDetail: session.symptomDetail || undefined,
          medTaken: session.medTaken ?? true,
          vitals: session.vitals.bp || session.vitals.sugar ? session.vitals : undefined,
          source: "whatsapp",
        });
        logger.info({ abhaId, day }, "Daily report stored in PostgreSQL");
      }
    } catch (e) { logger.warn({ e }, "Failed to store daily report"); }

    // Trigger risk assessment pipeline
    try {
      const { patientService } = await import("./patient.service.js");
      await patientService.processPulseResponse({
        abhaId,
        feelingScore: session.feelingScore,
        medTaken: session.medTaken ?? true,
        freeText: [...session.symptoms, session.symptomDetail].filter(Boolean).join("; "),
        source: "patient",
      });
      logger.info({ abhaId, feelingScore: session.feelingScore }, "Risk pipeline triggered");
    } catch (e) { logger.error({ e, abhaId }, "Failed to trigger risk pipeline"); }

    // Also directly update PostgreSQL episode with risk score from agent service
    try {
      const riskResult = await agentBridge.getRiskScore(abhaId);
      if (riskResult) {
        const episode = await prismaRepository.getActiveEpisode(abhaId);
        if (episode) {
          await prismaRepository.updateEpisode(episode.id, {
            riskScore: riskResult.score,
            riskTier: riskResult.tier,
          });
          logger.info({ abhaId, score: riskResult.score, tier: riskResult.tier }, "Risk score synced to PostgreSQL");

          // If RED zone — alert caregiver
          if (riskResult.tier === "RED") {
            await this.alertCaregiver(phone, abhaId, riskResult.score);
          }
        }
      }
    } catch (e) { logger.warn({ e }, "Risk sync failed (non-critical)"); }

    // Critical symptom alerts
    if (session.symptoms.includes("chest_pain") || session.symptoms.includes("breathing_difficulty")) {
      await this.delay(2000);
      await whatsappClient.sendText(phone,
        "🚨 *ALERT:* Your reported symptoms need attention.\n\n" +
        "• If pain is severe or worsening → *Call 108* (ambulance)\n" +
        "• If manageable → Your care team has been notified and will call you within 2 hours\n\n" +
        "_Do NOT ignore chest pain or breathlessness._");
    }

    // Medication non-adherence follow-up
    if (session.medTaken === false) {
      await this.delay(3000);
      await whatsappClient.sendText(phone,
        "💊 *About your missed medicines:*\n\n" +
        "Taking medicines regularly is very important for your heart recovery.\n\n" +
        "If you're having trouble:\n" +
        "• *Cost issue?* → We can find cheaper generics at Jan Aushadhi stores near you\n" +
        "• *Side effects?* → Tell your doctor, don't stop on your own\n" +
        "• *Forgot?* → Set a phone alarm for medicine times\n\n" +
        "Reply *\"pharmacy\"* to find nearest affordable pharmacy.");
    }

    // Switch to chat mode
    session.step = "chat";
    sessions.set(phone, session);
  }

  // ================================================================
  // FREE-TEXT MEDICAL CHATBOT
  // ================================================================

  private async handleMedicalQuery(phone: string, abhaId: string, text: string, session: Session, lang: string): Promise<void> {
    const lower = text.toLowerCase();

    // Handle common queries locally (fast, no AI needed)
    if (lower.includes("pharmacy") || lower.includes("medicine") && lower.includes("buy")) {
      await this.sendPharmacyInfo(phone);
      return;
    }

    if (lower.includes("report") || lower.includes("history") || lower.includes("summary") || lower.includes("progress")) {
      await this.sendPatientReport(phone, abhaId);
      return;
    }

    if (lower.includes("lab") || lower.includes("test") || lower.includes("blood test")) {
      await this.sendLabInfo(phone, abhaId);
      return;
    }

    if (lower.includes("doctor") || lower.includes("appointment") || lower.includes("teleconsult")) {
      await this.sendTeleconsultInfo(phone);
      return;
    }

    if (lower.includes("emergency") || lower.includes("108") || lower.includes("ambulance")) {
      await this.handleEmergency(phone, abhaId);
      return;
    }

    // For other queries, use Bedrock Claude for AI response
    try {
      const state = await dynamoRepository.getPatientState(abhaId);
      const context = state ? `Patient: Day ${state.current_day} post-MI, ${state.risk_tier} risk, meds: ${(state.medications as any[])?.map((m: any) => m.generic_name).join(", ")}` : "";

      const aiResponse = await agentBridge.translateText(
        `Patient asks: "${text}". Context: ${context}. Give a brief, helpful, non-alarming response in 2-3 sentences. If serious, advise calling doctor. Do NOT diagnose.`,
        "en",
        "medical_chat"
      );

      if (aiResponse && !aiResponse.includes("unavailable")) {
        await whatsappClient.sendText(phone, `💬 ${aiResponse}\n\n_This is general guidance. For specific concerns, consult your doctor._`);
      } else {
        await whatsappClient.sendText(phone,
          "💬 Thank you for your question. For specific medical advice, please:\n\n" +
          "• Reply *\"doctor\"* to book a teleconsult\n" +
          "• Reply *\"pharmacy\"* for medicine help\n" +
          "• Reply *\"lab\"* for test booking\n" +
          "• Call *108* for emergencies");
      }
    } catch (e) {
      await whatsappClient.sendText(phone,
        "💬 I noted your message. Your care team will review it.\n\nFor urgent issues, call 108.");
    }
  }

  // ================================================================
  // UTILITY RESPONSES
  // ================================================================

  private async sendPatientReport(phone: string, abhaId: string): Promise<void> {
    try {
      const reports = await prismaRepository.getDailyReports(abhaId);

      if (reports.length === 0) {
        await whatsappClient.sendText(phone, "📋 No check-in data recorded yet. Complete your daily check-in to build your health report.");
        return;
      }

      let reportText = "📋 *Your Health Report*\n━━━━━━━━━━━━━━━━━━━━\n\n";

      for (const r of reports.slice(-10)) { // Last 10 days
        const feelEmoji = r.feelingScore <= 2 ? "😊" : r.feelingScore <= 3 ? "😐" : "😟";
        const medEmoji = r.medTaken ? "✅" : "❌";
        const symptoms = r.symptoms.length > 0 ? r.symptoms.join(", ") : "none";
        const vitals = r.vitals ? Object.entries(r.vitals as Record<string, string>).map(([k, v]) => `${k}:${v}`).join(" ") : "";

        reportText += `*Day ${r.dayNumber}:* ${feelEmoji} | Meds: ${medEmoji} | Symptoms: ${symptoms}${vitals ? ` | ${vitals}` : ""}\n`;
      }

      const adherenceCount = reports.filter((r: any) => r.medTaken).length;
      const adherenceRate = Math.round((adherenceCount / reports.length) * 100);

      reportText += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      reportText += `📊 *Summary (${reports.length} days):*\n`;
      reportText += `  💊 Medication adherence: ${adherenceRate}%\n`;
      reportText += `  📈 Check-ins completed: ${reports.length}\n`;
      reportText += `\n_Share this with your doctor at your next visit._`;

      await whatsappClient.sendText(phone, reportText);
    } catch (e) {
      await whatsappClient.sendText(phone, "📋 Unable to generate report right now. Please try again later.");
    }
  }

  private async sendPharmacyInfo(phone: string): Promise<void> {
    await whatsappClient.sendText(phone,
      "💊 *Nearest Jan Aushadhi Stores (Affordable Generics):*\n\n" +
      "1️⃣ *Jan Aushadhi Kendra, Pune Station*\n" +
      "   📍 Platform 1, Pune Railway Station\n" +
      "   🕐 8 AM - 8 PM\n" +
      "   📞 020-26126000\n\n" +
      "2️⃣ *PMBJP Store, Shivajinagar*\n" +
      "   📍 Near Shivajinagar Bus Stand\n" +
      "   🕐 9 AM - 9 PM\n" +
      "   📞 020-25510000\n\n" +
      "💡 *Tip:* Show your prescription at any Jan Aushadhi store. Same medicines at 50-90% lower cost!\n\n" +
      "🗺️ Find more: https://janaushadhi.gov.in/StoreLocator");
  }

  private async sendLabInfo(phone: string, abhaId: string): Promise<void> {
    const state = await dynamoRepository.getPatientState(abhaId);
    const demoData = getDemoDischargeData();
    const labs = demoData.parsed.labFollowUps;

    const labList = labs.map(l => `  🧪 ${l.test} — Due Day ${l.dueDay}`).join("\n");

    await whatsappClient.sendText(phone,
      `🧪 *Your Upcoming Lab Tests:*\n\n${labList}\n\n` +
      `*Nearest NABL Labs:*\n\n` +
      `1️⃣ *SRL Diagnostics, Pune*\n` +
      `   📍 JM Road, Shivajinagar\n` +
      `   📞 1800-222-000\n` +
      `   🌐 Book: https://www.srl.in\n\n` +
      `2️⃣ *Thyrocare (Home Collection)*\n` +
      `   📞 1800-843-800\n` +
      `   🌐 Book: https://www.thyrocare.com\n\n` +
      `💡 Show your ABHA ID for linked insurance coverage.`);
  }

  private async sendTeleconsultInfo(phone: string): Promise<void> {
    await whatsappClient.sendText(phone,
      "👨‍⚕️ *Teleconsult Options:*\n\n" +
      "1️⃣ *eSanjeevani (Free - Government)*\n" +
      "   🌐 https://esanjeevani.mohfw.gov.in\n" +
      "   📱 Download eSanjeevani app\n" +
      "   ⏰ Available 8 AM - 8 PM\n\n" +
      "2️⃣ *Your Hospital Follow-up*\n" +
      "   📞 Call Ruby Hall Clinic: 020-26163391\n" +
      "   Ask for cardiology OPD appointment\n\n" +
      "💡 Your next scheduled follow-up: Day 14\n\n" +
      "_If this is urgent, reply \"emergency\"_");
  }

  private async alertCaregiver(patientPhone: string, abhaId: string, riskScore: number): Promise<void> {
    // Alert the registered caregiver (918697384274)
    const CAREGIVER_PHONE = "918697384274";
    try {
      const patient = await prismaRepository.getPatientByAbhaId(abhaId);
      const patientName = patient?.nameEncrypted || "Your family member";

      await whatsappClient.sendText(CAREGIVER_PHONE,
        `🚨 *NovaCare Alert — ${patientName}*\n\n` +
        `Risk Level: *RED* (Score: ${riskScore.toFixed(2)})\n\n` +
        `Your family member's health condition needs immediate attention.\n\n` +
        `Please:\n` +
        `• Check on them immediately\n` +
        `• Ensure they take their medicines\n` +
        `• If they have chest pain or breathing issues → Call 108\n\n` +
        `_This is an automated alert from NovaCare._`
      );
      logger.info({ abhaId, caregiver: CAREGIVER_PHONE }, "Caregiver alerted for RED zone");
    } catch (e) {
      logger.error({ e }, "Failed to alert caregiver");
    }
  }

  private async handleEmergency(phone: string, abhaId: string): Promise<void> {
    await whatsappClient.sendText(phone,
      "🚨 *EMERGENCY CONTACTS:*\n\n" +
      "🚑 *Ambulance:* 108\n" +
      "🏥 *Ruby Hall Clinic Emergency:* 020-26163391\n" +
      "👨‍⚕️ *Poison Control:* 1800-116-117\n\n" +
      "⚠️ *Call 108 immediately if you have:*\n" +
      "• Severe chest pain\n" +
      "• Cannot breathe\n" +
      "• Sudden weakness on one side\n" +
      "• Loss of consciousness\n\n" +
      "_Your care team has been alerted._");

    // Alert the hospital dashboard
    try {
      const episode = await prismaRepository.getActiveEpisode(abhaId);
      if (episode) {
        await prismaRepository.createEscalation({
          patientAbhaId: abhaId,
          episodeId: episode.id,
          tier: "RED",
          triggerReason: "Patient reported emergency via WhatsApp",
          shapExplanation: "Patient-initiated emergency alert",
          recommendedAction: "Immediate callback required. Verify patient safety.",
        });
      }
    } catch (e) { logger.error({ e }, "Failed to create emergency escalation"); }
  }

  private async handleCompletedJourney(phone: string, abhaId: string): Promise<void> {
    await whatsappClient.sendText(phone,
      "🎉 *Congratulations!*\n\n" +
      "You've completed your 30-day recovery program with NovaCare!\n\n" +
      "📋 Your care summary has been shared with your doctor.\n" +
      "📊 Overall adherence and progress report is available.\n\n" +
      "Continue taking your medicines and follow up with your cardiologist as scheduled.\n\n" +
      "Thank you for trusting NovaCare! 🏥💙");
  }

  // ================================================================
  // HELPERS
  // ================================================================

  private isEmergency(text: string): boolean {
    const emergencyWords = ["emergency", "dying", "cant breathe", "cannot breathe", "heart attack", "unconscious", "108", "severe pain", "help me"];
    return emergencyWords.some(w => text.includes(w));
  }

  private createSession(dayNumber: number): Session {
    return {
      step: "language",
      language: "en",
      dayNumber,
      feelingScore: 3,
      symptoms: [],
      symptomDetail: "",
      medTaken: null,
      medsMissed: [],
      vitals: {},
      carePlanSent: false,
      lastActivity: Date.now(),
    };
  }

  private calculateDayNumber(dischargeDate: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - dischargeDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const whatsappFlowService = new WhatsAppFlowService();
