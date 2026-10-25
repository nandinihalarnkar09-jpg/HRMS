/**
 * explain_policy retrieval: answers ONLY from stored policy text (agent guardrail).
 * Splits policy documents into sections and scores them by keyword overlap, including
 * common Hinglish words. If nothing scores high enough, returns found:false so the agent
 * must say "I don't know".
 */
export type PolicyDoc = { slug: string; title: string; body: string };
export type PolicySection = { doc: string; heading: string; text: string };

const STOP = new Set(
  ('a an the is are was were be to of in on for and or if my me i we you your it this that what how ' +
   'when can do does did will would should with as at by from about any much many there have has ' +
   'kya hai hain ka ki ke ko mein me se aur bhi toh kaise kitna kitne kitni batao bataiye please pls')
    .split(/\s+/),
);

/** Hinglish / synonym expansion → canonical policy words. */
const SYNONYMS: Record<string, string[]> = {
  chutti: ['leave'], chhutti: ['leave'], chuti: ['leave'], leaves: ['leave'], holiday: ['holiday'],
  bimar: ['sick'], bimari: ['sick'], beemar: ['sick'], ill: ['sick'], illness: ['sick'], medical: ['sick', 'certificate'],
  late: ['late'], der: ['late'], deri: ['late'],
  aadha: ['half'], half: ['half'], adha: ['half'],
  ghar: ['home', 'wfh'], wfh: ['wfh', 'home'], remote: ['wfh', 'home'],
  carry: ['carry', 'forward'], encash: ['encashment'], encashment: ['encashment'],
  pregnancy: ['maternity'], pregnant: ['maternity'], baby: ['maternity', 'paternity'], delivery: ['maternity'],
  father: ['paternity'], dad: ['paternity'],
  weekend: ['weekly', 'off'], saturday: ['saturday', 'weekly'], sunday: ['sunday', 'weekly'],
  sandwich: ['sandwich'], cl: ['casual'], sl: ['sick'], el: ['earned'], pl: ['earned', 'privilege'],
  lop: ['loss', 'pay'], salary: ['pay'], cut: ['loss', 'pay'], katega: ['loss', 'pay'],
  punch: ['punch', 'check'], checkin: ['check'], regularise: ['regularisation'], regularize: ['regularisation'],
  attendance: ['attendance'], hours: ['hours'], ghante: ['hours'],
};

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    const syn = SYNONYMS[w];
    if (syn) out.push(...syn);
    else out.push(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

export function splitSections(docs: PolicyDoc[]): PolicySection[] {
  const sections: PolicySection[] = [];
  for (const d of docs) {
    let heading = d.title;
    let buf: string[] = [];
    const flush = () => { const t = buf.join('\n').trim(); if (t) sections.push({ doc: d.title, heading, text: t }); buf = []; };
    for (const line of d.body.split('\n')) {
      if (/^#{1,6}\s/.test(line)) { flush(); heading = line.replace(/^#+\s*/, '').trim(); }
      else if (/^\s*[-*]\s/.test(line)) { flush(); buf.push(line.trim()); flush(); }
      else buf.push(line);
    }
    flush();
  }
  return sections;
}

export function searchPolicy(docs: PolicyDoc[], question: string, limit = 4):
  { found: true; sections: PolicySection[] } | { found: false; sections: [] } {
  const q = Array.from(new Set(tokenize(question)));
  if (q.length === 0) return { found: false, sections: [] };
  const scored = splitSections(docs).map((s) => {
    const words = new Set(tokenize(`${s.heading} ${s.text}`));
    const hits = q.filter((w) => words.has(w)).length;
    return { s, hits, score: hits / q.length };
  });
  const best = scored
    .filter((x) => x.hits >= Math.min(2, q.length) || x.score >= 0.5)
    .sort((a, b) => b.hits - a.hits || b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
  return best.length ? { found: true, sections: best } : { found: false, sections: [] };
}
