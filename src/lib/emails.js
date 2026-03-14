// Template-based cold outreach email generator for MoneyBadger

const VERTICAL_HOOKS = {
  "Tourism & Hospitality": {
    pain: "international booking payments and forex headaches",
    benefit: "settle inbound tourist payments in Rand within minutes instead of waiting days for SWIFT transfers",
    angle: "tourism operators",
  },
  "Import/Export & Trade": {
    pain: "SWIFT fees and slow supplier payments eating into margins",
    benefit: "pay international suppliers at a fraction of traditional banking costs with same-day settlement",
    angle: "importers and exporters",
  },
  "Tech & SaaS": {
    pain: "paying global contractors and collecting international revenue",
    benefit: "pay remote developers and collect SaaS revenue globally without the SWIFT tax",
    angle: "tech companies scaling internationally",
  },
  "E-commerce": {
    pain: "cross-border supplier payments and FX spreads on imports",
    benefit: "pay overseas suppliers faster and cheaper, keeping more margin on every product",
    angle: "e-commerce businesses sourcing internationally",
  },
  "Agriculture & Wine": {
    pain: "export revenue getting clipped by bank fees and slow settlement",
    benefit: "receive export payments faster with transparent FX — no hidden spreads",
    angle: "agricultural exporters",
  },
  "Education": {
    pain: "collecting international student fees and dealing with cross-border transfer delays",
    benefit: "receive international student payments settled in Rand, faster and cheaper than traditional banking",
    angle: "education institutions with international students",
  },
  "Professional Services": {
    pain: "billing international clients and absorbing costly FX conversions",
    benefit: "invoice and collect from global clients with minimal fees and fast Rand settlement",
    angle: "professional services firms with global clients",
  },
  "NGOs & Development": {
    pain: "international donor transfers losing value to banking fees",
    benefit: "receive international grants and donations with more of the money actually arriving",
    angle: "organisations receiving international funding",
  },
};

const DEFAULT_HOOK = {
  pain: "cross-border payment friction",
  benefit: "move money internationally faster and cheaper using crypto rails, settled in Rand",
  angle: "businesses with international payment needs",
};

function pickSubjectLine(company, hook) {
  const subjects = [
    `Quick question about ${company.name}'s cross-border payments`,
    `${company.name} + MoneyBadger — faster international payments`,
    `Cutting your cross-border fees, ${company.name.split(" ")[0]}?`,
    `Re: ${hook.pain}`,
  ];
  // Deterministic pick based on company name length
  return subjects[company.name.length % subjects.length];
}

export function generateEmail(company, score) {
  const hook = VERTICAL_HOOKS[company.vertical] || DEFAULT_HOOK;
  const subject = pickSubjectLine(company, hook);

  const tierIntro = score.tier === "A"
    ? `I've been looking at ${hook.angle} in SA and ${company.name} stood out.`
    : `I came across ${company.name} and thought this might be relevant.`;

  const descriptionRef = company.description
    ? `I see you're ${company.description.toLowerCase().replace(/\.$/, "")} — which means you're likely dealing with ${hook.pain}.`
    : `As a business in the ${company.vertical} space, you're likely dealing with ${hook.pain}.`;

  const body = `Hi there,

${tierIntro}

${descriptionRef}

We're MoneyBadger, based in Stellenbosch. We help SA businesses ${hook.benefit}. We use crypto rails under the hood (Bitcoin, stablecoins) but you receive and send Rand — no crypto knowledge needed.

We're already integrated with Peach Payments, Ozow, Luno and VALR, and work with businesses doing R500k+ monthly in cross-border volume.

Would a 15-minute call this week make sense? Happy to show you what the numbers look like for a business like yours.

Cheers,
Ben
MoneyBadger`;

  const cta = "15-minute call to walk through the numbers for your specific use case";

  return { subject, body, cta };
}
