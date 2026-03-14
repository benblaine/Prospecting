// SearXNG public instances — open-source meta-search, designed for programmatic access.
// Multiple instances for fallback if one is down or rate-limited.
const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://searxng.ch",
  "https://search.bus-hit.me",
  "https://searx.tiekoetter.com",
  "https://search.ononoki.org",
];

async function searchSearXNG(query) {
  const errors = [];

  for (const instance of SEARXNG_INSTANCES) {
    const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;

    try {
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MoneyBadger-Prospecting/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        errors.push({ instance, status: res.status });
        continue;
      }

      const data = await res.json();
      const results = (data.results || []).map((r) => ({
        title: r.title || "",
        snippet: r.content || "",
        url: r.url || "",
      }));

      return {
        results,
        debug: {
          engine: "searxng",
          instance,
          resultCount: results.length,
          rawResultCount: data.results?.length || 0,
          failedInstances: errors,
        },
      };
    } catch (e) {
      errors.push({ instance, error: e.message });
      continue;
    }
  }

  throw Object.assign(
    new Error(`All SearXNG instances failed`),
    { debug: { engine: "searxng", failedInstances: errors } }
  );
}

function extractCompanies(results, vertical, query) {
  const companies = [];

  for (const r of results) {
    const skipDomains = [
      "wikipedia.org",
      "linkedin.com",
      "facebook.com",
      "twitter.com",
      "youtube.com",
      "reddit.com",
      "quora.com",
      "gov.za",
    ];
    if (skipDomains.some((d) => r.url.includes(d))) continue;

    const skipTerms = [
      "top 10",
      "best companies",
      "list of",
      "directory",
      "how to",
      "what is",
    ];
    const lowerTitle = r.title.toLowerCase();
    if (skipTerms.some((t) => lowerTitle.includes(t))) continue;

    let name = r.title.split(/[-|–—]/)[0].trim();
    name = name
      .replace(/\s*(Pty|Ltd|PTY|LTD|Inc|LLC|\(Pty\)|\(Ltd\))\.?\s*/gi, "")
      .trim();

    if (!name || name.length < 2 || name.length > 80) continue;

    const text = `${r.title} ${r.snippet}`.toLowerCase();

    const crossBorderKeywords = [
      "cross-border",
      "international",
      "import",
      "export",
      "global",
      "foreign",
      "overseas",
      "forex",
      "fx",
      "swift",
      "remittance",
      "payment",
      "transfer",
      "trade",
      "shipping",
      "freight",
      "customs",
      "currency",
    ];
    const crossBorderHits = crossBorderKeywords.filter((k) =>
      text.includes(k)
    );

    const locationKeywords = [
      "south africa",
      "cape town",
      "johannesburg",
      "durban",
      "pretoria",
      "stellenbosch",
      "western cape",
      "gauteng",
    ];
    const locationHits = locationKeywords.filter((k) => text.includes(k));

    let location = "South Africa";
    if (text.includes("cape town") || text.includes("western cape"))
      location = "Cape Town, Western Cape";
    else if (text.includes("johannesburg") || text.includes("gauteng"))
      location = "Johannesburg, Gauteng";
    else if (text.includes("stellenbosch"))
      location = "Stellenbosch, Western Cape";
    else if (text.includes("durban") || text.includes("kwazulu"))
      location = "Durban, KwaZulu-Natal";
    else if (text.includes("pretoria")) location = "Pretoria, Gauteng";

    if (crossBorderHits.length === 0 && locationHits.length === 0) continue;

    companies.push({
      name,
      website: r.url,
      vertical,
      description: r.snippet.slice(0, 200),
      cross_border_signals:
        crossBorderHits.length > 0
          ? `Keywords found: ${crossBorderHits.join(", ")}`
          : "Location match but no direct cross-border signals in snippet",
      cross_border_keyword_count: crossBorderHits.length,
      location_keyword_count: locationHits.length,
      location,
      source: `SearXNG: "${query}"`,
      estimated_volume:
        crossBorderHits.length >= 3
          ? "high"
          : crossBorderHits.length >= 1
            ? "medium"
            : "low",
    });
  }

  return companies;
}

export default async function handler(req, res) {
  const { query, vertical } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    const { results, debug } = await searchSearXNG(query);
    const companies = extractCompanies(results, vertical || "unknown", query);
    res.json({
      companies,
      rawResultCount: results.length,
      debug,
    });
  } catch (e) {
    console.error("Search error:", e.message);
    res.status(500).json({
      error: e.message,
      debug: e.debug || null,
    });
  }
}
