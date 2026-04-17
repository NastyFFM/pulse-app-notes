import { NextResponse } from 'next/server';
import { readDataFile, writeDataFile } from '@/lib/data';

export async function GET() {
  const data = readDataFile('notes');
  return NextResponse.json(data || { notes: [] });
}

export async function PUT(req: Request) {
  const body = await req.json();
  writeDataFile('notes', body);
  return NextResponse.json({ ok: true });
}
