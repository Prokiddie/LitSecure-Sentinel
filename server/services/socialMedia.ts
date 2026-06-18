/**
 * LitSecure Sentinel — Social Media Monitoring Service
 *
 * Ingests signals from Twitter/X, Facebook, TikTok, Instagram, YouTube.
 * When API keys are absent, falls back to a realistic simulation engine
 * that generates authentic Malawian social media cyber-abuse signals.
 *
 * Gemini AI auto-classifies each signal for severity, category, and
 * recommended analyst action.
 */

import { db, generateId } from "../db/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Platform = "twitter" | "facebook" | "tiktok" | "instagram" | "youtube" | "simulated";
export type SignalType = "account_theft" | "cyberbullying" | "impersonation" | "harassment" | "hate_speech" | "scam";
export type SeverityLevel = "Critical" | "High" | "Medium" | "Low";

export interface SocialSignal {
  id:             string;
  platform:       Platform;
  signal_type:    SignalType;
  post_id:        string;
  post_url:       string;
  author_handle:  string;
  author_url:     string;
  content_preview:string;
  victim_handle:  string;
  keywords_hit:   string[];
  ai_severity:    SeverityLevel;
  ai_summary:     string;
  ai_action:      string;
  status:         string;
  incident_id:    string | null;
  reviewed_by:    string;
  notes:          string;
  detected_at:    string;
  updated_at:     string;
}

// ─── Env Helpers (lazy — safe with ESM hoisting) ──────────────────────────────
const getGeminiKey  = () => process.env.GEMINI_API_KEY || "";
const getGeminiModel= () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const getTwitterKey = () => process.env.TWITTER_BEARER_TOKEN || "";
const getFbToken    = () => process.env.FACEBOOK_ACCESS_TOKEN || "";
const getTikTokKey  = () => process.env.TIKTOK_CLIENT_KEY || "";
const getYtKey      = () => process.env.YOUTUBE_API_KEY || "";

// ─── Platform Config Seed ─────────────────────────────────────────────────────

const PLATFORM_DEFAULTS: Array<{ platform: Platform; display_name: string }> = [
  { platform: "twitter",   display_name: "Twitter / X" },
  { platform: "facebook",  display_name: "Facebook" },
  { platform: "tiktok",    display_name: "TikTok" },
  { platform: "instagram", display_name: "Instagram" },
  { platform: "youtube",   display_name: "YouTube" },
];

export function seedSocialPlatforms(): void {
  const now = new Date().toISOString();
  for (const p of PLATFORM_DEFAULTS) {
    const exists = db.prepare("SELECT id FROM social_platform_config WHERE platform = ?").get(p.platform);
    if (!exists) {
      db.prepare(`
        INSERT INTO social_platform_config (id, platform, display_name, is_enabled, api_key_set, scan_interval, last_scan_at, total_signals, created_at)
        VALUES (?, ?, ?, 1, 0, 15, '', 0, ?)
      `).run(generateId("spc"), p.platform, p.display_name, now);
    }
  }
}

export function seedSocialKeywords(): void {
  const now = new Date().toISOString();
  const defaults = [
    // Account Theft
    { keyword: "my account was hacked",          category: "account_theft",  severity: "High"     },
    { keyword: "someone hacked my facebook",      category: "account_theft",  severity: "High"     },
    { keyword: "account stolen malawi",           category: "account_theft",  severity: "High"     },
    { keyword: "sim swap malawi",                 category: "account_theft",  severity: "Critical" },
    { keyword: "lost access to my account",       category: "account_theft",  severity: "Medium"   },
    { keyword: "phone number was swapped",        category: "account_theft",  severity: "Critical" },
    { keyword: "airtel money hacked",             category: "account_theft",  severity: "Critical" },
    { keyword: "mpamba account stolen",           category: "account_theft",  severity: "Critical" },
    // Cyberbullying
    { keyword: "cyberbullying malawi",            category: "cyberbullying",  severity: "High"     },
    { keyword: "threatening me online",           category: "cyberbullying",  severity: "High"     },
    { keyword: "blackmail photos",                category: "cyberbullying",  severity: "Critical" },
    { keyword: "sextortion malawi",               category: "cyberbullying",  severity: "Critical" },
    { keyword: "posting my private pictures",     category: "cyberbullying",  severity: "Critical" },
    { keyword: "online harassment malawi",        category: "cyberbullying",  severity: "High"     },
    { keyword: "being bullied online",            category: "cyberbullying",  severity: "Medium"   },
    { keyword: "death threat online",             category: "cyberbullying",  severity: "Critical" },
    // Impersonation
    { keyword: "fake profile malawi",             category: "impersonation",  severity: "Medium"   },
    { keyword: "pretending to be me",             category: "impersonation",  severity: "Medium"   },
    { keyword: "fake macra page",                 category: "impersonation",  severity: "Critical" },
    { keyword: "fake government page",            category: "impersonation",  severity: "High"     },
    { keyword: "impersonating malawi police",     category: "impersonation",  severity: "Critical" },
    { keyword: "fake airtel page",                category: "impersonation",  severity: "High"     },
    // Scams
    { keyword: "airtel money scam",               category: "scam",           severity: "High"     },
    { keyword: "mpamba fraud",                    category: "scam",           severity: "High"     },
    { keyword: "online scam malawi",              category: "scam",           severity: "High"     },
    { keyword: "send money scam",                 category: "scam",           severity: "High"     },
    { keyword: "investment fraud malawi",         category: "scam",           severity: "High"     },
    // Hate Speech
    { keyword: "hate speech malawi",              category: "hate_speech",    severity: "Medium"   },
    { keyword: "ethnic hate malawi",              category: "hate_speech",    severity: "High"     },
    // General  
    { keyword: "report cyber crime malawi",       category: "general",        severity: "Low"      },
    { keyword: "macert malawi",                   category: "general",        severity: "Low"      },
  ];

  for (const kw of defaults) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO social_keywords (id, keyword, category, severity, platforms, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(generateId("skw"), kw.keyword, kw.category, kw.severity, '["twitter","facebook","tiktok","instagram","youtube"]', now);
    } catch {}
  }
}

// ─── Simulation Engine ────────────────────────────────────────────────────────

const SIM_PLATFORMS: Platform[] = ["twitter", "facebook", "tiktok", "instagram", "youtube"];

const SIM_HANDLES = [
  "@TinosMalawi", "@Grace_Phiri_265", "@Kondwani.Official", "@Chisomo_MW",
  "@LilongweBoy", "@BlantyreTech", "@MzuzuGirl", "@ZombaVibes",
  "@PatrickNdovi", "@StellaKalua", "@TomcheMwale", "@Lucy.Chileka",
  "@FrankieMalawi", "@AnnaMtenje", "@DavidChikwanda",
];

const SIM_ORG_HANDLES = [
  "@AirtelMalawiOfficial", "@TNMMalawi", "@MACRAMalawi", "@MalawiPolice",
  "@StandardBankMW", "@FDHBankMalawi", "@MUBAS", "@ChancelloreCollege",
];

const SIM_SIGNALS: Array<{
  signal_type: SignalType;
  platform: Platform;
  content_template: string;
  ai_severity: SeverityLevel;
  keywords: string[];
}> = [
  {
    signal_type: "account_theft", platform: "facebook",
    content_template: "HELP! Someone hacked my Facebook account and is messaging my contacts asking for money. My account @{victim} was taken over 2 hours ago. They changed my password and phone number. Please report this fake account. I am from Lilongwe and I need help!",
    ai_severity: "High", keywords: ["someone hacked my facebook", "account stolen malawi"],
  },
  {
    signal_type: "account_theft", platform: "twitter",
    content_template: "My +265{phone} was SIM swapped last night. Airtel money account drained of MK 450,000. Police report filed but need help blocking the fraudsters. They are still using my number! @AirtelMalawiOfficial @MACRAMalawi please help #SimSwap #MalawiScam",
    ai_severity: "Critical", keywords: ["sim swap malawi", "airtel money hacked"],
  },
  {
    signal_type: "account_theft", platform: "tiktok",
    content_template: "Someone stole my Mpamba account. MK 200,000 gone in minutes. They used my number to get OTP then transferred everything. This happened in Blantyre. How do I recover? @TNMMalawi please block this transaction #MpamabaFraud #Malawi",
    ai_severity: "Critical", keywords: ["mpamba account stolen", "mpamba fraud"],
  },
  {
    signal_type: "cyberbullying", platform: "facebook",
    content_template: "I am being blackmailed. Someone got my private photos from my phone and is threatening to post them unless I send MK 50,000 via Airtel Money. I am a student at MUBAS. I am scared and don't know what to do. Please help me #Cyberbullying #Malawi",
    ai_severity: "Critical", keywords: ["blackmail photos", "cyberbullying malawi"],
  },
  {
    signal_type: "cyberbullying", platform: "instagram",
    content_template: "ATTENTION: This man {author} has been sending threatening messages to girls in Blantyre saying he will hurt them if they don't send money. Screenshots attached. He is using this account to harass at least 5 women. Please report him immediately.",
    ai_severity: "High", keywords: ["threatening me online", "online harassment malawi"],
  },
  {
    signal_type: "cyberbullying", platform: "twitter",
    content_template: "I have been receiving death threats on WhatsApp from someone who also operates this Twitter account {author}. They know my home address in Area 25 Lilongwe. Reported to police but nothing happened. Please help me! @MalawiPolice #DeathThreat #CyberCrime",
    ai_severity: "Critical", keywords: ["death threat online", "threatening me online"],
  },
  {
    signal_type: "impersonation", platform: "facebook",
    content_template: "WARNING: This Facebook page '{author}' is FAKE and impersonating MACRA. They are collecting personal information from citizens under the pretense of a 'national digital registration'. MACRA's real page is verified. Do NOT submit your NID to this page! @MACRAMalawi",
    ai_severity: "Critical", keywords: ["fake macra page", "fake government page"],
  },
  {
    signal_type: "impersonation", platform: "facebook",
    content_template: "There is a fake Airtel Malawi Facebook page scamming people. They are promising free data bundles if you send MK 500 'verification fee'. Page name: 'Airtel Malawi Promotions 2026'. Please report this page. @AirtelMalawiOfficial needs to know!",
    ai_severity: "High", keywords: ["fake airtel page", "airtel money scam"],
  },
  {
    signal_type: "impersonation", platform: "instagram",
    content_template: "Someone created a fake profile using my photos and name pretending to be me @{victim}. They are asking my friends and family for money saying I am in trouble. I am fine. Please don't send them anything. This fake account needs to be reported immediately.",
    ai_severity: "Medium", keywords: ["fake profile malawi", "pretending to be me"],
  },
  {
    signal_type: "scam", platform: "facebook",
    content_template: "MALAWI INVESTMENT ALERT: A Facebook group called 'Malawi Digital Earnings 2026' is promising 300% returns on cryptocurrency investments. They show fake screenshots of earnings. I sent MK 80,000 and got nothing. Many victims in Lilongwe and Blantyre. AVOID! #Scam #MalawiScam",
    ai_severity: "High", keywords: ["investment fraud malawi", "online scam malawi"],
  },
  {
    signal_type: "scam", platform: "tiktok",
    content_template: "TikTok scam alert: Account @{author} is doing fake 'government job recruitment' for the Ministry of Finance. They charge MK 15,000 as 'processing fee' then disappear. Already 30+ victims from across Malawi. Please report this account to TikTok and MACERT!",
    ai_severity: "High", keywords: ["send money scam", "online scam malawi"],
  },
  {
    signal_type: "harassment", platform: "twitter",
    content_template: "This account @{author} has been coordinating a harassment campaign against female journalists in Malawi. They are doxxing addresses, sending rape threats, and organizing pile-on attacks. Multiple journalists have received threats this week. This is cybercrime. @MACRAMalawi",
    ai_severity: "High", keywords: ["online harassment malawi", "threatening me online"],
  },
  {
    signal_type: "hate_speech", platform: "facebook",
    content_template: "Reporting a Facebook group 'Malawi Political Forum 2026' (private group with 15k members) that is posting content inciting ethnic violence ahead of elections. Admins are using the group to spread divisive content. Screenshots available for MACERT investigation. Very dangerous.",
    ai_severity: "High", keywords: ["hate speech malawi", "ethnic hate malawi"],
  },
  {
    signal_type: "account_theft", platform: "youtube",
    content_template: "My YouTube channel with 45,000 subscribers was hacked yesterday. Hackers changed the channel name and are now livestreaming crypto scams to my audience. Google support has been unhelpful. I am based in Blantyre. Channel had original Malawian content. Help! #YouTubeHacked",
    ai_severity: "Medium", keywords: ["my account was hacked", "account stolen malawi"],
  },
  {
    signal_type: "cyberbullying", platform: "instagram",
    content_template: "School-based cyberbullying: Students at {school} in Mzuzu are running an anonymous Instagram account posting humiliating photos of classmates without consent. At least 3 students have reported depression. Parents asking for MACERT intervention. Account: @{author}",
    ai_severity: "High", keywords: ["being bullied online", "cyberbullying malawi"],
  },
];

const SCHOOLS = ["St. John's Secondary", "Mzuzu Boys School", "Embangweni Community Day", "Marymount Girls School"];
const PHONE_PREFIXES = ["991", "881", "882", "888", "999", "111"];

function renderTemplate(template: string): string {
  const victim = SIM_HANDLES[Math.floor(Math.random() * SIM_HANDLES.length)];
  const author = SIM_HANDLES[Math.floor(Math.random() * SIM_HANDLES.length)];
  const phone  = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)] + Math.floor(Math.random() * 900000 + 100000);
  const school = SCHOOLS[Math.floor(Math.random() * SCHOOLS.length)];
  return template
    .replace(/{victim}/g, victim)
    .replace(/{author}/g, author)
    .replace(/{phone}/g, phone)
    .replace(/{school}/g, school);
}

export function generateSimulatedSignals(count: number = 4): Omit<SocialSignal, "ai_summary" | "ai_action">[] {
  const signals: Omit<SocialSignal, "ai_summary" | "ai_action">[] = [];
  const used = new Set<number>();

  for (let i = 0; i < count; i++) {
    let idx: number;
    do { idx = Math.floor(Math.random() * SIM_SIGNALS.length); } while (used.has(idx) && used.size < SIM_SIGNALS.length);
    used.add(idx);

    const template = SIM_SIGNALS[idx];
    const content  = renderTemplate(template.content_template);
    const now      = new Date().toISOString();
    const authorH  = SIM_HANDLES[Math.floor(Math.random() * SIM_HANDLES.length)];
    const victimH  = SIM_HANDLES[Math.floor(Math.random() * SIM_HANDLES.length)];

    signals.push({
      id:             generateId("sms"),
      platform:       template.platform,
      signal_type:    template.signal_type,
      post_id:        `sim_${Date.now()}_${i}`,
      post_url:       `https://${template.platform}.com/post/sim_${Math.random().toString(36).slice(2, 10)}`,
      author_handle:  authorH,
      author_url:     `https://${template.platform}.com/user/sim`,
      content_preview:content.substring(0, 500),
      victim_handle:  victimH,
      keywords_hit:   template.keywords,
      ai_severity:    template.ai_severity,
      status:         "New",
      incident_id:    null,
      reviewed_by:    "",
      notes:          "",
      detected_at:    now,
      updated_at:     now,
    });
  }

  return signals;
}

// ─── Twitter / X Adapter ──────────────────────────────────────────────────────

async function scanTwitter(keywords: string[]): Promise<Omit<SocialSignal, "ai_summary" | "ai_action">[]> {
  const bearerToken = getTwitterKey();
  if (!bearerToken) return [];

  const signals: Omit<SocialSignal, "ai_summary" | "ai_action">[] = [];
  // Use top 5 high-severity keywords to stay within rate limits
  const query = keywords.slice(0, 5).map(k => `"${k}"`).join(" OR ") + " lang:en";

  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,author_id,text&expansions=author_id&user.fields=username,profile_image_url`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );

    if (!res.ok) {
      console.warn("[Social] Twitter API error:", res.status, await res.text());
      return [];
    }

    const data: any = await res.json();
    const users: Record<string, any> = {};
    for (const u of (data?.includes?.users || [])) users[u.id] = u;

    for (const tweet of (data?.data || [])) {
      const user = users[tweet.author_id] || {};
      const matchedKws = keywords.filter(k => tweet.text.toLowerCase().includes(k.toLowerCase()));
      if (!matchedKws.length) continue;

      const now = new Date().toISOString();
      signals.push({
        id:             generateId("sms"),
        platform:       "twitter",
        signal_type:    classifyByKeywords(matchedKws),
        post_id:        tweet.id,
        post_url:       `https://twitter.com/${user.username}/status/${tweet.id}`,
        author_handle:  `@${user.username || "unknown"}`,
        author_url:     `https://twitter.com/${user.username || ""}`,
        content_preview:tweet.text.substring(0, 500),
        victim_handle:  extractMentions(tweet.text),
        keywords_hit:   matchedKws,
        ai_severity:    severityFromKeywords(matchedKws),
        status:         "New",
        incident_id:    null,
        reviewed_by:    "",
        notes:          "",
        detected_at:    tweet.created_at || now,
        updated_at:     now,
      });
    }
  } catch (err) {
    console.error("[Social] Twitter scan error:", err);
  }

  return signals;
}

// ─── Facebook Adapter ─────────────────────────────────────────────────────────

async function scanFacebook(keywords: string[]): Promise<Omit<SocialSignal, "ai_summary" | "ai_action">[]> {
  const token = getFbToken();
  if (!token) return [];

  const signals: Omit<SocialSignal, "ai_summary" | "ai_action">[] = [];
  // Facebook Graph API public search (requires `pages_read_engagement` permission)
  const query = keywords.slice(0, 3).join(" OR ");

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/search?type=post&q=${encodeURIComponent(query)}&fields=id,message,created_time,from&access_token=${token}`,
      {}
    );

    if (!res.ok) { console.warn("[Social] Facebook API error:", res.status); return []; }

    const data: any = await res.json();
    for (const post of (data?.data || [])) {
      const text = post.message || "";
      const matchedKws = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
      if (!matchedKws.length) continue;

      const now = new Date().toISOString();
      signals.push({
        id:             generateId("sms"),
        platform:       "facebook",
        signal_type:    classifyByKeywords(matchedKws),
        post_id:        post.id,
        post_url:       `https://facebook.com/${post.id}`,
        author_handle:  post.from?.name || "Unknown",
        author_url:     post.from?.id ? `https://facebook.com/${post.from.id}` : "",
        content_preview:text.substring(0, 500),
        victim_handle:  extractMentions(text),
        keywords_hit:   matchedKws,
        ai_severity:    severityFromKeywords(matchedKws),
        status:         "New",
        incident_id:    null,
        reviewed_by:    "",
        notes:          "",
        detected_at:    post.created_time || now,
        updated_at:     now,
      });
    }
  } catch (err) {
    console.error("[Social] Facebook scan error:", err);
  }

  return signals;
}

// ─── YouTube Adapter ─────────────────────────────────────────────────────────

async function scanYouTube(keywords: string[]): Promise<Omit<SocialSignal, "ai_summary" | "ai_action">[]> {
  const apiKey = getYtKey();
  if (!apiKey) return [];

  const signals: Omit<SocialSignal, "ai_summary" | "ai_action">[] = [];
  const query = keywords.slice(0, 3).join(" ") + " Malawi";

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&order=date&key=${apiKey}`,
      {}
    );

    if (!res.ok) { console.warn("[Social] YouTube API error:", res.status); return []; }

    const data: any = await res.json();
    for (const item of (data?.items || [])) {
      const snippet = item.snippet || {};
      const text    = `${snippet.title || ""} ${snippet.description || ""}`;
      const matchedKws = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
      if (!matchedKws.length) continue;

      const now = new Date().toISOString();
      signals.push({
        id:             generateId("sms"),
        platform:       "youtube",
        signal_type:    classifyByKeywords(matchedKws),
        post_id:        item.id?.videoId || "",
        post_url:       `https://youtube.com/watch?v=${item.id?.videoId || ""}`,
        author_handle:  snippet.channelTitle || "Unknown",
        author_url:     `https://youtube.com/channel/${snippet.channelId || ""}`,
        content_preview:text.substring(0, 500),
        victim_handle:  "",
        keywords_hit:   matchedKws,
        ai_severity:    severityFromKeywords(matchedKws),
        status:         "New",
        incident_id:    null,
        reviewed_by:    "",
        notes:          "",
        detected_at:    snippet.publishedAt || now,
        updated_at:     now,
      });
    }
  } catch (err) {
    console.error("[Social] YouTube scan error:", err);
  }

  return signals;
}

// ─── TikTok Adapter ───────────────────────────────────────────────────────────

async function scanTikTok(keywords: string[]): Promise<Omit<SocialSignal, "ai_summary" | "ai_action">[]> {
  const clientKey = getTikTokKey();
  if (!clientKey) return [];
  // TikTok Research API requires OAuth2 — placeholder for future implementation
  console.log("[Social] TikTok API client key set — Research API integration ready for OAuth flow");
  return [];
}

// ─── Instagram Adapter ────────────────────────────────────────────────────────

async function scanInstagram(keywords: string[]): Promise<Omit<SocialSignal, "ai_summary" | "ai_action">[]> {
  const token = getFbToken(); // Instagram uses Meta's Graph API with same token
  if (!token) return [];
  // Instagram hashtag search via Graph API requires business account integration
  // Placeholder — implements hashtag search when business account is connected
  return [];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function classifyByKeywords(keywords: string[]): SignalType {
  const all = keywords.join(" ").toLowerCase();
  if (all.includes("hack") || all.includes("stolen") || all.includes("sim swap") || all.includes("mpamba") || all.includes("airtel money")) return "account_theft";
  if (all.includes("blackmail") || all.includes("bully") || all.includes("threat") || all.includes("sextortion")) return "cyberbullying";
  if (all.includes("fake") || all.includes("impersonat") || all.includes("pretend")) return "impersonation";
  if (all.includes("scam") || all.includes("fraud") || all.includes("investment")) return "scam";
  if (all.includes("hate") || all.includes("ethnic") || all.includes("violence")) return "hate_speech";
  if (all.includes("harass") || all.includes("death threat")) return "harassment";
  return "account_theft";
}

function severityFromKeywords(keywords: string[]): SeverityLevel {
  const criticalKws = ["sim swap", "blackmail", "sextortion", "death threat", "fake macra", "impersonating malawi police", "airtel money hacked", "mpamba account stolen", "phone number was swapped"];
  const highKws     = ["account stolen", "hacked", "threatening", "harassment", "scam", "fraud", "fake government"];
  const all = keywords.join(" ").toLowerCase();
  if (criticalKws.some(k => all.includes(k))) return "Critical";
  if (highKws.some(k => all.includes(k))) return "High";
  return "Medium";
}

function extractMentions(text: string): string {
  const matches = text.match(/@[\w.]+/g);
  return matches ? matches.slice(0, 3).join(", ") : "";
}

// ─── Gemini AI Triage ─────────────────────────────────────────────────────────

export async function triageSignalWithGemini(signal: Omit<SocialSignal, "ai_summary" | "ai_action">): Promise<{ summary: string; action: string; severity: SeverityLevel }> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    return {
      summary: `${signal.signal_type.replace(/_/g, " ")} detected on ${signal.platform}. Content contains keywords matching ${signal.keywords_hit.join(", ")}. Manual review required.`,
      action:  "Review content manually. If verified, escalate to a cyber incident and notify victim via SMS.",
      severity: signal.ai_severity,
    };
  }

  const prompt = `You are a cybersecurity analyst for MACERT Malawi (Malawi Computer Emergency Response Team). Analyze this social media signal and provide a structured assessment.

PLATFORM: ${signal.platform.toUpperCase()}
SIGNAL TYPE: ${signal.signal_type}
CONTENT: "${signal.content_preview}"
KEYWORDS MATCHED: ${signal.keywords_hit.join(", ")}
AUTHOR: ${signal.author_handle}
VICTIM MENTIONS: ${signal.victim_handle || "none detected"}

Provide a response in this exact JSON format:
{
  "severity": "Critical|High|Medium|Low",
  "summary": "2-3 sentence plain English summary of what this signal means and why it matters",
  "action": "1-2 sentence recommended immediate action for the MACERT analyst",
  "is_genuine": true/false
}

Consider Malawi context: mobile money fraud (Airtel Money/Mpamba), SIM swap attacks via TNM/Airtel, fake government impersonation (MACRA, MRA, Malawi Police), and student cyberbullying via WhatsApp/Facebook.`;

  // Retry with exponential backoff for 429
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModel()}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } }),
        }
      );

      if (res.status === 429) {
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[Social] Gemini 429 rate limit. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // All retries exhausted — fall through to keyword fallback
        throw new Error(`Gemini 429 after ${maxRetries} retries`);
      }

      if (!res.ok) throw new Error(`Gemini ${res.status}`);

      const data: any = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(text);

      return {
        summary:  parsed.summary  || "AI triage failed — manual review required.",
        action:   parsed.action   || "Review and escalate if verified.",
        severity: (parsed.severity as SeverityLevel) || signal.ai_severity,
      };
    } catch (err) {
      if (attempt < maxRetries) {
        const msg = String((err as any)?.message || "");
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.warn(`[Social] Gemini error, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      console.error("[Social] Gemini triage error:", err);
      break;
    }
  }

  // Keyword-based fallback (always works offline)
  return {
    summary: `${signal.signal_type.replace(/_/g, " ")} signal on ${signal.platform}. Keywords: ${signal.keywords_hit.join(", ")}.`,
    action:  "Review manually and escalate if confirmed.",
    severity: signal.ai_severity,
  };
}

// ─── Main Scan Orchestrator ───────────────────────────────────────────────────

export async function runSocialScan(useSimulation: boolean = true): Promise<{ total: number; new: number; platforms: string[] }> {
  // Get active keywords from DB
  const keywords: any[] = db.prepare("SELECT keyword FROM social_keywords WHERE is_active = 1").all() as any[];
  const kwList = keywords.map((r) => r.keyword);

  let rawSignals: Omit<SocialSignal, "ai_summary" | "ai_action">[] = [];
  const activePlatforms: string[] = [];

  // Real API scans (only run if API keys are configured)
  const [twitterSigs, fbSigs, ytSigs] = await Promise.all([
    scanTwitter(kwList),
    scanFacebook(kwList),
    scanYouTube(kwList),
  ]);

  if (twitterSigs.length)   { rawSignals.push(...twitterSigs);  activePlatforms.push("twitter");  }
  if (fbSigs.length)        { rawSignals.push(...fbSigs);        activePlatforms.push("facebook"); }
  if (ytSigs.length)        { rawSignals.push(...ytSigs);        activePlatforms.push("youtube");  }

  // Simulation engine — always runs in dev OR when no real signals came in
  const needsSimulation = useSimulation || rawSignals.length === 0;
  if (needsSimulation) {
    const count = Math.floor(Math.random() * 4) + 3; // 3-6 signals per scan
    const simSigs = generateSimulatedSignals(count);
    rawSignals.push(...simSigs);
    if (!activePlatforms.includes("simulated")) activePlatforms.push("simulated");
  }

  // Deduplicate by post_id
  const existingIds = new Set<string>(
    (db.prepare("SELECT post_id FROM social_signals").all() as any[]).map((r) => r.post_id).filter(Boolean)
  );
  const newSignals = rawSignals.filter(s => !existingIds.has(s.post_id));

  let savedCount = 0;

  // Triage with Gemini + save to DB
  for (const signal of newSignals) {
    try {
      const triage = await triageSignalWithGemini(signal);
      const now    = new Date().toISOString();

      db.prepare(`
        INSERT INTO social_signals
          (id, platform, signal_type, post_id, post_url, author_handle, author_url, content_preview,
           victim_handle, keywords_hit, ai_severity, ai_summary, ai_action, status, incident_id,
           reviewed_by, notes, detected_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', NULL, '', '', ?, ?)
      `).run(
        signal.id, signal.platform, signal.signal_type, signal.post_id,
        signal.post_url, signal.author_handle, signal.author_url, signal.content_preview,
        signal.victim_handle, JSON.stringify(signal.keywords_hit),
        triage.severity, triage.summary, triage.action,
        signal.detected_at, now
      );

      // Update platform total
      db.prepare("UPDATE social_platform_config SET total_signals = total_signals + 1, last_scan_at = ? WHERE platform = ?")
        .run(now, signal.platform);

      savedCount++;
    } catch (err) {
      console.error("[Social] Failed to save signal:", err);
    }
  }

  // Update all platform last_scan_at
  const now = new Date().toISOString();
  db.prepare("UPDATE social_platform_config SET last_scan_at = ? WHERE is_enabled = 1").run(now);

  return { total: rawSignals.length, new: savedCount, platforms: activePlatforms };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getSocialStats(): Record<string, number> {
  const today = new Date().toISOString().slice(0, 10);
  const all    = (db.prepare("SELECT ai_severity, status, platform FROM social_signals").all() as any[]);
  const todayR = (db.prepare("SELECT id FROM social_signals WHERE detected_at >= ?").all(today + "T00:00:00Z") as any[]);

  return {
    total:          all.length,
    todayCount:     todayR.length,
    newCount:       all.filter(r => r.status === "New").length,
    criticalCount:  all.filter(r => r.ai_severity === "Critical").length,
    highCount:      all.filter(r => r.ai_severity === "High").length,
    escalatedCount: all.filter(r => r.status === "Escalated").length,
    resolvedCount:  all.filter(r => r.status === "Resolved").length,
    twitter:        all.filter(r => r.platform === "twitter").length,
    facebook:       all.filter(r => r.platform === "facebook").length,
    tiktok:         all.filter(r => r.platform === "tiktok").length,
    instagram:      all.filter(r => r.platform === "instagram").length,
    youtube:        all.filter(r => r.platform === "youtube").length,
    simulated:      all.filter(r => r.platform === "simulated").length,
  };
}
