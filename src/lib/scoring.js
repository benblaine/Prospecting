// Heuristic ICP scoring for MoneyBadger prospects
// Scores 1-5 on each criterion, weighted to produce a total out of 45
// Enhanced to use Apollo.io enriched data when available

const CROSS_BORDER_STRONG = [
  "cross-border", "international payment", "forex", "swift",
  "remittance", "foreign exchange", "fx spread",
];
const CROSS_BORDER_MEDIUM = [
  "import", "export", "global", "overseas", "international",
  "foreign", "trade", "shipping", "freight", "customs",
];

const PAIN_KEYWORDS = [
  "expensive", "slow", "delay", "fee", "cost", "frustrat",
  "challenge", "difficult", "compliance", "regulation",
];

const CRYPTO_KEYWORDS = [
  "crypto", "bitcoin", "blockchain", "stablecoin", "usdt",
  "digital currency", "defi", "web3", "fintech", "luno", "valr",
];

const HIGH_VOLUME_SIGNALS = [
  "enterprise", "large-scale", "wholesale", "bulk",
  "million", "multi-national", "multinational", "group",
  "holdings", "corporation",
];

const VERTICALS_STRATEGIC_VALUE = {
  "Tourism & Hospitality": 4,
  "Import/Export & Trade": 5,
  "Tech & SaaS": 4,
  "E-commerce": 4,
  "Agriculture & Wine": 3,
  "Education": 3,
  "Professional Services": 3,
  "NGOs & Development": 3,
};

function countKeywordHits(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function scoreProspect(company) {
  const text = `${company.name} ${company.description} ${company.cross_border_signals} ${(company.keywords || []).join(" ")} ${company.industry || ""}`.toLowerCase();

  // Cross-border volume (weight 3x)
  const cbStrong = countKeywordHits(text, CROSS_BORDER_STRONG);
  const cbMedium = countKeywordHits(text, CROSS_BORDER_MEDIUM);
  const volumeSignals = countKeywordHits(text, HIGH_VOLUME_SIGNALS);
  let crossBorderVolume = clamp(
    1 + cbStrong * 2 + Math.ceil(cbMedium / 2) + volumeSignals,
    1,
    5
  );
  // Boost based on estimated_volume field
  if (company.estimated_volume === "high") crossBorderVolume = clamp(crossBorderVolume + 1, 1, 5);
  // Boost based on employee count (Apollo data) — larger companies move more money
  if (company.employee_count > 200) crossBorderVolume = clamp(crossBorderVolume + 1, 1, 5);
  else if (company.employee_count > 50) crossBorderVolume = clamp(crossBorderVolume + 1, 1, 5);

  // Pain level (weight 2x)
  const painHits = countKeywordHits(text, PAIN_KEYWORDS);
  const highPainVerticals = ["Import/Export & Trade", "Tourism & Hospitality", "Agriculture & Wine"];
  const verticalPainBoost = highPainVerticals.includes(company.vertical) ? 1 : 0;
  const painLevel = clamp(2 + painHits + verticalPainBoost, 1, 5);

  // Accessibility (weight 2x)
  let accessibility = 2;
  if (company.website && company.website.startsWith("http")) accessibility++;
  if (company.description && company.description.length > 30) accessibility++;
  if (company.location && company.location !== "South Africa") accessibility++;
  // Apollo-specific: LinkedIn URL or phone means we can reach them
  if (company.linkedin_url) accessibility = clamp(accessibility + 1, 1, 5);
  if (company.phone) accessibility = clamp(accessibility + 1, 1, 5);
  accessibility = clamp(accessibility, 1, 5);

  // Crypto readiness (weight 1x)
  const cryptoHits = countKeywordHits(text, CRYPTO_KEYWORDS);
  const cryptoReadiness = clamp(1 + cryptoHits * 2, 1, 5);

  // Strategic fit (weight 1x)
  const strategicFit = VERTICALS_STRATEGIC_VALUE[company.vertical] || 3;

  // Weighted total (max 45)
  const weightedTotal =
    crossBorderVolume * 3 +
    painLevel * 2 +
    accessibility * 2 +
    cryptoReadiness * 1 +
    strategicFit * 1;

  // Tier bands
  let tier;
  if (weightedTotal >= 30) tier = "A";
  else if (weightedTotal >= 20) tier = "B";
  else tier = "C";

  // Generate reasoning
  const reasons = [];
  if (crossBorderVolume >= 4) reasons.push("strong cross-border signals");
  if (company.employee_count > 100) reasons.push(`${company.employee_count} employees`);
  if (company.annual_revenue) reasons.push(`revenue: ${company.annual_revenue}`);
  if (painLevel >= 4) reasons.push("likely high pain with current FX/banking");
  if (cryptoReadiness >= 3) reasons.push("crypto-aware");
  if (strategicFit >= 4) reasons.push("high-value vertical");
  if (reasons.length === 0) reasons.push("moderate fit based on available data");

  return {
    scores: {
      cross_border_volume: crossBorderVolume,
      pain_level: painLevel,
      accessibility,
      crypto_readiness: cryptoReadiness,
      strategic_fit: strategicFit,
    },
    weighted_total: weightedTotal,
    tier,
    reasoning: reasons.join("; "),
  };
}
