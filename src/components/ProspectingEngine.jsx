import { useState, useRef, useCallback, useEffect } from "react";
import { scoreProspect } from "../lib/scoring";
import { generateEmail } from "../lib/emails";

const API_BASE = "";

const VERTICALS = [
  { id: "tourism", name: "Tourism & Hospitality", tier: 1 },
  { id: "import_export", name: "Import/Export & Trade", tier: 1 },
  { id: "tech_saas", name: "Tech & SaaS", tier: 1 },
  { id: "ecommerce", name: "E-commerce", tier: 1 },
  { id: "agriculture", name: "Agriculture & Wine", tier: 2 },
  { id: "education", name: "Education", tier: 2 },
  { id: "professional_services", name: "Professional Services", tier: 2 },
  { id: "ngo", name: "NGOs & Development", tier: 2 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Diagnostic trace log
const diagnosticTraces = [];

function addTrace(entry) {
  diagnosticTraces.push({ ...entry, timestamp: new Date().toISOString() });
}

async function searchApollo(apiKey, vertical, page = 1, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const traceEntry = {
      type: "api_call",
      vertical,
      page,
      attempt: attempt + 1,
      url: `${API_BASE}/api/search`,
    };

    try {
      const params = new URLSearchParams({ vertical, page: String(page) });
      const start = performance.now();
      const res = await fetch(`${API_BASE}/api/search?${params}`, {
        headers: { "x-apollo-key": apiKey },
      });
      const elapsed = Math.round(performance.now() - start);

      traceEntry.status = res.status;
      traceEntry.elapsed_ms = elapsed;

      const rawText = await res.text();
      traceEntry.response_length = rawText.length;
      traceEntry.response_preview = rawText.slice(0, 1000);

      if (res.status === 401) {
        traceEntry.error = "Invalid Apollo API key";
        addTrace(traceEntry);
        throw new Error("Invalid Apollo API key. Check your key at app.apollo.io/settings/integrations/api.");
      }

      if (!res.ok) {
        traceEntry.error = `HTTP ${res.status}`;
        addTrace(traceEntry);
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error(`Apollo API ${res.status}: ${rawText.slice(0, 200)}`);
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        traceEntry.error = `JSON parse failed: ${parseErr.message}`;
        addTrace(traceEntry);
        throw new Error(`Invalid JSON from API: ${rawText.slice(0, 200)}`);
      }

      traceEntry.companies_found = data.companies?.length || 0;
      traceEntry.raw_result_count = data.rawResultCount || 0;
      traceEntry.debug = data.debug || null;
      addTrace(traceEntry);

      return data;
    } catch (e) {
      traceEntry.error = traceEntry.error || e.message;
      if (!traceEntry.status) traceEntry.status = "network_error";
      addTrace(traceEntry);

      if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

function toCSV(prospects) {
  const headers = [
    "Tier", "Score", "Company", "Vertical", "Industry", "Location",
    "Website", "Employees", "Revenue", "Description", "Cross-Border Signals",
    "Est. Volume", "LinkedIn", "CB Volume Score", "Pain Level",
    "Accessibility", "Crypto Readiness", "Strategic Fit", "Reasoning",
    "Email Subject", "Email Body", "Email CTA",
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
      p.company.industry || "",
      p.company.location,
      p.company.website,
      p.company.employee_count || "",
      p.company.annual_revenue || "",
      p.company.description,
      p.company.cross_border_signals,
      p.company.estimated_volume,
      p.company.linkedin_url || "",
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

function generateDiagnosticReport(logs, prospects) {
  const errors = diagnosticTraces.filter((t) => t.error);
  const successes = diagnosticTraces.filter((t) => !t.error);
  const zeroResults = diagnosticTraces.filter(
    (t) => !t.error && t.companies_found === 0
  );

  const report = [
    "=== MONEYBADGER PROSPECTING ENGINE — DIAGNOSTIC REPORT ===",
    `Generated: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`,
    `Page URL: ${window.location.href}`,
    "",
    "--- SUMMARY ---",
    `Total API calls: ${diagnosticTraces.length}`,
    `Successful: ${successes.length}`,
    `Errors: ${errors.length}`,
    `Zero-result responses: ${zeroResults.length}`,
    `Prospects found: ${prospects.length}`,
    "",
    "--- LOG OUTPUT ---",
    ...logs.map((l) => `[${l.time}] [${l.type}] ${l.msg}`),
    "",
    "--- API CALL TRACES ---",
    ...diagnosticTraces.map((t, i) => {
      const lines = [
        `\n[Trace ${i + 1}] ${t.timestamp}`,
        `  URL: ${t.url}`,
        `  Vertical: ${t.vertical} | Page: ${t.page}`,
        `  Attempt: ${t.attempt}`,
        `  Status: ${t.status}`,
        `  Elapsed: ${t.elapsed_ms || "?"}ms`,
        `  Response length: ${t.response_length || "?"} bytes`,
        `  Companies found: ${t.companies_found ?? "n/a"}`,
      ];
      if (t.error) lines.push(`  ERROR: ${t.error}`);
      if (t.debug) lines.push(`  DEBUG: ${JSON.stringify(t.debug)}`);
      if (t.response_preview) {
        lines.push(`  Response preview:`);
        lines.push(`    ${t.response_preview.slice(0, 500).replace(/\n/g, "\n    ")}`);
      }
      return lines.join("\n");
    }),
    "",
    "=== END REPORT ===",
  ].join("\n");

  return report;
}

export default function ProspectingEngine() {
  const [apolloKey, setApolloKey] = useState(() => localStorage.getItem("apollo_api_key") || "");
  const [keySet, setKeySet] = useState(() => !!localStorage.getItem("apollo_api_key"));
  const [status, setStatus] = useState("idle");
  const [selectedVerticals, setSelectedVerticals] = useState(
    VERTICALS.map((v) => v.id)
  );
  const [prospects, setProspects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const abortRef = useRef(false);
  const logsEndRef = useRef(null);

  const log = useCallback((msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, msg, type }]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleKeySubmit = () => {
    if (apolloKey.trim()) {
      localStorage.setItem("apollo_api_key", apolloKey.trim());
      setKeySet(true);
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
    diagnosticTraces.length = 0;

    const verts = VERTICALS.filter((v) => selectedVerticals.includes(v.id));
    const key = localStorage.getItem("apollo_api_key");

    // Phase 1 — Search Apollo per vertical
    log("Starting prospecting engine...", "phase");
    log(`Searching ${verts.length} verticals via Apollo.io`, "info");
    setProgress({ current: 0, total: verts.length, phase: "Searching Apollo.io" });

    const allCompanies = [];
    const seenNames = new Set();

    for (let vi = 0; vi < verts.length; vi++) {
      if (abortRef.current) break;
      const vertical = verts[vi];
      setProgress({
        current: vi + 1,
        total: verts.length,
        phase: `Searching: ${vertical.name}`,
      });
      log(`Vertical: ${vertical.name} (Tier ${vertical.tier})`, "phase");

      try {
        const result = await searchApollo(key, vertical.name);
        if (result?.companies?.length > 0) {
          const newOnes = result.companies.filter(
            (c) => !seenNames.has(c.name.toLowerCase())
          );
          newOnes.forEach((c) => seenNames.add(c.name.toLowerCase()));
          allCompanies.push(...newOnes);
          log(
            `Found ${newOnes.length} companies (${result.companies.length - newOnes.length} dupes skipped)`,
            "success"
          );
          if (result.debug?.totalResults) {
            log(`Apollo shows ${result.debug.totalResults} total matches for this vertical`, "info");
          }
        } else {
          log(`No companies found for ${vertical.name}`, "warn");
        }
      } catch (e) {
        log(`Error: ${e.message}`, "error");
        if (e.message.includes("Invalid Apollo API key")) {
          log("Check your API key at app.apollo.io → Settings → Integrations → API", "warn");
          setStatus("stopped");
          return;
        }
      }

      // Rate-limit Apollo requests
      await sleep(1000);
    }

    log(`\nTotal unique companies found: ${allCompanies.length}`, "phase");

    // Phase 2 — Heuristic scoring
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

      const score = scoreProspect(company);
      scored.push({ company, score });
      log(
        `${company.name} → Tier ${score.tier} (${score.weighted_total}/45) — ${score.reasoning}`,
        score.tier === "A" ? "success" : "info"
      );
    }

    // Sort by score
    scored.sort((a, b) => (b.score?.weighted_total || 0) - (a.score?.weighted_total || 0));

    // Phase 3 — Template emails for Tier A and top Tier B
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

      prospect.email = generateEmail(prospect.company, prospect.score);
      log(
        `${prospect.company.name} → Subject: "${prospect.email.subject}"`,
        "success"
      );
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

  const copyDiagnostic = async () => {
    const report = generateDiagnosticReport(logs, prospects);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = report;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setDiagnosticCopied(true);
    setTimeout(() => setDiagnosticCopied(false), 3000);
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
          Cross-border & treasury services pipeline builder — Apollo.io +
          heuristic scoring
        </div>
      </div>

      {/* Main */}
      <div style={{ padding: "20px 24px", maxWidth: 800, margin: "0 auto" }}>
        {/* Apollo API Key input */}
        {!keySet && (
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
              Apollo.io API Key
            </div>
            <div style={{ color: "#8898AA", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              Get your free API key at{" "}
              <span style={{ color: "#F5A623" }}>app.apollo.io → Settings → Integrations → API</span>.
              Free plan includes API access for company search.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={apolloKey}
                onChange={(e) => setApolloKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleKeySubmit()}
                placeholder="Your Apollo API key..."
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
                onClick={handleKeySubmit}
                disabled={!apolloKey.trim()}
                style={{
                  padding: "12px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: apolloKey.trim() ? "#F5A623" : "#425466",
                  color: "#0A2540",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: apolloKey.trim() ? "pointer" : "not-allowed",
                }}
              >
                Save
              </button>
            </div>
            <div style={{ color: "#425466", fontSize: 11, marginTop: 6 }}>
              Stored locally in your browser only.
            </div>
          </div>
        )}

        {/* Vertical selector */}
        {keySet && status === "idle" && (
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
                  localStorage.removeItem("apollo_api_key");
                  setApolloKey("");
                  setKeySet(false);
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
              Start Prospecting ({selectedVerticals.length} verticals)
            </button>
            <div
              style={{
                color: "#8898AA",
                fontSize: 12,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Searches Apollo.io for SA companies in each vertical, scores against ICP, drafts outreach.
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
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                      <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
                        {p.company.name}
                      </span>
                      <span style={{ fontSize: 12, color: "#8898AA", flexShrink: 0 }}>
                        {p.score?.weighted_total || 0}/45
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#8898AA", marginTop: 4 }}>
                      {p.company.vertical} · {p.company.location}
                      {p.company.employee_count ? ` · ${p.company.employee_count} employees` : ""}
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
                        {p.company.industry && (
                          <p style={{ color: "#8898AA", margin: "0 0 4px", fontSize: 12 }}>
                            Industry: {p.company.industry}
                          </p>
                        )}
                        {p.company.annual_revenue && (
                          <p style={{ color: "#8898AA", margin: "0 0 4px", fontSize: 12 }}>
                            Revenue: {p.company.annual_revenue}
                          </p>
                        )}
                        {p.company.linkedin_url && (
                          <p style={{ color: "#8898AA", margin: "0 0 4px", fontSize: 12 }}>
                            LinkedIn: {p.company.linkedin_url}
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
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
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

        {/* Diagnostic report */}
        {logs.length > 0 && (
          <button
            onClick={copyDiagnostic}
            style={{
              marginTop: 8,
              padding: "10px 24px",
              borderRadius: 9999,
              border: `1px solid ${diagnosticCopied ? "rgba(76,175,80,0.4)" : "rgba(255,255,255,0.12)"}`,
              background: diagnosticCopied ? "rgba(76,175,80,0.1)" : "transparent",
              color: diagnosticCopied ? "#4CAF50" : "#8898AA",
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
              transition: "all 200ms",
            }}
          >
            {diagnosticCopied
              ? "Diagnostic report copied to clipboard!"
              : "Copy Diagnostic Report"}
          </button>
        )}

        {/* Reset */}
        {(status === "done" || status === "stopped") && (
          <button
            onClick={() => {
              setStatus("idle");
              setProspects([]);
              setLogs([]);
              setProgress({ current: 0, total: 0, phase: "" });
              diagnosticTraces.length = 0;
            }}
            style={{
              marginTop: 8,
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
