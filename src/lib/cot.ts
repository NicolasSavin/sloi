export interface CotRow {
  id: string;
  name: string;
  date: string;
  oi: number;
  long: number;
  short: number;
  net: number;
  netChange: number;
  invert: boolean;
  line: string;
}

export interface CotSnap {
  date: string;
  rows: CotRow[];
  line: string;
}

const TFF = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";
const DISAGG = "https://www.cftc.gov/dea/newcot/f_disagg.txt";

const MAP: { id: string; name: string; kind: "tff" | "disagg"; re: RegExp; invert: boolean }[] = [
  { id: "EURUSD", name: "евро", kind: "tff", re: /^EURO FX - CHICAGO MERCANTILE EXCHANGE$/, invert: false },
  { id: "GBPUSD", name: "фунт", kind: "tff", re: /^BRITISH POUND - CHICAGO MERCANTILE EXCHANGE$/, invert: false },
  { id: "AUDUSD", name: "австралиец", kind: "tff", re: /^AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE$/, invert: false },
  { id: "NZDUSD", name: "новозеландец", kind: "tff", re: /^NEW ZEALAND DOLLAR - CHICAGO MERCANTILE EXCHANGE$/, invert: false },
  { id: "USDJPY", name: "иена", kind: "tff", re: /^JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE$/, invert: true },
  { id: "USDCHF", name: "франк", kind: "tff", re: /^SWISS FRANC - CHICAGO MERCANTILE EXCHANGE$/, invert: true },
  { id: "USDCAD", name: "канадец", kind: "tff", re: /^CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE$/, invert: true },
  { id: "SPY", name: "S&P", kind: "tff", re: /^E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE$/, invert: false },
  { id: "XAUUSD", name: "золото", kind: "disagg", re: /^GOLD - COMMODITY EXCHANGE INC\.$/, invert: false },
  { id: "XAGUSD", name: "серебро", kind: "disagg", re: /^SILVER - COMMODITY EXCHANGE INC\.$/, invert: false },
  { id: "USOIL", name: "нефть", kind: "disagg", re: /^CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE$/, invert: false },
];

function num(s: string | undefined) {
  const n = Number(String(s ?? "").replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function pick(row: string[], kind: "tff" | "disagg") {
  if (kind === "tff") {
    return { long: num(row[14]), short: num(row[15]), chL: num(row[31]), chS: num(row[32]) };
  }
  return { long: num(row[13]), short: num(row[14]), chL: num(row[60]), chS: num(row[61]) };
}

function who(kind: "tff" | "disagg") {
  return kind === "tff" ? "кванты/фонды (leveraged funds)" : "управляющие деньгами (managed money)";
}

function buildLine(name: string, kind: "tff" | "disagg", net: number, netChange: number, invert: boolean, pair: string) {
  const side = net > 0 ? "в лонгах" : net < 0 ? "в шортах" : "плоско";
  const ch =
    netChange > 4000 ? "за неделю ещё докупили" : netChange < -4000 ? "за неделю сократили" : "за неделю почти не меняли";
  const fx = invert
    ? net > 0
      ? `${pair}: лонги ${name} = давление на доллар в этой паре (шорт ${pair}).`
      : `${pair}: шорты ${name} = фонды ждут рост ${pair}.`
    : net > 0
      ? `${pair}: фонды держат лонг — попутный фон росту.`
      : net < 0
        ? `${pair}: фонды в шорте — попутный фон снижению.`
        : `${pair}: фонды без явной стороны.`;
  return `${who(kind)} по ${name} ${side} (${Math.round(net / 1000)} тыс. нетто). ${ch}. ${fx}`;
}

export function parseCotFiles(tff: string, disagg: string): CotSnap {
  const rows: CotRow[] = [];
  const tffRows = parseCsv(tff);
  const disRows = parseCsv(disagg);
  let date = "";
  for (const spec of MAP) {
    const src = spec.kind === "tff" ? tffRows : disRows;
    const hit = src.find((r) => spec.re.test(r[0]?.trim() ?? ""));
    if (!hit) continue;
    date = hit[2]?.trim() || date;
    const p = pick(hit, spec.kind);
    const net = p.long - p.short;
    const netChange = p.chL - p.chS;
    rows.push({
      id: spec.id,
      name: spec.name,
      date,
      oi: num(hit[7]),
      long: p.long,
      short: p.short,
      net,
      netChange,
      invert: spec.invert,
      line: buildLine(spec.name, spec.kind, net, netChange, spec.invert, spec.id),
    });
  }
  const lead = rows.find((r) => r.id === "XAUUSD") ?? rows[0];
  return {
    date,
    rows,
    line: lead
      ? `COT ${date}: ${lead.line}`
      : "Отчёт COT на этой неделе не подтянулся.",
  };
}

export const EMPTY_COT: CotSnap = { date: "", rows: [], line: "COT ещё нет." };

export function cotFor(id: string, cot?: CotSnap | null) {
  return cot?.rows.find((r) => r.id === id) ?? null;
}

export async function loadCot(): Promise<CotSnap> {
  const ctrl = AbortSignal.timeout(8000);
  const headers = { "User-Agent": "Mozilla/5.0 SLOI" };
  try {
    const [a, b] = await Promise.all([
      fetch(TFF, { signal: ctrl, headers }).then((r) => (r.ok ? r.text() : "")),
      fetch(DISAGG, { signal: ctrl, headers }).then((r) => (r.ok ? r.text() : "")),
    ]);
    if (!a && !b) return EMPTY_COT;
    return parseCotFiles(a, b);
  } catch {
    return EMPTY_COT;
  }
}
