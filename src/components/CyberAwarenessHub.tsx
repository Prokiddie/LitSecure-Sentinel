import React, { useState } from "react";
import {
  BookOpen, Phone, Globe, Lock, AlertTriangle,
  MessageSquare, Shield, ChevronDown, ChevronRight,
  SmartphoneNfc, CreditCard, Eye, Wifi
} from "lucide-react";

interface Guide {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  steps: { heading: string; body: string }[];
  warningSigns: string[];
}

const GUIDES: Guide[] = [
  {
    id: "sim-swap",
    title: "SIM Swap Fraud",
    subtitle: "Protecting your phone number and mobile money",
    icon: SmartphoneNfc,
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    steps: [
      { heading: "What is SIM Swap?", body: "A fraudster goes to an Airtel or TNM shop with fake ID documents and gets your phone number transferred to their new SIM card. Once done, they receive your verification codes and can access your mobile money wallet." },
      { heading: "How to protect yourself", body: "Register a SIM Lock at your operator. Call Airtel (*222#) or TNM (*444#) to set a PIN that is required before any SIM swap can happen. Without this PIN, no one can steal your number even with fake ID." },
      { heading: "What to do if it happens", body: "If your phone suddenly shows no network and you cannot make calls, go immediately to your operator's main office. Bring your National ID. Report the incident to the Malawi Police Service Cybercrime Unit and also to LitSecure." },
    ],
    warningSigns: [
      "Your phone suddenly loses all network signal",
      "You receive an SMS saying 'Your SIM has been transferred'",
      "You cannot dial *211# or *444# anymore",
      "You receive OTP codes you did not request",
    ],
  },
  {
    id: "phishing",
    title: "Phishing Attacks",
    subtitle: "Recognising fake websites and dangerous emails",
    icon: Globe,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    steps: [
      { heading: "What is Phishing?", body: "Someone creates a website or sends an email that looks exactly like MRA, your bank, or Airtel Money — but it is fake. When you enter your password, they steal it immediately." },
      { heading: "Check the web address carefully", body: "Before entering any password, look at the address bar of your browser. The real MRA website is mra.mw — NOT 'mra-portal-mw.online' or 'mra-malawi.com'. Fraudsters add extra words to trick you." },
      { heading: "Never click links in SMS", body: "Banks and MRA will NEVER send you an SMS asking you to click a link and enter your password. If you receive such an SMS, it is always a scam." },
    ],
    warningSigns: [
      "A link in an SMS or WhatsApp asks for your banking password",
      "An email says 'Your account will be closed' — act now!",
      "A website has spelling mistakes or a strange web address",
      "A call asks you to 'verify' your account by giving your PIN",
    ],
  },
  {
    id: "mobile-money",
    title: "Mobile Money Safety",
    subtitle: "Keeping your Airtel Money and TNM Mpamba wallet safe",
    icon: CreditCard,
    color: "text-[#FFD600] bg-[#FFD600]/10 border-[#FFD600]/20",
    steps: [
      { heading: "Never share your PIN", body: "Airtel Money agents, TNM staff, and your bank will NEVER ask for your transaction PIN. If anyone — on the phone, by SMS, or in person — asks for your PIN, refuse immediately and report it." },
      { heading: "Verify big transactions yourself", body: "Before sending K50,000 or more, dial *211# yourself and check your balance first. If something looks wrong, call Airtel customer care on 116 before sending any money." },
      { heading: "Use Agent locations you trust", body: "Only use mobile money agents at well-known shops in your area. Avoid using agents who approach you on the street." },
    ],
    warningSigns: [
      "Someone asks for your 4-digit mobile money PIN",
      "You receive money from an unknown number and they ask you to send it back",
      "An 'agent' calls you to 'confirm' a transaction you did not make",
      "You receive an OTP code but you did not request a transaction",
    ],
  },
  {
    id: "passwords",
    title: "Strong Passwords & Accounts",
    subtitle: "Creating passwords that are hard to crack",
    icon: Lock,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    steps: [
      { heading: "What makes a weak password?", body: "Any password using your name, date of birth, 'malawi', '12345678', or the name of your village is easy to crack. Hackers use programs that try millions of common words in seconds." },
      { heading: "Create a strong password", body: "Use at least 12 characters. Mix uppercase letters, lowercase, numbers, and symbols. For example: 'Lilongwe@Market!2024' is a strong password that is still easy for you to remember." },
      { heading: "Use different passwords everywhere", body: "If you use the same password for email, Facebook, and your bank, and one is stolen — all are stolen. Use a different password for each important account." },
    ],
    warningSigns: [
      "You use the same password on multiple accounts",
      "Your password is your birthday or name",
      "You wrote your password on a piece of paper near your computer",
      "You have not changed your work password in over 1 year",
    ],
  },
];

const HOTLINES = [
  { org: "Malawi Police Service — Cybercrime Unit", number: "+265 (0)1 773 321", hours: "Mon–Fri, 7:30am–5pm" },
  { org: "MACRA Consumer Affairs",                   number: "+265 (0)1 770 244", hours: "Mon–Fri, 7:30am–5pm" },
  { org: "Airtel Malawi Customer Care",              number: "116 (free)",         hours: "24/7" },
  { org: "TNM Mpamba Support",                       number: "111 (free)",         hours: "24/7" },
  { org: "LitSecure Incident Hotline",               number: "Report via App",    hours: "24/7 — Online" },
];

export default function CyberAwarenessHub() {
  const [openGuide, setOpenGuide] = useState<string | null>("sim-swap");

  return (
    <div className="space-y-6" id="cyber-awareness-hub">

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A0E1A] via-[#0d1428] to-[#0A0E1A] border border-[#FFD600]/20 p-6">
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4 relative z-10">
          <div className="w-12 h-12 rounded-xl bg-[#FFD600]/15 border border-[#FFD600]/30 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-[#FFD600]" />
          </div>
          <div>
            <h2 className="font-bebas text-2xl text-white tracking-widest">CYBER AWARENESS HUB</h2>
            <p className="text-xs text-slate-400 leading-relaxed mt-1 max-w-xl">
              Simple, plain-English guides to protect yourself online. These guides are written for Malawian citizens, business owners, and government workers — no technical knowledge required.
            </p>
          </div>
        </div>
      </div>

      {/* Safety Guides — Accordion */}
      <div className="space-y-3">
        {GUIDES.map(guide => {
          const Icon = guide.icon;
          const isOpen = openGuide === guide.id;
          return (
            <div key={guide.id} className={`card border overflow-hidden transition-all ${isOpen ? "border-[#FFD600]/25" : "border-white/8"}`}>
              <button
                id={`guide-toggle-${guide.id}`}
                onClick={() => setOpenGuide(isOpen ? null : guide.id)}
                className="w-full flex items-center gap-4 p-5 text-left"
              >
                <div className={`p-2.5 rounded-lg border shrink-0 ${guide.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{guide.title}</div>
                  <div className="text-[10px] text-slate-500">{guide.subtitle}</div>
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-5 border-t border-white/5 pt-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {guide.steps.map((step, i) => (
                      <div key={i} className="bg-[#05080F]/60 border border-white/5 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#FFD600]/20 border border-[#FFD600]/30 text-[#FFD600] text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-xs font-bold text-white">{step.heading}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{step.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                    <p className="text-xs font-bold text-red-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Warning Signs — Act Immediately If You See These
                    </p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {guide.warningSigns.map((sign, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400">
                          <span className="text-red-400 mt-0.5 shrink-0">⚠</span> {sign}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hotlines */}
      <div className="card p-5 space-y-4">
        <h3 className="font-grotesk font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
          <div className="w-1 h-4 bg-green-400 rounded" />
          Emergency Reporting Hotlines — Malawi
        </h3>
        <div className="space-y-2">
          {HOTLINES.map(h => (
            <div key={h.org} className="flex items-center gap-4 bg-[#05080F]/60 border border-white/5 rounded-xl px-4 py-3">
              <Phone className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-white">{h.org}</div>
                <div className="text-[10px] text-slate-500">{h.hours}</div>
              </div>
              <code className="text-xs font-mono text-[#FFD600] font-bold">{h.number}</code>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          If you believe a cybercrime is happening against you right now — hang up any suspicious call, lock your mobile money account by dialling *211*9# (Airtel) or *444*9# (TNM), and call 116 or 111 immediately.
        </p>
      </div>
    </div>
  );
}
