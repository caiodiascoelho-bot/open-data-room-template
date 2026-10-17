import type { Interview } from "../contracts";

function privatePattern(value: string) {
  return Array.from(value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/gu, " "))
    .map((c) => {
      if (/\s/u.test(c)) return "\\s+";
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /\p{L}/u.test(c) ? `${escaped}\\p{M}*` : escaped;
    })
    .join("");
}

// Defense in depth for legacy summaries and acciproduct copied contact details.
// This is deterministic redaction, not a claim to detect every kind of personal data.
function anonymize(value: string, interview: Interview) {
  const privateValues = [
    interview.name,
    interview.email || "",
    interview.company || "",
    ...interview.name.split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 2),
  ]
    .map((v) => v.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let result = value.normalize("NFD");
  if (privateValues.length) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${Array.from(new Set(privateValues), privatePattern).join("|")})(?![\\p{L}\\p{N}])`,
      "giu",
    );
    result = result.replace(pattern, "[private]");
  }
  return result.replace(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/gu, "[private]").normalize("NFC");
}

export function investorInterview(interview: Interview): Interview {
  const summary = anonymize(interview.public_summary, interview);
  // Explicit allowlist: never spread a database record into an investor response.
  return {
    id: interview.id,
    number: interview.number,
    name: `Interview #${interview.number}`,
    date: interview.date,
    segment: anonymize(interview.segment, interview),
    insights: summary,
    public_summary: summary,
    problem: "",
    next_step: "",
    stage: interview.stage,
    priority: interview.priority,
    published: interview.published,
    updated_at: interview.updated_at,
  };
}
