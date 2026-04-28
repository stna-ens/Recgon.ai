import { NextResponse } from 'next/server';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    fs.appendFileSync('/tmp/recgon-click.log', `${new Date().toISOString()} ${body}\n`);
  } catch {}
  return NextResponse.json({ ok: true });
}
