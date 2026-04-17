import { NextResponse } from 'next/server';
import { readDataFile, writeDataFile } from '@/lib/data';

export async function POST(req: Request) {
  const { inputName, data } = await req.json();

  if (inputName === 'data' && data) {
    // Create a new note from graph input
    const existing = (readDataFile('notes') as { notes?: unknown[] }) || { notes: [] };
    const notes = existing.notes || [];
    const newNote = {
      id: 'note-' + Date.now(),
      title: data.title || 'Neue Notiz',
      content: data.content || data.body || '',
      tags: data.tags || [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    writeDataFile('notes', { notes: [newNote, ...notes] });
    return NextResponse.json({ ok: true, note: newNote });
  }

  return NextResponse.json({ ok: true });
}
