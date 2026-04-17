'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created: string;
  updated: string;
  pinned?: boolean;
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'gerade eben';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
  return d.toLocaleDateString('de', { day: '2-digit', month: '2-digit' });
}

export default function NotesApp() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'date' | 'alpha'>('date');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'unsaved'>('idle');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [toast, setToast] = useState({ msg: '', type: '', show: false });
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Always-current refs
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldFocusTitleRef = useRef(false);

  // DOM refs for uncontrolled inputs
  const titleRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // ── Computed ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...notes];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeTag) {
      result = result.filter(n => (n.tags || []).includes(activeTag));
    }
    if (sortMode === 'alpha') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      result.sort((a, b) =>
        new Date(b.updated || b.created).getTime() - new Date(a.updated || a.created).getTime()
      );
    }
    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return result;
  }, [notes, searchQuery, activeTag, sortMode]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach(n => (n.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [notes]);

  const activeNote = useMemo(() => notes.find(n => n.id === activeId) ?? null, [notes, activeId]);

  // ── Storage ───────────────────────────────────────────────────────────────
  const loadNotes = useCallback(async (): Promise<Note[]> => {
    try {
      const r = await fetch('/api/notes');
      if (r.ok) {
        const d = await r.json();
        return d.notes || [];
      }
    } catch {}
    try {
      const raw = localStorage.getItem('pulseos_notes');
      if (raw) return JSON.parse(raw).notes || [];
    } catch {}
    return [];
  }, []);

  const saveNotes = useCallback(async (notesToSave: Note[]) => {
    const payload = { notes: notesToSave };
    try {
      await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {}
    try { localStorage.setItem('pulseos_notes', JSON.stringify(payload)); } catch {}
  }, []);

  // ── UI helpers ────────────────────────────────────────────────────────────
  const updateWordCount = useCallback((text: string) => {
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    setCharCount(text.length);
  }, []);

  const showToast = useCallback((msg: string, type = '') => {
    setToast({ msg, type, show: true });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToast(prev => ({ ...prev, show: false })),
      2500
    );
  }, []);

  // ── Note state helpers ────────────────────────────────────────────────────
  const flushActiveToMemory = useCallback((): Note[] => {
    const aid = activeIdRef.current;
    if (!aid) return notesRef.current;
    return notesRef.current.map(n => {
      if (n.id !== aid) return n;
      return {
        ...n,
        title: titleRef.current?.value || '',
        content: editorRef.current?.value || '',
        tags: (tagsRef.current?.value || '').split(',').map(t => t.trim()).filter(Boolean),
        updated: new Date().toISOString(),
      };
    });
  }, []);

  const scheduleAutoSave = useCallback(() => {
    isDirtyRef.current = true;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const newNotes = flushActiveToMemory();
      setNotes(newNotes);
      await saveNotes(newNotes);
      setSaveStatus('saved');
      isDirtyRef.current = false;
    }, 1000);
  }, [flushActiveToMemory, saveNotes]);

  // ── Markdown preview ──────────────────────────────────────────────────────
  const renderMdPreview = useCallback(async () => {
    const content = editorRef.current?.value || '';
    try {
      const { marked } = await import('marked');
      const result = marked.parse(content, { breaks: true });
      setPreviewHtml(typeof result === 'string' ? result : await result);
    } catch {
      setPreviewHtml(esc(content).replace(/\n/g, '<br>'));
    }
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const createNote = useCallback(() => {
    const note: Note = {
      id: 'note-' + Date.now(),
      title: '',
      content: '',
      tags: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    shouldFocusTitleRef.current = true;
    const newNotes = [note, ...notesRef.current];
    setNotes(newNotes);
    setActiveId(note.id);
    isDirtyRef.current = false;
    saveNotes(newNotes);
  }, [saveNotes]);

  const deleteNoteById = useCallback((nid: string) => {
    const newNotes = notesRef.current.filter(n => n.id !== nid);
    setNotes(newNotes);
    saveNotes(newNotes);
    if (activeIdRef.current === nid) {
      setActiveId(newNotes.length > 0 ? newNotes[0].id : null);
    }
  }, [saveNotes]);

  const togglePin = useCallback((nid: string) => {
    const newNotes = notesRef.current.map(n =>
      n.id === nid ? { ...n, pinned: !n.pinned } : n
    );
    setNotes(newNotes);
    saveNotes(newNotes);
  }, [saveNotes]);

  // ── Markdown toolbar ──────────────────────────────────────────────────────
  const insertMd = useCallback((cmd: string) => {
    if (previewMode) setPreviewMode(false);
    const el = editorRef.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = el.value.slice(s, e);
    let pre = '', post = '', ph = 'Text';
    switch (cmd) {
      case 'bold':    pre = '**'; post = '**'; ph = 'fetter Text'; break;
      case 'italic':  pre = '_';  post = '_';  ph = 'kursiv'; break;
      case 'heading': pre = '# '; ph = 'Überschrift'; break;
      case 'h2':      pre = '## '; ph = 'Überschrift 2'; break;
      case 'ul':      pre = '\n- '; ph = 'Listenpunkt'; break;
      case 'ol':      pre = '\n1. '; ph = 'Punkt'; break;
      case 'code':    pre = '`'; post = '`'; ph = 'code'; break;
      case 'quote':   pre = '\n> '; ph = 'Zitat'; break;
      case 'link': {
        const url = prompt('URL eingeben:');
        if (!url) return;
        pre = '['; post = '](' + url + ')'; ph = sel || 'Linktext';
        break;
      }
    }
    const txt = sel || ph;
    el.value = el.value.slice(0, s) + pre + txt + post + el.value.slice(e);
    const np = s + pre.length + txt.length;
    el.setSelectionRange(sel ? np + post.length : s + pre.length, np);
    el.focus();
    scheduleAutoSave();
  }, [previewMode, scheduleAutoSave]);

  // ── Backup ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ notes: notesRef.current, exported: new Date().toISOString() }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportiert', 'success');
  }, [showToast]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (!Array.isArray(data.notes)) throw new Error('Ungültiges Format');
        setNotes(data.notes);
        setActiveId(null);
        await saveNotes(data.notes);
        showToast(data.notes.length + ' Notizen importiert', 'success');
        e.target.value = '';
      } catch (err) {
        showToast('Import-Fehler: ' + (err as Error).message, 'error');
      }
    };
    reader.readAsText(file);
  }, [saveNotes, showToast]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Init: load notes on mount
  useEffect(() => {
    loadNotes().then(loaded => {
      setNotes(loaded);
      if (loaded.length > 0) setActiveId(loaded[0].id);
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [loadNotes]);

  // Sync uncontrolled inputs when active note changes
  useEffect(() => {
    if (!activeId) return;
    const note = notesRef.current.find(n => n.id === activeId);
    if (!note) return;
    if (titleRef.current) titleRef.current.value = note.title || '';
    if (tagsRef.current) tagsRef.current.value = (note.tags || []).join(', ');
    if (editorRef.current) editorRef.current.value = note.content || '';
    updateWordCount(note.content || '');
    setSaveStatus('saved');
    isDirtyRef.current = false;
    if (shouldFocusTitleRef.current) {
      titleRef.current?.focus();
      shouldFocusTitleRef.current = false;
    }
  }, [activeId, updateWordCount]);

  // Re-render markdown preview when entering preview mode
  useEffect(() => {
    if (previewMode) renderMdPreview();
  }, [previewMode, renderMdPreview]);

  // Wire up checklist interactions after preview renders
  useEffect(() => {
    if (!previewMode || !previewRef.current) return;
    previewRef.current.querySelectorAll<HTMLLIElement>('li').forEach(li => {
      const text = li.textContent || '';
      const isChecked = /^\s*\[x\]/i.test(text);
      const isUnchecked = /^\s*\[ \]/.test(text);
      if (!isChecked && !isUnchecked) return;
      li.classList.add('checklist-item');
      if (isChecked) li.classList.add('checked');
      const label = text.replace(/^\s*\[[ x]\]\s*/i, '');
      li.innerHTML = `<span class="cb">${isChecked ? '✓' : ''}</span><span>${esc(label)}</span>`;
      li.addEventListener('click', () => {
        if (!editorRef.current) return;
        const src = editorRef.current.value;
        const regex = /- \[[ x]\]/gi;
        const allCheckboxes = Array.from(
          previewRef.current?.querySelectorAll<HTMLLIElement>('.checklist-item') || []
        );
        const pos = allCheckboxes.indexOf(li);
        let count = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(src)) !== null) {
          if (count === pos) {
            const old = match[0];
            const replacement = old.includes('[ ]')
              ? old.replace('[ ]', '[x]')
              : old.replace(/\[x\]/i, '[ ]');
            editorRef.current.value =
              src.slice(0, match.index) + replacement + src.slice(match.index + old.length);
            scheduleAutoSave();
            renderMdPreview();
            break;
          }
          count++;
        }
      });
    });
  }, [previewHtml, previewMode, scheduleAutoSave, renderMdPreview]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n') {
        e.preventDefault();
        createNote();
      }
      if (mod && e.key === 'p') {
        e.preventDefault();
        if (activeIdRef.current) {
          setPreviewMode(prev => !prev);
        }
      }
      if (mod && e.key === 's') {
        e.preventDefault();
        if (isDirtyRef.current) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          const newNotes = flushActiveToMemory();
          setNotes(newNotes);
          saveNotes(newNotes);
          setSaveStatus('saved');
          isDirtyRef.current = false;
        }
      }
      if (mod && e.key === 'b' && document.activeElement === editorRef.current) {
        e.preventDefault();
        insertMd('bold');
      }
      if (mod && e.key === 'i' && document.activeElement === editorRef.current) {
        e.preventDefault();
        insertMd('italic');
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        setFocusMode(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowConfirm(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [createNote, flushActiveToMemory, saveNotes, insertMd]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`app-root${focusMode ? ' focus-mode' : ''}`}>
      {/* Topbar */}
      <div className="topbar">
        <span className="topbar-title">📝 Meine Notizen</span>
        <input
          className="topbar-search"
          type="text"
          placeholder="Suchen..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button className="btn-icon" onClick={handleExport} title="Backup exportieren (JSON)">⬇</button>
        <label className="btn-icon" title="Backup importieren" style={{ cursor: 'pointer' }}>
          ⬆
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </label>
        <button
          className={`btn-icon btn-focus${focusMode ? ' active-focus' : ''}`}
          onClick={() => setFocusMode(f => !f)}
          title="Fokus-Modus (Cmd+\)"
        >⛶</button>
        <button className="btn-new-note" onClick={createNote}>+ Neue Notiz</button>
      </div>

      <div className="layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-section">
            Notizen
            <span className="note-count">{filtered.length}</span>
          </div>

          {/* Tag filter bar */}
          {allTags.length > 0 && (
            <div className="tag-filter-bar">
              <button
                className={`tag-filter-chip${activeTag === null ? ' active' : ''}`}
                onClick={() => setActiveTag(null)}
              >Alle</button>
              {allTags.map(t => (
                <button
                  key={t}
                  className={`tag-filter-chip${activeTag === t ? ' active' : ''}`}
                  onClick={() => setActiveTag(at => at === t ? null : t)}
                >{t}</button>
              ))}
            </div>
          )}

          {/* Note list */}
          <div className="note-list">
            {filtered.length === 0 ? (
              <div className="empty-sidebar">
                <div className="empty-icon">🔍</div>
                <span>{searchQuery || activeTag ? 'Keine Treffer' : 'Keine Notizen'}</span>
              </div>
            ) : (
              filtered.map(note => (
                <div
                  key={note.id}
                  className={`note-item${note.id === activeId ? ' active' : ''}${note.pinned ? ' pinned' : ''}`}
                  onClick={() => {
                    if (isDirtyRef.current) {
                      const newNotes = flushActiveToMemory();
                      setNotes(newNotes);
                      saveNotes(newNotes);
                    }
                    setActiveId(note.id);
                  }}
                >
                  <div className="note-item-header">
                    <div className="note-item-title">{note.title || 'Unbenannte Notiz'}</div>
                    <button
                      className={`pin-btn${note.pinned ? ' pinned' : ''}`}
                      title={note.pinned ? 'Lösen' : 'Anpinnen'}
                      onClick={ev => { ev.stopPropagation(); togglePin(note.id); }}
                    >📌</button>
                  </div>
                  <div className="note-item-meta">
                    <span>{formatDate(note.updated || note.created)}</span>
                    {note.tags?.[0] && <span className="tag-badge">{note.tags[0]}</span>}
                  </div>
                  {note.content && (
                    <div className="note-item-preview">
                      {(note.content || '').replace(/[#*`[\]_~]/g, '').slice(0, 60)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="sidebar-footer">
            <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>Sort:</span>
            <button
              className={`sort-btn${sortMode === 'date' ? ' active' : ''}`}
              onClick={() => setSortMode('date')}
            >Datum</button>
            <button
              className={`sort-btn${sortMode === 'alpha' ? ' active' : ''}`}
              onClick={() => setSortMode('alpha')}
            >A–Z</button>
          </div>
        </div>

        {/* Editor Panel */}
        <div className="editor-panel">
          {!activeId ? (
            <div className="empty-editor">
              <div className="empty-icon">📝</div>
              <p>Notiz auswählen oder neue erstellen</p>
              <small>Cmd+N für neue Notiz</small>
            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
              <div className="editor-header">
                <input
                  ref={titleRef}
                  className="title-input"
                  type="text"
                  placeholder="Titel..."
                  onChange={() => scheduleAutoSave()}
                />
                <input
                  ref={tagsRef}
                  className="tags-input"
                  type="text"
                  placeholder="Tags (kommagetrennt, z.B. arbeit, ideen)"
                  onChange={() => scheduleAutoSave()}
                />
              </div>
              <div className="editor-toolbar">
                {(
                  [
                    ['bold', <b key="b">B</b>],
                    ['italic', <i key="i">I</i>],
                    ['heading', 'H1'],
                    ['h2', 'H2'],
                    ['ul', '• Liste'],
                    ['ol', '1. Liste'],
                    ['code', '`code`'],
                    ['quote', '❝'],
                    ['link', '🔗'],
                  ] as [string, React.ReactNode][]
                ).map(([cmd, label]) => (
                  <button key={cmd} className="tb-btn" onClick={() => insertMd(cmd)}>
                    {label}
                  </button>
                ))}
                <div className="tb-sep" />
                <button
                  className={`tb-btn${previewMode ? ' active' : ''}`}
                  onClick={() => {
                    const next = !previewMode;
                    setPreviewMode(next);
                    if (!next) editorRef.current?.focus();
                  }}
                >👁 Preview</button>
                <div style={{ flex: 1 }} />
                <button
                  className="tb-btn"
                  style={{ color: '#ef4444', opacity: 0.7 }}
                  onClick={() => activeId && setShowConfirm(true)}
                >🗑</button>
              </div>
              <div className="editor-body">
                <textarea
                  ref={editorRef}
                  id="content-editor"
                  style={{ display: previewMode ? 'none' : undefined }}
                  placeholder={
                    'Notiz schreiben... (Markdown wird unterstützt)\n\n# Überschrift\n**fett**, _kursiv_, `code`'
                  }
                  onChange={() => {
                    scheduleAutoSave();
                    updateWordCount(editorRef.current?.value || '');
                  }}
                />
                {previewMode && (
                  <div
                    ref={previewRef}
                    id="content-preview"
                    className="visible"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
              <div className="editor-statusbar">
                <div className="save-indicator">
                  <div
                    className={`save-dot${
                      saveStatus === 'saved' ? ' saved' : saveStatus === 'unsaved' ? ' unsaved' : ''
                    }`}
                  />
                  <span>
                    {saveStatus === 'saved'
                      ? 'Gespeichert'
                      : saveStatus === 'unsaved'
                      ? 'Nicht gespeichert'
                      : '–'}
                  </span>
                </div>
                <span>{wordCount} Wörter</span>
                <span>{charCount} Zeichen</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      <div className={`toast${toast.show ? ' show' : ''}${toast.type ? ' ' + toast.type : ''}`}>
        {toast.msg}
      </div>

      {/* Confirm Delete */}
      <div className={`confirm-overlay${showConfirm ? ' show' : ''}`}>
        <div className="confirm-box">
          <div className="confirm-msg">Notiz löschen?</div>
          <span className="confirm-sub">&quot;{activeNote?.title || 'Unbenannte Notiz'}&quot;</span>
          <div className="confirm-actions">
            <button className="btn-cancel" onClick={() => setShowConfirm(false)}>Abbrechen</button>
            <button
              className="btn-danger"
              onClick={() => {
                setShowConfirm(false);
                if (activeId) {
                  deleteNoteById(activeId);
                  showToast('Notiz gelöscht', 'success');
                }
              }}
            >Löschen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
