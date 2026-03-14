// Apollo.io API integration for company prospecting
// Docs: https://docs.apollo.io

const APOLLO_BASE = "https://api.apollo.io";

// Map our verticals to Apollo industry/keyword filters
const VERTICAL_FILTERS = {
  "Tourism & Hospitality": {
    keywords: ["tourism", "hospitality", "safari", "travel", "tour operator", "lodge", "destination management"],
    industries: ["hospitality", "leisure, travel & tourism"],
  },
  "Import/Export & Trade": {
    keywords: ["import", "export", "trade", "wholesale", "freight", "logistics", "customs"],
    industries: ["import and export", "international trade and development", "wholesale"],
  },
  "Tech & SaaS": {
    keywords: ["software", "saas", "technology", "fintech", "platform"],
    industries: ["computer software", "information technology and services", "internet"],
  },
  "E-commerce": {
    keywords: ["ecommerce", "e-commerce", "online retail", "dropshipping", "shopify"],
    industries: ["retail", "e-learning"],
  },
  "Agriculture & Wine": {
    keywords: ["wine", "agriculture", "farming", "fruit", "export", "vineyard"],
    industries: ["food & beverages", "wine and spirits", "farming"],
  },
  "Education": {
    keywords: ["education", "school", "university", "edtech", "language school"],
    industries: ["education management", "e-learning", "higher education"],
  },
  "Professional Services": {
    keywords: ["consulting", "law firm", "design agency", "accounting", "advisory"],
    industries: ["management consulting", "legal services", "design"],
  },
  "NGOs & Development": {
    keywords: ["ngo", "nonprofit", "development", "charity", "foundation", "donor"],
    industries: ["nonprofit organization management", "civic & social organization", "philanthropy"],
  },
};

async function searchApollo(apiKey, vertical, query, page = 1) {
  const filters = VERTICAL_FILTERS[vertical] || { keywords: [], industries: [] };

  // Use Apollo's organization search
  const body = {
    q_organization_keyword_tags: filters.keywords,
    organization_locations: ["South Africa"],
    organization_num_employees_ranges: ["1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000"],
    page,
    per_page: 25,
  };

  const res = await fetch(`${APOLLO_BASE}/api/v1/mixed_companies/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const status = res.status;
  const rawText = await res.text();

  if (!res.ok) {
    throw Object.assign(
      new Error(`Apollo API returned ${status}`),
      {
        debug: {
          engine: "apollo",
          status,
          responsePreview: rawText.slice(0, 500),
          requestBody: body,
        },
      }
    );
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw Object.assign(
      new Error("Apollo returned invalid JSON"),
      { debug: { engine: "apollo", status, responsePreview: rawText.slice(0, 1000) } }
    );
  }

  const organizations = data.organizations || data.accounts || [];

  const companies = organizations.map((org) => ({
    name: org.name || "Unknown",
    website: org.website_url || org.primary_domain || "",
    vertical,
    description: org.short_description || org.seo_description || "",
    industry: org.industry || "",
    employee_count: org.estimated_num_employees || null,
    annual_revenue: org.annual_revenue_printed || null,
    location: [org.city, org.state, org.country].filter(Boolean).join(", ") || "South Africa",
    founded_year: org.founded_year || null,
    linkedin_url: org.linkedin_url || "",
    phone: org.phone || "",
    keywords: org.keywords || [],
    apollo_id: org.id || null,
    source: "Apollo.io",
    // We'll compute cross-border signals from the data
    cross_border_signals: buildCrossBorderSignals(org),
    estimated_volume: estimateVolume(org),
  }));

  return {
    companies,
    debug: {
      engine: "apollo",
      status,
      totalResults: data.pagination?.total_entries || organizations.length,
      page: data.pagination?.page || page,
      totalPages: data.pagination?.total_pages || 1,
      returnedCount: organizations.length,
    },
  };
}

function buildCrossBorderSignals(org) {
  const signals = [];
  const desc = (org.short_description || "").toLowerCase();
  const keywords = (org.keywords || []).join(" ").toLowerCase();
  const text = `${desc} ${keywords}`;

  if (text.match(/international|global|cross.border|overseas/)) signals.push("international operations mentioned");
  if (text.match(/import|export|trade/)) signals.push("import/export activity");
  if (text.match(/payment|forex|currency|fx/)) signals.push("payment/FX references");
  if (text.match(/ship|freight|logistics|customs/)) signals.push("logistics/shipping");

  const industry = (org.industry || "").toLowerCase();
  if (industry.match(/international|import|export|trade/)) signals.push(`industry: ${org.industry}`);

  if ((org.estimated_num_employees || 0) > 50) signals.push(`${org.estimated_num_employees}+ employees`);

  return signals.length > 0
    ? signals.join("; ")
    : "South African company in target vertical";
}

function estimateVolume(org) {
  const employees = org.estimated_num_employees || 0;
  const revenue = org.annual_revenue || 0;

  if (revenue > 10000000 || employees > 200) return "high";
  if (revenue > 1000000 || employees > 20) return "medium";
  return "low";
}

export default async function handler(req, res) {
  const { query, vertical, page } = req.query;
  const apiKey = req.headers["x-apollo-key"];

  if (!apiKey) return res.status(401).json({ error: "Apollo API key required (x-apollo-key header)" });
  if (!vertical) return res.status(400).json({ error: "vertical parameter required" });

  try {
    const { companies, debug } = await searchApollo(apiKey, vertical, query, parseInt(page) || 1);
    res.json({
      companies,
      rawResultCount: companies.length,
      debug,
    });
  } catch (e) {
    console.error("Search error:", e.message);
    res.status(e.debug?.status === 401 ? 401 : 500).json({
      error: e.message,
      debug: e.debug || null,
    });
  }
}
