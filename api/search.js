import { load } from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function searchDuckDuckGo(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  const ddgStatus = res.status;
  const html = await res.text();
  const htmlLength = html.length;

  if (!res.ok) {
    throw Object.assign(
      new Error(`DuckDuckGo returned ${ddgStatus}`),
      { debug: { ddgStatus, htmlLength, htmlPreview: html.slice(0, 500) } }
    );
  }

  const $ = load(html);
  const results = [];

  // Collect all CSS selectors we tried, for debugging
  const selectorsChecked = {
    ".result": $(".result").length,
    ".web-result": $(".web-result").length,
    ".result__body": $(".result__body").length,
    ".links_main": $(".links_main").length,
    "a.result__a": $("a.result__a").length,
  };

  $(".result").each((_, el) => {
    const title = $(el).find(".result__title a").text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();
    const link = $(el).find(".result__title a").attr("href") || "";

    let href = link;
    const uddgMatch = link.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      href = decodeURIComponent(uddgMatch[1]);
    }

    if (title && snippet) {
      results.push({ title, snippet, url: href });
    }
  });

  return {
    results,
    debug: {
      ddgStatus,
      htmlLength,
      selectorsChecked,
      htmlPreview: html.slice(0, 800),
      resultCount: results.length,
    },
  };
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
      source: `DuckDuckGo search: "${query}"`,
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
    const { results, debug } = await searchDuckDuckGo(query);
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
