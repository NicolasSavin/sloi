import { getSql } from "@/lib/db";

export interface PublicSketch {
  id: string;
  instrument: string;
  notes: string;
  image: string;
  at: number;
}

const MAX = 40;
const MAX_IMAGE = 1_400_000;

function row(r: Record<string, unknown>): PublicSketch {
  return {
    id: String(r.id),
    instrument: String(r.instrument ?? ""),
    notes: String(r.notes ?? ""),
    image: String(r.image ?? ""),
    at: new Date(String(r.created_at)).getTime(),
  };
}

export async function listSketches(): Promise<PublicSketch[]> {
  const sql = await getSql();
  const rows = await sql`
    select id, instrument, notes, image, created_at
    from sketches
    order by created_at desc
    limit ${MAX}
  `;
  return rows.map(row);
}

export async function addSketch(input: { instrument: string; notes: string; image: string }) {
  if (input.notes.trim().length < 8) throw new Error("empty");
  if (!input.image.startsWith("data:image/") || input.image.length > MAX_IMAGE) throw new Error("image");
  const sql = await getSql();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const instrument = input.instrument.trim().slice(0, 80);
  const notes = input.notes.trim().slice(0, 4000);
  await sql`
    insert into sketches (id, instrument, notes, image, erase_token)
    values (${id}, ${instrument}, ${notes}, ${input.image}, ${token})
  `;
  await sql`
    delete from sketches
    where id in (
      select id from sketches order by created_at desc offset ${MAX}
    )
  `;
  return { id, token, at: Date.now(), instrument, notes };
}

export async function eraseSketch(id: string, token: string) {
  const sql = await getSql();
  const rows = await sql`delete from sketches where id = ${id} and erase_token = ${token} returning id`;
  return rows.length > 0;
}
