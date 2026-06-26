import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

function AssigneeTagInput({ value = [], onChange, darkMode }) {
  const [input, setInput] = useState('');

  function addTag(raw) {
    const names = raw.split(',').map(n => n.trim()).filter(Boolean);
    if (!names.length) return;
    onChange([...value, ...names]);
    setInput('');
  }
  function removeTag(idx) { onChange(value.filter((_, i) => i !== idx)); }
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
  }

  const wrapClass = darkMode
    ? 'bg-slate-700 border-slate-600'
    : 'bg-white border-slate-300';
  const tagClass = darkMode
    ? 'bg-indigo-900/50 text-indigo-300'
    : 'bg-indigo-100 text-indigo-700';
  const inputClass = darkMode ? 'text-slate-100 placeholder-slate-500' : 'text-slate-800 placeholder-slate-400';

  return (
    <div className={`flex flex-wrap gap-1.5 p-2 border rounded-lg min-h-[42px] ${wrapClass}`}>
      {value.map((name, i) => (
        <span key={i} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${tagClass}`}>
          {name}
          <button type="button" onClick={() => removeTag(i)} className="hover:text-white transition-colors leading-none">✕</button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input.trim() && addTag(input)}
        placeholder={value.length ? '' : 'Type name, press Enter or comma...'}
        className={`flex-1 min-w-24 bg-transparent text-sm focus:outline-none ${inputClass}`}
      />
    </div>
  );
}

export default function TaskModal({ task, project, categories, onClose, onUpdate, onDelete, onAddNote, onDeleteNote, darkMode }) {
  const [title, setTitle]           = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate]       = useState(task.due_date ? task.due_date.split('T')[0] : '');
  const [priority, setPriority]     = useState(task.priority);
  const [assignees, setAssignees]   = useState(Array.isArray(task.assignees) ? task.assignees : []);
  const [categoryId, setCategoryId] = useState(task.category_id || '');
  const [notes, setNotes]           = useState([]);
  const [newNote, setNewNote]       = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(task.due_date ? task.due_date.split('T')[0] : '');
    setPriority(task.priority);
    setAssignees(Array.isArray(task.assignees) ? task.assignees : []);
    setCategoryId(task.category_id || '');
    loadNotes();
    loadAttachments();
  }, [task.id]);

  async function loadNotes() {
    try { setNotes(await api.getNotes(task.id)); } catch {}
  }
  async function loadAttachments() {
    try { setAttachments(await api.getAttachments(task.id)); } catch {}
  }
  async function handleSave(fields) {
    setSaving(true);
    try { await onUpdate(task.id, fields); } finally { setSaving(false); }
  }
  async function handleAddNote(e) {
    e.preventDefault();
    if (!newNote.trim()) return;
    try {
      const note = await onAddNote(task.id, newNote.trim());
      setNotes(prev => [...prev, note]);
      setNewNote('');
    } catch {}
  }
  async function handleDeleteNote(noteId) {
    try {
      await onDeleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch {}
  }
  function handleNoteKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(e); }
  }
  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const att = await api.uploadAttachment(task.id, fd);
        setAttachments(prev => [...prev, att]);
      }
    } catch (err) { alert('Failed to upload: ' + err.message); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }
  async function handleDeleteAttachment(id) {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.deleteAttachment(id);
      setAttachments(prev => prev.filter(a => a.id !== id));
    } catch {}
  }
  function formatBytes(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/(1024*1024)).toFixed(1) + ' MB';
  }

  const columns = project?.columns || [];

  // Theme tokens
  const panelBg     = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const headerBorder = darkMode ? 'border-slate-700' : 'border-slate-200';
  const titleColor  = darkMode ? 'text-slate-200' : 'text-slate-800';
  const labelColor  = darkMode ? 'text-slate-400' : 'text-slate-500';
  const inputClass  = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-indigo-500';
  const closeBtn    = darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600';
  const noteCard    = darkMode ? 'bg-slate-700/60' : 'bg-slate-100';
  const noteText    = darkMode ? 'text-slate-200' : 'text-slate-700';
  const noteMeta    = darkMode ? 'text-slate-500' : 'text-slate-400';
  const noteDelete  = darkMode ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500';
  const attCard     = darkMode ? 'bg-slate-700/50' : 'bg-slate-100';
  const attText     = darkMode ? 'text-slate-300' : 'text-slate-700';
  const attSize     = darkMode ? 'text-slate-500' : 'text-slate-400';
  const footerBorder = darkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-md border-l shadow-2xl overflow-y-auto ${panelBg}`}>
        <div className={`flex items-center justify-between p-4 border-b ${headerBorder}`}>
          <h2 className={`text-sm font-semibold ${titleColor}`}>Task Detail</h2>
          <button onClick={onClose} className={`text-xl leading-none transition-colors ${closeBtn}`}>✕</button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => title !== task.title && handleSave({ title })}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`} />
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              onBlur={() => description !== (task.description || '') && handleSave({ description })}
              rows={4} placeholder="Add a description..."
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none resize-none ${inputClass}`} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Priority</label>
              <select value={priority} onChange={e => { setPriority(e.target.value); handleSave({ priority: e.target.value }); }}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); handleSave({ dueDate: e.target.value }); }}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`} />
            </div>
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Column</label>
            <select value={task.column_id} onChange={e => handleSave({ columnId: e.target.value })}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`}>
              {columns.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
            </select>
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Category</label>
            <select value={categoryId} onChange={e => { setCategoryId(e.target.value); handleSave({ categoryId: e.target.value }); }}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none ${inputClass}`}>
              <option value="">None</option>
              {(categories || []).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>

          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Assignees</label>
            <AssigneeTagInput value={assignees} darkMode={darkMode}
              onChange={vals => { setAssignees(vals); handleSave({ assignees: vals }); }} />
          </div>

          {/* Attachments */}
          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Attachments</label>
            {attachments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {attachments.map(att => (
                  <div key={att.id} className={`flex items-center gap-2 rounded px-3 py-2 ${attCard}`}>
                    <span className={`text-xs flex-1 truncate ${attText}`}>{att.filename}</span>
                    <span className={`text-xs ${attSize}`}>{formatBytes(att.size_bytes)}</span>
                    <a href={api.downloadAttachment(att.id)} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-xs">Download</a>
                    <button onClick={() => handleDeleteAttachment(att.id)} className={`text-xs transition-colors ${noteDelete}`}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
              {uploading ? 'Uploading...' : '+ Attach file'}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className={`block text-xs mb-1.5 uppercase tracking-wide font-medium ${labelColor}`}>Notes</label>
            {notes.length > 0 && (
              <div className="space-y-2 mb-3">
                {notes.map(note => (
                  <div key={note.id} className={`rounded-lg p-3 text-sm ${noteCard}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`whitespace-pre-wrap ${noteText}`}>{note.content}</p>
                      <button onClick={() => handleDeleteNote(note.id)} className={`text-xs shrink-0 transition-colors ${noteDelete}`}>✕</button>
                    </div>
                    <p className={`text-xs mt-1 ${noteMeta}`}>{new Date(note.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={handleNoteKeyDown}
              placeholder="Add a note... (Enter to submit, Shift+Enter for newline)"
              rows={3} className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none ${inputClass}`} />
            <button onClick={handleAddNote} disabled={!newNote.trim()}
              className="mt-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Add Note
            </button>
          </div>

          <div className={`pt-2 border-t text-xs space-y-1 ${footerBorder}`}>
            <p>Created: {new Date(task.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(task.updated_at).toLocaleString()}</p>
          </div>

          <button onClick={() => { if (confirm('Delete this task?')) onDelete(task.id); }}
            className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm font-medium py-2 rounded-lg transition-colors border border-red-800/30">
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
}
