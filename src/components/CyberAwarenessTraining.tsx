/**
 * LitSecure Sentinel — Cyber Awareness Training Hub (Phase 3)
 * Kaspersky-style phishing simulation, staff security training,
 * and awareness campaign management for Malawian organisations.
 */
import React, { useState, useEffect } from "react";
import {
  BookOpen, Target, Trophy, Users, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, Play, RefreshCw,
  Mail, Globe, Phone, Shield, Zap, TrendingUp,
  Clock, Award, Star, Lock, Eye, EyeOff
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrainingModule {
  id:          string;
  title:       string;
  category:    string;
  duration:    number; // minutes
  difficulty:  "Beginner" | "Intermediate" | "Advanced";
  description: string;
  icon:        React.ElementType;
  color:       string;
  topics:      string[];
  malawiContext: string;
}

interface PhishingScenario {
  id:         string;
  type:       "email" | "sms" | "call";
  difficulty: "Easy" | "Medium" | "Hard";
  sender:     string;
  subject:    string;
  preview:    string;
  isPhishing: boolean;
  clues:      string[];
  explanation: string;
}

interface QuizQuestion {
  id:       string;
  question: string;
  options:  string[];
  correct:  number;
  explanation: string;
}

// ─── Training Modules Data ────────────────────────────────────────────────────

const MODULES: TrainingModule[] = [
  {
    id: "phishing-101",
    title: "Phishing & Social Engineering",
    category: "Email Security",
    duration: 20,
    difficulty: "Beginner",
    description: "Identify and avoid phishing attacks in emails, SMS, and calls",
    icon: Mail,
    color: "text-red-400 bg-red-500/10 border-red-500/25",
    topics: ["Email red flags", "SMS phishing (smishing)", "Voice phishing (vishing)", "Reporting procedures"],
    malawiContext: "Attackers impersonate Airtel, TNM, SBM, and NBS Bank to steal credentials and mobile money.",
  },
  {
    id: "mobile-money",
    title: "Mobile Money Fraud Prevention",
    category: "Financial Security",
    duration: 15,
    difficulty: "Beginner",
    description: "Protect Airtel Money & TNM Mpamba accounts from fraud",
    icon: Phone,
    color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/25",
    topics: ["SIM swap fraud", "Mobile money scams", "PIN security", "Recognising fake agents"],
    malawiContext: "Over 60% of Malawi cybercrime reports involve mobile money fraud. TNM and Airtel agents will NEVER ask for your PIN.",
  },
  {
    id: "password-security",
    title: "Password & Account Security",
    category: "Access Control",
    duration: 25,
    difficulty: "Beginner",
    description: "Create strong passwords and enable two-factor authentication",
    icon: Lock,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/25",
    topics: ["Password strength", "Password managers", "2FA/MFA setup", "Account recovery"],
    malawiContext: "Many Malawian government portal breaches involved default or reused passwords.",
  },
  {
    id: "ransomware",
    title: "Ransomware Response",
    category: "Incident Response",
    duration: 30,
    difficulty: "Intermediate",
    description: "Recognise, contain, and recover from ransomware attacks",
    icon: AlertTriangle,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/25",
    topics: ["How ransomware spreads", "Early warning signs", "Containment steps", "Reporting to MACERT"],
    malawiContext: "Ransomware targeting healthcare and government institutions is rising. Report immediately to MACERT on +265 1 770 411.",
  },
  {
    id: "data-handling",
    title: "Secure Data Handling",
    category: "Data Protection",
    duration: 20,
    difficulty: "Intermediate",
    description: "Handle sensitive citizen and institutional data correctly",
    icon: Shield,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    topics: ["Data classification", "Secure file sharing", "Clear-screen policy", "GDPR/Malawi DPA compliance"],
    malawiContext: "Malawi's Data Protection Act (2024) creates legal obligations for handling citizen data.",
  },
  {
    id: "incident-reporting",
    title: "Incident Reporting Procedures",
    category: "Incident Response",
    duration: 10,
    difficulty: "Beginner",
    description: "Know when and how to report a cyber incident",
    icon: Zap,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/25",
    topics: ["What counts as an incident", "MACERT reporting", "Internal escalation", "Evidence preservation"],
    malawiContext: "All Critical/High incidents must be reported to MACERT within 2 hours per MACRA guidelines.",
  },
];

// ─── Phishing Scenarios ───────────────────────────────────────────────────────

const PHISHING_SCENARIOS: PhishingScenario[] = [
  {
    id: "s1",
    type: "email",
    difficulty: "Easy",
    sender: "airtel-support@airte1.mw",
    subject: "⚠️ Your Airtel Money Account Has Been Suspended",
    preview: "Dear Customer, Your Airtel Money account has been suspended due to suspicious activity. Click the link below immediately to verify your identity and restore access: http://airtel-secure-mw.tk/verify",
    isPhishing: true,
    clues: ["Sender domain is airte1.mw (not airtel.mw) — typosquat", "Unsolicited urgency / threat", "Link goes to .tk domain, not airtel.mw", "Real Airtel never asks you to click a link via email"],
    explanation: "This is a phishing email. The sender domain 'airte1.mw' has a number '1' instead of the letter 'l'. The .tk domain link is a common sign of a phishing site. Airtel contacts customers through the official app or SMS, not unsolicited emails with external links.",
  },
  {
    id: "s2",
    type: "sms",
    difficulty: "Medium",
    sender: "+265 999 100 200",
    subject: "TNM ALERT",
    preview: "Dear TNM customer, you have won MWK 500,000 in our anniversary draw! To claim, send your NRC and Mpamba PIN to confirm your identity. Reply NOW or prize expires in 1 hour.",
    isPhishing: true,
    clues: ["TNM never runs prize draws via unsolicited SMS", "Asking for your PIN is NEVER legitimate", "Urgency to 'reply now' is a pressure tactic", "Requesting NRC details via SMS is suspicious"],
    explanation: "This is a smishing (SMS phishing) attack. TNM, Airtel and any legitimate organisation will NEVER ask for your Mpamba/Airtel Money PIN. No legitimate prize requires you to share your NRC or PIN. Delete and report to 8788 (TNM fraud line).",
  },
  {
    id: "s3",
    type: "email",
    difficulty: "Hard",
    sender: "it-helpdesk@macra.mw",
    subject: "IT Security: Mandatory Password Reset — Action Required by 5PM",
    preview: "Dear MACRA staff, as part of our quarterly security audit, all staff must reset passwords before 17:00 today. Use the secure portal: https://macra.mw/password-reset to complete this. Failure to comply will result in account lockout. — IT Department",
    isPhishing: false,
    clues: ["Sender is the real @macra.mw domain", "Link goes to macra.mw (not a lookalike)", "Quarterly password resets are a real IT practice", "Language is formal and professional"],
    explanation: "This is a LEGITIMATE email. The sender domain is correct (@macra.mw), the link goes to the real macra.mw site, and mandatory password resets are a standard IT security practice. However, always verify with IT directly if unsure — call them rather than clicking the link.",
  },
  {
    id: "s4",
    type: "call",
    difficulty: "Medium",
    sender: "Caller claiming to be 'MACRA Security Team'",
    subject: "Phone Call",
    preview: "'Hello, I am calling from MACRA Security. We have detected that your work account was accessed from China. I need your username and password immediately to block the attacker before they steal all government data.'",
    isPhishing: true,
    clues: ["MACRA/IT will NEVER ask for your password over the phone", "Creating panic ('China hackers') to rush you", "Legitimate IT staff have other ways to lock accounts — they don't need your password", "Unable to verify caller identity"],
    explanation: "This is a vishing (voice phishing) attack. No legitimate IT or security team will ever ask for your password over the phone. They can lock accounts, reset passwords, and investigate breaches without knowing your credentials. Hang up and call IT directly using a known phone number.",
  },
];

// ─── Quiz Questions ───────────────────────────────────────────────────────────

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "You receive an SMS from 'TNM' asking for your Mpamba PIN to verify your account. What should you do?",
    options: ["Reply with your PIN immediately", "Ignore the message and delete it", "Call TNM's official line (8788) to report it", "Share your PIN only if the message looks official"],
    correct: 2,
    explanation: "Always call the official TNM fraud line (8788) to report suspicious messages. TNM will NEVER ask for your PIN via SMS.",
  },
  {
    id: "q2",
    question: "Which of these email senders is a phishing indicator?",
    options: ["support@airtel.mw", "noreply@macra.mw", "billing@sbm-malaŵi.com", "alerts@rbm.mw"],
    correct: 2,
    explanation: "The domain 'sbm-malaŵi.com' uses a special character (ŵ) in the domain name — a common trick to make URLs look legitimate. Real SBM domains use only standard ASCII characters.",
  },
  {
    id: "q3",
    question: "Your computer suddenly shows all your files have been encrypted. You see a message demanding Bitcoin payment. What is the FIRST step?",
    options: ["Pay the ransom immediately", "Try to decrypt the files yourself", "Disconnect from the network immediately and call MACERT", "Restart the computer"],
    correct: 2,
    explanation: "First, disconnect from the network (unplug ethernet or turn off WiFi) to stop the ransomware from spreading. Then call MACERT (+265 1 770 411). Do NOT pay the ransom — it encourages attackers and does not guarantee file recovery.",
  },
  {
    id: "q4",
    question: "How often should you change your work account password?",
    options: ["Never — a good password lasts forever", "Every 90 days or immediately if compromised", "Daily", "Only when IT forces you to"],
    correct: 1,
    explanation: "Best practice is to change passwords every 90 days or immediately if you suspect compromise. Using a password manager makes this easy.",
  },
  {
    id: "q5",
    question: "You find a USB drive in the car park with 'MACRA SALARY SLIPS 2024' written on it. What do you do?",
    options: ["Plug it in to see if it belongs to a colleague", "Take it to IT security without plugging it in", "Leave it on the reception desk", "Format and keep it"],
    correct: 1,
    explanation: "USB drives can contain malware (called 'baiting'). Take it directly to IT security without plugging it in anywhere. Never plug in unknown USB devices.",
  },
];

// ─── Progress Store ───────────────────────────────────────────────────────────

function getProgress() {
  try { return JSON.parse(localStorage.getItem("ct_progress") ?? "{}"); } catch { return {}; }
}
function setProgress(id: string, val: any) {
  const p = getProgress();
  p[id] = val;
  localStorage.setItem("ct_progress", JSON.stringify(p));
}

// ─── Difficulty Badge ─────────────────────────────────────────────────────────

function DiffBadge({ d }: { d: string }) {
  const c = d === "Beginner" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
    : d === "Intermediate" || d === "Medium" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/25"
    : "text-red-400 bg-red-500/10 border-red-500/25";
  return <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded border ${c}`}>{d.toUpperCase()}</span>;
}

// ─── Module Card ──────────────────────────────────────────────────────────────

interface ModuleCardProps {
  mod:      TrainingModule;
  progress: any;
  onStart:  (id: string) => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ mod, progress, onStart }) => {
  const done = progress[mod.id]?.completed;
  const score = progress[mod.id]?.score;
  const Icon = mod.icon;

  return (
    <div className={`rounded-xl border bg-[#05080F]/60 p-4 space-y-3 transition-all hover:border-white/15 ${
      done ? "border-emerald-500/20" : "border-white/8"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${mod.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-100 truncate">{mod.title}</p>
            {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          </div>
          <p className="text-[10px] text-slate-500 font-mono">{mod.category}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">{mod.description}</p>

      {/* Context */}
      <div className="bg-[#FFD600]/5 border border-[#FFD600]/15 rounded-lg px-3 py-2">
        <p className="text-[9px] font-mono text-[#FFD600]/70 uppercase tracking-wider mb-0.5">🇲🇼 Malawi Context</p>
        <p className="text-[10px] text-slate-400">{mod.malawiContext}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <DiffBadge d={mod.difficulty} />
        <span className="text-[9px] font-mono text-slate-500 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> {mod.duration} min
        </span>
        {score !== undefined && (
          <span className="text-[9px] font-bold font-mono text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded ml-auto">
            Score: {score}%
          </span>
        )}
      </div>

      <button
        onClick={() => onStart(mod.id)}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold font-mono transition ${
          done
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
            : "bg-blue-600 hover:bg-blue-500 text-white"
        }`}
      >
        {done ? <><RefreshCw className="w-3.5 h-3.5" /> Retake</> : <><Play className="w-3.5 h-3.5" /> Start Module</>}
      </button>
    </div>
  );
};

// ─── Phishing Simulator ───────────────────────────────────────────────────────

function PhishingSimulator() {
  const [idx,     setIdx]     = useState(0);
  const [answer,  setAnswer]  = useState<boolean | null>(null);
  const [score,   setScore]   = useState(0);
  const [showClues, setShowClues] = useState(false);
  const [done,    setDone]    = useState(false);

  const scenario = PHISHING_SCENARIOS[idx];

  const TypeIcon = scenario.type === "email" ? Mail : scenario.type === "sms" ? Phone : Globe;

  const submit = (isPhishing: boolean) => {
    setAnswer(isPhishing);
    if (isPhishing === scenario.isPhishing) setScore(s => s + 1);
  };

  const next = () => {
    if (idx + 1 >= PHISHING_SCENARIOS.length) { setDone(true); return; }
    setIdx(i => i + 1);
    setAnswer(null);
    setShowClues(false);
  };

  const reset = () => { setIdx(0); setAnswer(null); setScore(0); setShowClues(false); setDone(false); };

  if (done) {
    const pct = Math.round((score / PHISHING_SCENARIOS.length) * 100);
    return (
      <div className="text-center py-10 space-y-4">
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl font-bold ${
          pct >= 75 ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"
        }`}>{pct}%</div>
        <h3 className="text-lg font-bold text-white font-mono">{score}/{PHISHING_SCENARIOS.length} Correct</h3>
        <p className="text-sm text-slate-400">
          {pct >= 75 ? "Excellent! You can spot phishing attacks." : "Keep practicing — phishing detection takes time."}
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={reset} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>Scenario {idx + 1} of {PHISHING_SCENARIOS.length}</span>
        <span className="text-emerald-400">Score: {score}/{idx}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${((idx) / PHISHING_SCENARIOS.length) * 100}%` }} />
      </div>

      {/* Message card */}
      <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-white/8">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            scenario.type === "email" ? "bg-blue-500/20 text-blue-400" : scenario.type === "sms" ? "bg-green-500/20 text-green-400" : "bg-purple-500/20 text-purple-400"
          }`}>
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">{scenario.type}</p>
            <p className="text-xs font-mono text-slate-300">{scenario.sender}</p>
          </div>
          <DiffBadge d={scenario.difficulty} />
        </div>
        {scenario.subject && (
          <p className="text-sm font-bold text-slate-200">{scenario.subject}</p>
        )}
        <p className="text-[11px] text-slate-400 leading-relaxed">{scenario.preview}</p>

        {/* Clues toggle */}
        <button onClick={() => setShowClues(v => !v)}
          className="flex items-center gap-1.5 text-[10px] font-mono text-[#FFD600]/60 hover:text-[#FFD600] transition">
          {showClues ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showClues ? "Hide" : "Show"} Investigation Hints
        </button>
        {showClues && (
          <div className="bg-[#FFD600]/5 border border-[#FFD600]/15 rounded-lg p-3 space-y-1">
            {scenario.clues.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono text-[#FFD600]/80">
                <span className="text-[#FFD600]/40 shrink-0">→</span> {c}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Answer buttons */}
      {answer === null ? (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => submit(true)}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-bold font-mono hover:bg-red-500/20 transition">
            <AlertTriangle className="w-4 h-4" /> PHISHING
          </button>
          <button onClick={() => submit(false)}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold font-mono hover:bg-emerald-500/20 transition">
            <CheckCircle2 className="w-4 h-4" /> LEGITIMATE
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-xl border p-4 ${
            answer === scenario.isPhishing
              ? "border-emerald-500/30 bg-emerald-500/8"
              : "border-red-500/30 bg-red-500/8"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {answer === scenario.isPhishing
                ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                : <XCircle className="w-5 h-5 text-red-400" />}
              <span className={`text-sm font-bold font-mono ${answer === scenario.isPhishing ? "text-emerald-400" : "text-red-400"}`}>
                {answer === scenario.isPhishing ? "Correct!" : "Incorrect"}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1">
                This was {scenario.isPhishing ? "PHISHING" : "LEGITIMATE"}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">{scenario.explanation}</p>
          </div>
          <button onClick={next}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono transition">
            {idx + 1 < PHISHING_SCENARIOS.length ? <><ChevronRight className="w-4 h-4" /> Next Scenario</> : <><Trophy className="w-4 h-4" /> See Results</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Security Quiz ────────────────────────────────────────────────────────────

function SecurityQuiz() {
  const [idx,    setIdx]    = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score,  setScore]  = useState(0);
  const [done,   setDone]   = useState(false);

  const q = QUIZ_QUESTIONS[idx];

  const pick = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    if (i === q.correct) setScore(s => s + 1);
  };

  const next = () => {
    if (idx + 1 >= QUIZ_QUESTIONS.length) { setDone(true); return; }
    setIdx(i => i + 1);
    setChosen(null);
  };

  const reset = () => { setIdx(0); setChosen(null); setScore(0); setDone(false); };

  if (done) {
    const pct = Math.round((score / QUIZ_QUESTIONS.length) * 100);
    const passed = pct >= 70;
    return (
      <div className="text-center py-10 space-y-4">
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
          passed ? "bg-emerald-500/20" : "bg-red-500/20"
        }`}>
          {passed ? <Trophy className="w-8 h-8 text-emerald-400" /> : <RefreshCw className="w-8 h-8 text-red-400" />}
        </div>
        <div>
          <p className="text-3xl font-bold font-mono text-white">{pct}%</p>
          <p className={`text-sm font-mono mt-1 ${passed ? "text-emerald-400" : "text-red-400"}`}>
            {passed ? "PASSED — Certificate Earned!" : "FAILED — Please Retake"}
          </p>
        </div>
        <p className="text-sm text-slate-400">{score} of {QUIZ_QUESTIONS.length} questions correct</p>
        <div className="flex gap-2 justify-center">
          {passed && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
              <Award className="w-3.5 h-3.5" /> Certificate Awarded
            </div>
          )}
          <button onClick={reset} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>Question {idx + 1} of {QUIZ_QUESTIONS.length}</span>
        <span className="text-emerald-400">Score: {score}/{idx}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full">
        <div className="h-full bg-[#FFD600] rounded-full transition-all" style={{ width: `${(idx / QUIZ_QUESTIONS.length) * 100}%` }} />
      </div>

      <p className="text-sm font-bold text-slate-100">{q.question}</p>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          let cls = "border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/5";
          if (chosen !== null) {
            if (i === q.correct) cls = "border-emerald-500/50 bg-emerald-500/15 text-emerald-300";
            else if (i === chosen && chosen !== q.correct) cls = "border-red-500/50 bg-red-500/15 text-red-300";
            else cls = "border-white/5 text-slate-600";
          }
          return (
            <button key={i} onClick={() => pick(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs font-mono transition ${cls}`}>
              <span className="text-slate-600 mr-2">{String.fromCharCode(65 + i)}.</span> {opt}
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
          <p className="text-[10px] font-mono text-slate-400">{q.explanation}</p>
        </div>
      )}
      {chosen !== null && (
        <button onClick={next}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FFD600] hover:bg-[#FFD600]/90 text-black text-xs font-bold font-mono transition">
          {idx + 1 < QUIZ_QUESTIONS.length ? <><ChevronRight className="w-4 h-4" /> Next Question</> : <><Trophy className="w-4 h-4" /> Finish Quiz</>}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CyberAwarenessTraining() {
  const [tab,      setTab]      = useState<"modules" | "phishing" | "quiz" | "leaderboard">("modules");
  const [progress, setProgressState] = useState<any>({});
  const [activeModule, setActiveModule] = useState<string | null>(null);

  useEffect(() => { setProgressState(getProgress()); }, []);

  const completedCount = Object.values(progress).filter((v: any) => v?.completed).length;
  const totalModules   = MODULES.length;
  const completionPct  = Math.round((completedCount / totalModules) * 100);

  // Mock leaderboard
  const leaderboard = [
    { rank: 1, name: "P. Banda",    org: "MACRA",   score: 98, modules: 6, badge: "🥇" },
    { rank: 2, name: "F. Chirwa",   org: "RBM",     score: 94, modules: 6, badge: "🥈" },
    { rank: 3, name: "M. Zgambo",   org: "Airtel",  score: 91, modules: 5, badge: "🥉" },
    { rank: 4, name: "T. Nkosi",    org: "MACERT",  score: 88, modules: 5, badge: "⭐" },
    { rank: 5, name: "A. Kamanga",  org: "TNM",     score: 85, modules: 4, badge: "⭐" },
  ];

  return (
    <div className="space-y-5" id="cyber-awareness">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0e100a] to-[#0A0E1A] border border-emerald-500/20 p-5">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-1 bg-gradient-to-r from-emerald-500/50 via-[#FFD600]/30 to-transparent" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bebas text-xl text-white tracking-widest">CYBER AWARENESS HUB</h2>
              <p className="text-[10px] text-slate-500 font-mono">Training · Phishing Simulation · Certification · Malawi-specific threat context</p>
            </div>
          </div>
          {/* Progress pill */}
          <div className="sm:ml-auto flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] font-mono text-slate-500">Your Progress</p>
              <p className="text-lg font-bold font-mono text-white">{completionPct}%</p>
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 flex items-center justify-center bg-emerald-500/10 relative">
              <svg className="absolute inset-0" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(16,185,129,0.15)" strokeWidth="3" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="#10b981" strokeWidth="3"
                  strokeDasharray={`${completionPct * 1.257} 125.7`}
                  strokeLinecap="round" transform="rotate(-90 24 24)" />
              </svg>
              <BookOpen className="w-4 h-4 text-emerald-400 relative z-10" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Modules",   val: `${completedCount}/${totalModules}`, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: BookOpen },
          { label: "Scenarios", val: PHISHING_SCENARIOS.length,          color: "text-red-400 bg-red-500/10 border-red-500/20",           icon: Target   },
          { label: "Quiz Qs",   val: QUIZ_QUESTIONS.length,             color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20",      icon: Star     },
          { label: "Partners",  val: "5 CERTs",                          color: "text-blue-400 bg-blue-500/10 border-blue-500/20",         icon: Users    },
        ].map(({ label, val, color, icon: I }) => (
          <div key={label} className={`rounded-xl border p-4 ${color}`}>
            <div className="flex items-center gap-2 mb-1">
              <I className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[10px] uppercase font-mono tracking-wider opacity-60">{label}</span>
            </div>
            <div className="text-xl font-bold font-mono">{val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {([
          { id: "modules",      label: "Modules",    icon: BookOpen },
          { id: "phishing",     label: "Phishing Sim", icon: Target },
          { id: "quiz",         label: "Quiz",        icon: Star   },
          { id: "leaderboard",  label: "Leaderboard", icon: Trophy },
        ] as const).map(t => (
          <button key={t.id} id={`awareness-tab-${t.id}`} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono font-bold transition-all ${
              tab === t.id ? "text-emerald-400 border-b-2 border-emerald-400 -mb-px" : "text-slate-500 hover:text-slate-300"
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* MODULES */}
      {tab === "modules" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {MODULES.map(m => (
            <ModuleCard key={m.id} mod={m} progress={progress}
              onStart={id => {
                setProgress(id, { completed: true, score: Math.floor(70 + Math.random() * 30), completedAt: new Date().toISOString() });
                setProgressState(getProgress());
              }}
            />
          ))}
        </div>
      )}

      {/* PHISHING SIM */}
      {tab === "phishing" && (
        <div className="max-w-xl mx-auto">
          <div className="rounded-xl border border-white/10 bg-[#05080F]/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-red-400" />
              <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest">Phishing Detection Simulator</h3>
            </div>
            <p className="text-[10px] text-slate-500 font-mono mb-4">
              Examine each message and decide: is it phishing or legitimate?
              All scenarios are based on real Malawian cyber threats.
            </p>
            <PhishingSimulator />
          </div>
        </div>
      )}

      {/* QUIZ */}
      {tab === "quiz" && (
        <div className="max-w-xl mx-auto">
          <div className="rounded-xl border border-white/10 bg-[#05080F]/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-[#FFD600]" />
              <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest">Cyber Security Assessment</h3>
            </div>
            <p className="text-[10px] text-slate-500 font-mono mb-4">
              Score 70% or above to earn your Cyber Awareness Certificate.
              Based on Malawian cyber threat scenarios.
            </p>
            <SecurityQuiz />
          </div>
        </div>
      )}

      {/* LEADERBOARD */}
      {tab === "leaderboard" && (
        <div className="max-w-2xl space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#05080F]/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#FFD600]" />
              <span className="text-xs font-bold text-slate-300 font-mono uppercase tracking-widest">Organisation Leaderboard</span>
              <span className="ml-auto text-[9px] font-mono text-slate-600">June 2026</span>
            </div>
            <div className="divide-y divide-white/5">
              {leaderboard.map(entry => (
                <div key={entry.rank} className={`flex items-center gap-3 px-4 py-3 ${entry.rank === 1 ? "bg-[#FFD600]/5" : ""}`}>
                  <span className="text-lg w-6 text-center shrink-0">{entry.badge}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-200">{entry.name}</p>
                    <p className="text-[10px] font-mono text-slate-500">{entry.org}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-[#FFD600]">{entry.score}%</p>
                    <p className="text-[9px] font-mono text-slate-600">{entry.modules}/{totalModules} modules</p>
                  </div>
                  <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-[#FFD600]/60 rounded-full" style={{ width: `${entry.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4 text-[10px] font-mono text-slate-400 space-y-1">
            <p className="text-blue-400 font-bold uppercase tracking-wider text-[9px] mb-2">🏆 Certification Tracks</p>
            <p>• <span className="text-white">Cyber Aware</span> — Complete all Beginner modules + score 70%+ on quiz</p>
            <p>• <span className="text-white">Cyber Defender</span> — Complete all modules + 90%+ phishing sim score</p>
            <p>• <span className="text-white">MACERT Partner</span> — Full curriculum + incident response practicum</p>
          </div>
        </div>
      )}
    </div>
  );
}
