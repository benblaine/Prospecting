import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-apollo-key");
  next();
});

const APOLLO_BASE = "https://api.apollo.io";

const VERTICAL_FILTERS = {
  "Tourism & Hospitality": {
    keywords: ["tourism", "hospitality", "safari", "travel", "tour operator", "lodge", "destination management"],
  },
  "Import/Export & Trade": {
    keywords: ["import", "export", "trade", "wholesale", "freight", "logistics", "customs"],
  },
  "Tech & SaaS": {
    keywords: ["software", "saas", "technology", "fintech", "platform"],
  },
  "E-commerce": {
    keywords: ["ecommerce", "e-commerce", "online retail", "dropshipping", "shopify"],
  },
  "Agriculture & Wine": {
    keywords: ["wine", "agriculture", "farming", "fruit", "export", "vineyard"],
  },
  "Education": {
    keywords: ["education", "school", "university", "edtech", "language school"],
  },
  "Professional Services": {
    keywords: ["consulting", "law firm", "design agency", "accounting", "advisory"],
  },
  "NGOs & Development": {
    keywords: ["ngo", "nonprofit", "development", "charity", "foundation", "donor"],
  },
};

function buildCrossBorderSignals(org) {
  const signals = [];
  const desc = (org.short_description || "").toLowerCase();
  const keywords = (org.keywords || []).join(" ").toLowerCase();
  const text = `${desc} ${keywords}`;

  if (text.match(/international|global|cross.border|overseas/)) signals.push("international operations mentioned");
  if (text.match(/import|export|trade/)) signals.push("import/export activity");
  if (text.match(/payment|forex|currency|fx/)) signals.push("payment/FX references");
  if (text.match(/ship|freight|logistics|customs/)) signals.push("logistics/shipping");
  if ((org.estimated_num_employees || 0) > 50) signals.push(`${org.estimated_num_employees}+ employees`);

  return signals.length > 0 ? signals.join("; ") : "South African company in target vertical";
}

function estimateVolume(org) {
  const employees = org.estimated_num_employees || 0;
  const revenue = org.annual_revenue || 0;
  if (revenue > 10000000 || employees > 200) return "high";
  if (revenue > 1000000 || employees > 20) return "medium";
  return "low";
}

app.get("/api/search", async (req, res) => {
  const { vertical, page } = req.query;
  const apiKey = req.headers["x-apollo-key"];

  if (!apiKey) return res.status(401).json({ error: "Apollo API key required" });
  if (!vertical) return res.status(400).json({ error: "vertical required" });

  const filters = VERTICAL_FILTERS[vertical] || { keywords: [] };

  try {
    const body = {
      q_organization_keyword_tags: filters.keywords,
      organization_locations: ["South Africa"],
      organization_num_employees_ranges: ["1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000"],
      page: parseInt(page) || 1,
      per_page: 25,
    };

    const apolloRes = await fetch(`${APOLLO_BASE}/api/v1/mixed_companies/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const rawText = await apolloRes.text();

    if (!apolloRes.ok) {
      return res.status(apolloRes.status).json({
        error: `Apollo API returned ${apolloRes.status}`,
        debug: { status: apolloRes.status, responsePreview: rawText.slice(0, 500) },
      });
    }

    const data = JSON.parse(rawText);
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
      cross_border_signals: buildCrossBorderSignals(org),
      estimated_volume: estimateVolume(org),
    }));

    res.json({
      companies,
      rawResultCount: companies.length,
      debug: {
        engine: "apollo",
        totalResults: data.pagination?.total_entries || organizations.length,
        page: data.pagination?.page || 1,
        totalPages: data.pagination?.total_pages || 1,
        returnedCount: organizations.length,
      },
    });
  } catch (e) {
    console.error("Search error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Prospecting API running on http://localhost:${PORT}`);
});
