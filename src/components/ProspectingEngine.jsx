import { useState, useRef, useCallback, useEffect } from "react";

const VERTICALS = [
  {
    id: "tourism",
    name: "Tourism & Hospitality",
    tier: 1,
    queries: [
      "South African inbound tourism operators accepting international payments",
      "Namibia safari lodge companies cross-border payments",
      "South Africa destination management companies importing services",
      "Cape Town tour operators international bookings payments",
    ],
  },
  {
    id: "import_export",
    name: "Import/Export & Trade",
    tier: 1,
    queries: [
      "South African import companies China India trade",
      "Cape Town furniture importers international suppliers",
      "South African export companies agricultural products",
      "Johannesburg wholesale importers cross-border payments",
    ],
  },
  {
    id: "tech_saas",
    name: "Tech & SaaS",
    tier: 1,
    queries: [
      "South African SaaS companies selling internationally",
      "Cape Town tech startups global revenue cross-border",
      "South African software companies paying remote developers",
      "Johannesburg fintech companies international expansion",
    ],
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    tier: 1,
    queries: [
      "South African ecommerce companies importing products Shopify",
      "South African online retailers cross-border suppliers",
      "Cape Town dropshipping companies international sourcing",
    ],
  },
  {
    id: "agriculture",
    name: "Agriculture & Wine",
    tier: 2,
    queries: [
      "South African wine exporters international markets",
      "Stellenbosch wine estates export revenue",
      "South African fruit exporters cross-border payments",
      "Western Cape agricultural exporters",
    ],
  },
  {
    id: "education",
    name: "Education",
    tier: 2,
    queries: [
      "South African international schools foreign student fees",
      "South African ed-tech companies global expansion",
      "Cape Town language schools international students payments",
    ],
  },
  {
    id: "professional_services",
    name: "Professional Services",
    tier: 2,
    queries: [
      "South African consulting firms international clients cross-border",
      "Cape Town law firms international billing",
      "South African design agencies global clients payments",
    ],
  },
  {
    id: "ngo",
    name: "NGOs & Development",
    tier: 2,
    queries: [
      "South African NGOs receiving international donor funding",
      "Cape Town development organisations cross-border transfers",
      "South African nonprofits international grants payments",
    ],
  },
];

const SYSTEM_PROMPT = `You are a B2B sales research analyst for MoneyBadger, a South African crypto payments infrastructure company based in Stellenbosch.

MoneyBadger enables businesses to use crypto rails (Bitcoin, stablecoins like USDT) for:

1. CROSS-BORDER PAYMENTS — faster, cheaper international transfers settled in Rand
1. CATS (Crypto-Assisted Treasury Service) — stablecoin-based treasury management

You are building a prospecting list of South African businesses that would benefit from these services.

IDEAL CUSTOMER PROFILE:

- Regularly moves money across borders (imports, exports, pays suppliers/contractors abroad)
- Frustrated by SWIFT fees, slow settlement, FX spreads
- Monthly cross-border volume > R500k
- Industries: tourism, import/export, tech/SaaS, e-commerce, agriculture, professional services, NGOs
- Bonus: already crypto-curious, or have a progressive CFO/founder

RESPOND ONLY IN VALID JSON. No markdown, no backticks, no preamble.`;

const SEARCH_PROMPT = (vertical, query) => `Search the web for: "${query}"

Find real South African companies in the ${vertical} vertical that likely have significant cross-border payment needs.

For each company you find, return this JSON structure:
{
  "companies": [
    {
      "name": "Company Name",
      "website": "https://…",
      "vertical": "${vertical}",
      "description": "What they do in 1-2 sentences",
      "cross_border_signals": "Why they likely have cross-border payment pain",
      "estimated_volume": "low/medium/high based on company size and activity",
      "decision_maker_hint": "CEO/CFO name if found, or likely title to target",
      "location": "City, Province",
      "source": "Where you found this info"
    }
  ]
}

Return 3-8 companies. Only include REAL companies you can verify from search results. Do not fabricate.`;

const SCORE_PROMPT = (company) => `Score this prospect for MoneyBadger's cross-border and treasury services.

Company: ${JSON.stringify(company)}

Score 1-5 on each criterion, then provide an overall weighted score:

- cross_border_volume (weight 3x): How much money likely crosses borders monthly?
- pain_level (weight 2x): How frustrated are they likely to be with current banking/FX?
- accessibility (weight 2x): Can we reach the decision-maker? Is this a known company?
- crypto_readiness (weight 1x): Any signals of crypto awareness or progressive finance?
- strategic_fit (weight 1x): Does winning them unlock a vertical or referral network?

RESPOND ONLY IN VALID JSON:
{
  "scores": {
    "cross_border_volume": 4,
    "pain_level": 3,
    "accessibility": 4,
    "crypto_readiness": 2,
    "strategic_fit": 5
  },
  "weighted_total": 33,
  "tier": "A",
  "reasoning": "One sentence why this score"
}

Tier bands: 30+ = A, 20-29 = B, 10-19 = C`;

const EMAIL_PROMPT = (company, score) => `Write a short, compelling cold outreach email from Ben at MoneyBadger to the likely decision-maker at ${company.name}.

Company context: ${company.description}. ${company.cross_border_signals}
Score tier: ${score.tier} (weighted: ${score.weighted_total}/45)

MoneyBadger's value prop for them:

- Crypto rails for cross-border payments, settled in Rand
- Faster than SWIFT (minutes vs days), cheaper (fraction of bank fees)
- Stablecoin treasury services for FX optimisation
- Already integrated with Peach Payments, Ozow, Luno, VALR

Write in a direct, warm, South African tone. No corporate fluff. Keep it under 150 words.
Reference something specific about THEIR business to show this isn't spam.

RESPOND ONLY IN VALID JSON:
{
  "subject": "Email subject line",
  "body": "Email body text",
  "cta": "Specific ask / call to action"
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callClaude(apiKey, messages, useSearch = false, retries = 2) {
  const tools = useSearch
    ? [{ type: "web_search_20250305", name: "web_search" }]
    : undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages,
      };
      if (tools) body.tools = tools;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        if (attempt < retries) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        throw new Error(`API ${res.status}: ${err}`);
      }

      const data = await res.json();
      const text = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return text;
    } catch (e) {
      if (attempt < retries) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

function parseJSON(text) {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toCSV(prospects) {
  const headers = [
    "Tier",
    "Score",
    "Company",
    "Vertical",
    "Location",
    "Website",
    "Description",
    "Cross-Border Signals",
    "Est. Volume",
    "Decision Maker",
    "CB Volume Score",
    "Pain Level",
    "Accessibility",
    "Crypto Readiness",
    "Strategic Fit",
    "Reasoning",
    "Email Subject",
    "Email Body",
    "Email CTA",
  ];

  const escape = (v) => {
    const s = String(v || "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = prospects.map((p) =>
    [
      p.score?.tier || "?",
      p.score?.weighted_total || "?",
      p.company.name,
      p.company.vertical,
      p.company.location,
      p.company.website,
      p.company.description,
      p.company.cross_border_signals,
      p.company.estimated_volume,
      p.company.decision_maker_hint,
      p.score?.scores?.cross_border_volume || "",
      p.score?.scores?.pain_level || "",
      p.score?.scores?.accessibility || "",
      p.score?.scores?.crypto_readiness || "",
      p.score?.scores?.strategic_fit || "",
      p.score?.reasoning || "",
      p.email?.subject || "",
      p.email?.body || "",
      p.email?.cta || "",
    ]
      .map(escape)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

const TIER_COLORS = {
  A: { bg: "#F5A623", text: "#0A2540" },
  B: { bg: "#425466", text: "#FFFFFF" },
  C: { bg: "#E3E8EE", text: "#425466" },
};

export default function ProspectingEngine() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_api_key") || "");
  const [apiKeySet, setApiKeySet] = useState(() => !!localStorage.getItem("anthropic_api_key"));
  const [status, setStatus] = useState("idle");
  const [selectedVerticals, setSelectedVerticals] = useState(
    VERTICALS.map((v) => v.id)
  );
  const [prospects, setProspects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: "" });
  const [expandedId, setExpandedId] = useState(null);
  const abortRef = useRef(false);
  const logsEndRef = useRef(null);

  const log = useCallback((msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, msg, type }]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      localStorage.setItem("anthropic_api_key", apiKey.trim());
      setApiKeySet(true);
    }
  };

  const toggleVertical = (id) => {
    setSelectedVerticals((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const run = async () => {
    abortRef.current = false;
    setStatus("running");
    setProspects([]);
    setLogs([]);

    const verts = VERTICALS.filter((v) => selectedVerticals.includes(v.id));
    const totalQueries = verts.reduce((s, v) => s + v.queries.length, 0);
    let queryIdx = 0;

    // Phase 1 — Search
    log("Starting prospecting engine...", "phase");
    log(`Searching ${verts.length} verticals, ${totalQueries} queries`, "info");
    setProgress({ current: 0, total: totalQueries, phase: "Searching verticals" });

    const allCompanies = [];
    const seenNames = new Set();

    for (const vertical of verts) {
      if (abortRef.current) break;
      log(`Vertical: ${vertical.name} (Tier ${vertical.tier})`, "phase");

      for (const query of vertical.queries) {
        if (abortRef.current) break;
        queryIdx++;
        setProgress({
          current: queryIdx,
          total: totalQueries,
          phase: `Searching: ${vertical.name}`,
        });
        log(`Query ${queryIdx}/${totalQueries}: "${query}"`, "search");

        try {
          const result = await callClaude(
            apiKey,
            [{ role: "user", content: SEARCH_PROMPT(vertical.name, query) }],
            true
          );
          const parsed = parseJSON(result);
          if (parsed?.companies) {
            const newOnes = parsed.companies.filter(
              (c) => !seenNames.has(c.name.toLowerCase())
            );
            newOnes.forEach((c) => seenNames.add(c.name.toLowerCase()));
            allCompanies.push(...newOnes);
            log(
              `Found ${newOnes.length} new companies (${parsed.companies.length - newOnes.length} dupes skipped)`,
              "success"
            );
          } else {
            log("No parseable results from this query", "warn");
          }
        } catch (e) {
          log(`Error: ${e.message}`, "error");
        }

        await sleep(1500);
      }
    }

    log(`\nTotal unique companies found: ${allCompanies.length}`, "phase");

    // Phase 2 — Score
    if (abortRef.current) {
      setStatus("stopped");
      return;
    }
    log("\nScoring prospects against ICP...", "phase");
    setProgress({ current: 0, total: allCompanies.length, phase: "Scoring prospects" });

    const scored = [];
    for (let i = 0; i < allCompanies.length; i++) {
      if (abortRef.current) break;
      const company = allCompanies[i];
      setProgress({
        current: i + 1,
        total: allCompanies.length,
        phase: `Scoring: ${company.name}`,
      });
      log(`Scoring ${i + 1}/${allCompanies.length}: ${company.name}`, "info");

      try {
        const result = await callClaude(apiKey, [
          { role: "user", content: SCORE_PROMPT(company) },
        ]);
        const parsed = parseJSON(result);
        if (parsed) {
          scored.push({ company, score: parsed });
          log(
            `→ Tier ${parsed.tier} (${parsed.weighted_total}/45) — ${parsed.reasoning || ""}`,
            parsed.tier === "A" ? "success" : "info"
          );
        } else {
          scored.push({
            company,
            score: { tier: "?", weighted_total: 0, scores: {}, reasoning: "Parse error" },
          });
          log("→ Could not parse score", "warn");
        }
      } catch (e) {
        log(`Score error: ${e.message}`, "error");
        scored.push({
          company,
          score: { tier: "?", weighted_total: 0, scores: {}, reasoning: "API error" },
        });
      }

      await sleep(1000);
    }

    // Sort by score
    scored.sort((a, b) => (b.score?.weighted_total || 0) - (a.score?.weighted_total || 0));

    // Phase 3 — Emails for Tier A and top Tier B
    if (abortRef.current) {
      setStatus("stopped");
      setProspects(scored);
      return;
    }

    const emailTargets = scored.filter(
      (s) => s.score?.tier === "A" || (s.score?.tier === "B" && s.score?.weighted_total >= 25)
    );
    log(`\nDrafting outreach emails for ${emailTargets.length} top prospects...`, "phase");
    setProgress({
      current: 0,
      total: emailTargets.length,
      phase: "Drafting outreach emails",
    });

    for (let i = 0; i < emailTargets.length; i++) {
      if (abortRef.current) break;
      const prospect = emailTargets[i];
      setProgress({
        current: i + 1,
        total: emailTargets.length,
        phase: `Drafting: ${prospect.company.name}`,
      });
      log(
        `Email ${i + 1}/${emailTargets.length}: ${prospect.company.name}`,
        "info"
      );

      try {
        const result = await callClaude(apiKey, [
          {
            role: "user",
            content: EMAIL_PROMPT(prospect.company, prospect.score),
          },
        ]);
        const parsed = parseJSON(result);
        if (parsed) {
          prospect.email = parsed;
          log(`→ Subject: "${parsed.subject}"`, "success");
        }
      } catch (e) {
        log(`Email error: ${e.message}`, "error");
      }

      await sleep(1000);
    }

    setProspects(scored);
    setStatus("done");
    log(
      `\nDone! ${scored.length} prospects found, ${scored.filter((s) => s.score?.tier === "A").length} Tier A.`,
      "phase"
    );
  };

  const downloadCSV = () => {
    const csv = toCSV(prospects);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moneybadger-prospects-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tierCounts = {
    A: prospects.filter((p) => p.score?.tier === "A").length,
    B: prospects.filter((p) => p.score?.tier === "B").length,
    C: prospects.filter((p) => p.score?.tier === "C").length,
  };

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "#0A2540",
        minHeight: "100vh",
        color: "#FFFFFF",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Syne:wght@700;800&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          padding: "32px 24px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            fontFamily: "Syne, sans-serif",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ color: "#F5A623" }}>MoneyBadger</span> Prospecting
          Engine
        </div>
        <div style={{ color: "#8898AA", fontSize: 13, marginTop: 4 }}>
          Cross-border & treasury services pipeline builder — runs on Claude API +
          web search
        </div>
      </div>

      {/* Main */}
      <div style={{ padding: "20px 24px", maxWidth: 800, margin: "0 auto" }}>
        {/* API Key input */}
        {!apiKeySet && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#8898AA",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              Enter your Anthropic API Key
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApiKeySubmit()}
                placeholder="sk-ant-..."
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={handleApiKeySubmit}
                disabled={!apiKey.trim()}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: apiKey.trim() ? "#F5A623" : "#425466",
                  color: "#0A2540",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: apiKey.trim() ? "pointer" : "not-allowed",
                }}
              >
                Save
              </button>
            </div>
            <div style={{ color: "#8898AA", fontSize: 11, marginTop: 6 }}>
              Stored locally in your browser. Never sent anywhere except the Anthropic API.
            </div>
          </div>
        )}

        {/* Vertical selector */}
        {apiKeySet && status === "idle" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#8898AA",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Select verticals to prospect
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem("anthropic_api_key");
                  setApiKey("");
                  setApiKeySet(false);
                }}
                style={{
                  padding: "4px 12px",
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "#8898AA",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Change API Key
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {VERTICALS.map((v) => {
                const active = selectedVerticals.includes(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVertical(v.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 9999,
                      border: `1px solid ${active ? "#F5A623" : "rgba(255,255,255,0.12)"}`,
                      background: active ? "rgba(245,166,35,0.12)" : "transparent",
                      color: active ? "#F5A623" : "#8898AA",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    T{v.tier} · {v.name}
                  </button>
                );
              })}
            </div>

            <button
              onClick={run}
              disabled={selectedVerticals.length === 0}
              style={{
                marginTop: 24,
                padding: "14px 32px",
                borderRadius: 9999,
                border: "none",
                background:
                  selectedVerticals.length > 0 ? "#F5A623" : "#425466",
                color: "#0A2540",
                fontSize: 15,
                fontWeight: 700,
                cursor:
                  selectedVerticals.length > 0 ? "pointer" : "not-allowed",
                width: "100%",
              }}
            >
              Start Prospecting ({selectedVerticals.length} verticals,{" "}
              {VERTICALS.filter((v) => selectedVerticals.includes(v.id)).reduce(
                (s, v) => s + v.queries.length,
                0
              )}{" "}
              searches)
            </button>
            <div
              style={{
                color: "#8898AA",
                fontSize: 12,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Takes ~10-20 min depending on verticals selected. Safe to lock your
              phone.
            </div>
          </div>
        )}

        {/* Progress */}
        {status === "running" && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#F5A623" }}>
                {progress.phase}
              </span>
              <span style={{ fontSize: 13, color: "#8898AA" }}>{pct}%</span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 4,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "#F5A623",
                  borderRadius: 4,
                  transition: "width 300ms",
                }}
              />
            </div>
            <button
              onClick={() => {
                abortRef.current = true;
                log("Stopping...", "warn");
              }}
              style={{
                marginTop: 16,
                padding: "10px 24px",
                borderRadius: 9999,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#8898AA",
                fontSize: 13,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Stop Early (keeps results so far)
            </button>
          </div>
        )}

        {/* Results summary */}
        {prospects.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {["A", "B", "C"].map((tier) => (
                <div
                  key={tier}
                  style={{
                    flex: 1,
                    padding: "16px 12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "Syne",
                      fontSize: 28,
                      fontWeight: 800,
                      color: TIER_COLORS[tier].bg,
                    }}
                  >
                    {tierCounts[tier]}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#8898AA",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginTop: 2,
                    }}
                  >
                    Tier {tier}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={downloadCSV}
              style={{
                width: "100%",
                padding: "14px 24px",
                borderRadius: 9999,
                border: "none",
                background: "#F5A623",
                color: "#0A2540",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              Download CSV for Google Sheets
            </button>

            {/* Prospect cards */}
            <div style={{ marginTop: 16 }}>
              {prospects.map((p, idx) => {
                const expanded = expandedId === idx;
                const tierStyle = TIER_COLORS[p.score?.tier] || TIER_COLORS.C;
                return (
                  <div
                    key={idx}
                    onClick={() => setExpandedId(expanded ? null : idx)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      marginBottom: 8,
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: tierStyle.bg,
                          color: tierStyle.text,
                          flexShrink: 0,
                        }}
                      >
                        {p.score?.tier || "?"}
                      </span>
                      <span
                        style={{ fontSize: 14, fontWeight: 600, flex: 1 }}
                      >
                        {p.company.name}
                      </span>
                      <span
                        style={{ fontSize: 12, color: "#8898AA", flexShrink: 0 }}
                      >
                        {p.score?.weighted_total || 0}/45
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#8898AA",
                        marginTop: 4,
                      }}
                    >
                      {p.company.vertical} · {p.company.location}
                    </div>

                    {expanded && (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          fontSize: 13,
                        }}
                      >
                        <p style={{ color: "#C1CDD9", margin: "0 0 8px" }}>
                          {p.company.description}
                        </p>
                        <p style={{ color: "#F5A623", margin: "0 0 8px", fontSize: 12 }}>
                          {p.company.cross_border_signals}
                        </p>
                        {p.company.website && (
                          <p style={{ color: "#8898AA", margin: "0 0 4px", fontSize: 12 }}>
                            {p.company.website}
                          </p>
                        )}
                        {p.company.decision_maker_hint && (
                          <p style={{ color: "#8898AA", margin: "0 0 4px", fontSize: 12 }}>
                            Contact: {p.company.decision_maker_hint}
                          </p>
                        )}
                        <p style={{ color: "#8898AA", margin: "4px 0 0", fontSize: 11 }}>
                          {p.score?.reasoning}
                        </p>

                        {p.email && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 8,
                              background: "rgba(245,166,35,0.06)",
                              border: "1px solid rgba(245,166,35,0.15)",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#F5A623",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              Draft outreach email
                            </div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 13,
                                marginBottom: 6,
                              }}
                            >
                              {p.email.subject}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#C1CDD9",
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.5,
                              }}
                            >
                              {p.email.body}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Log */}
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 10,
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.06)",
            maxHeight: 280,
            overflowY: "auto",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          <link
            href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
            rel="stylesheet"
          />
          {logs.length === 0 ? (
            <span style={{ color: "#425466" }}>
              Logs will appear here when you start...
            </span>
          ) : (
            logs.map((l, i) => (
              <div key={i}>
                <span style={{ color: "#425466" }}>{l.time}</span>{" "}
                <span
                  style={{
                    color:
                      l.type === "phase"
                        ? "#F5A623"
                        : l.type === "success"
                          ? "#4CAF50"
                          : l.type === "error"
                            ? "#FF5252"
                            : l.type === "warn"
                              ? "#FFC107"
                              : l.type === "search"
                                ? "#64B5F6"
                                : "#8898AA",
                  }}
                >
                  {l.msg}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Reset */}
        {(status === "done" || status === "stopped") && (
          <button
            onClick={() => {
              setStatus("idle");
              setProspects([]);
              setLogs([]);
              setProgress({ current: 0, total: 0, phase: "" });
            }}
            style={{
              marginTop: 12,
              padding: "10px 24px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "#8898AA",
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Reset & Run Again
          </button>
        )}
      </div>
    </div>
  );
}
