import { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

// ── Subtasks section ───────────────────────────────────────────────────────
// One subtask row: drag handle, checkbox, title (click to expand into description
// + due-date editor), due-date pill, delete button on hover.
function SubtaskRow({ subtask, darkMode, onToggle, onUpdate, onDelete }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging
  } = useSortable({ id: subtask.id });
  const [expanded, setExpanded] = useState(false);
  const [draftTitle, setDraftTitle] = useState(subtask.title);
  const [draftDesc, setDraftDesc] = useState(subtask.description || '');
  const [draftDue, setDraftDue] = useState(subtask.due_date ? subtask.due_date.split('T')[0] : '');

  // Reset drafts when the underlying subtask changes (e.g. after a refetch)
  useEffect(() => {
    setDraftTitle(subtask.title);
    setDraftDesc(subtask.description || '');
    setDraftDue(subtask.due_date ? subtask.due_date.split('T')[0] : '');
  }, [subtask.id, subtask.title, subtask.description, subtask.due_date]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const rowBg    = darkMode ? 'bg-slate-700/40 hover:bg-slate-700/70' : 'bg-slate-100 hover:bg-slate-200/70';
  const textMain = darkMode ? 'text-slate-200' : 'text-slate-700';
  const textDone = darkMode ? 'text-slate-500 line-through' : 'text-slate-400 line-through';
  const handleColor = darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600';
  const inputClass = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-indigo-500';
  const meta = darkMode ? 'text-slate-500' : 'text-slate-400';

  function commitTitle() {
    const v = draftTitle.trim();
    if (v && v !== subtask.title) onUpdate(subtask.id, { title: v });
    else setDraftTitle(subtask.title);
  }
  function commitDesc() {
    if (draftDesc !== (subtask.description || '')) onUpdate(subtask.id, { description: draftDesc });
  }
  function commitDue() {
    if (draftDue !== (subtask.due_date ? subtask.due_date.split('T')[0] : '')) {
      onUpdate(subtask.id, { dueDate: draftDue || null });
    }
  }

  // Due-date pill coloring
  let dueLabel = null;
  let duePill = null;
  if (subtask.due_date) {
    const d = new Date(subtask.due_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const ms = due - today;
    if (ms < 0 && !subtask.completed) {
      duePill = 'bg-red-900/40 text-red-300 border-red-800/50';
      dueLabel = 'Overdue';
    } else if (ms === 0 && !subtask.completed) {
      duePill = 'bg-amber-900/40 text-amber-300 border-amber-800/50';
      dueLabel = 'Today';
    } else {
      duePill = darkMode ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-slate-200 text-slate-500 border-slate-300';
      dueLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg ${rowBg} transition-colors`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={`cursor-grab active:cursor-grabbing text-sm leading-none ${handleColor} select-none`}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={!!subtask.completed}
          onChange={() => onToggle(subtask.id, !subtask.completed)}
          className="rounded cursor-pointer"
          aria-label={`Mark subtask "${subtask.title}" as ${subtask.completed ? 'incomplete' : 'complete'}`}
        />
        {/* Title (click to expand) */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className={`flex-1 text-left text-sm truncate ${subtask.completed ? textDone : textMain}`}
          title={expanded ? 'Hide details' : 'Show details'}
        >
          {subtask.title}
        </button>
        {/* Due date pill */}
        {duePill && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${duePill}`}>{dueLabel}</span>
        )}
        {/* Delete (visible on row hover) */}
        <button
          type="button"
          onClick={() => { if (confirm('Delete this subtask?')) onDelete(subtask.id); }}
          className={`text-xs opacity-0 group-hover:opacity-100 hover:text-red-400 ${meta} transition-opacity`}
          title="Delete subtask"
          aria-label="Delete subtask"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pt-1 space-y-2 border-t border-slate-700/30">
          <input
            type="text"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            placeholder="Subtask title..."
            className={`w-full text-sm border rounded px-2 py-1 focus:outline-none ${inputClass}`}
          />
          <textarea
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            onBlur={commitDesc}
            rows={2}
            placeholder="Notes... (own description for this subtask)"
            className={`w-full text-xs border rounded px-2 py-1 focus:outline-none resize-none ${inputClass}`}
          />
          <div className="flex items-center gap-2">
            <label className={`text-[10px] uppercase tracking-wide ${meta}`}>Due</label>
            <input
              type="date"
              value={draftDue}
              onChange={e => setDraftDue(e.target.value)}
              onBlur={commitDue}
              className={`text-xs border rounded px-2 py-1 focus:outline-none ${inputClass}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SubtasksSection({ taskId, darkMode, refreshKey = 0 }) {
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function load() {
    setLoading(true);
    try {
      const list = await api.getSubtasks(taskId);
      setSubtasks(list);
    } catch (err) {
      console.error('Failed to load subtasks:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [taskId, refreshKey]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const created = await api.createSubtask(taskId, { title });
      setSubtasks(prev => [...prev, created]);
      setNewTitle('');
    } catch (err) {
      console.error('Failed to create subtask:', err);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id, completed) {
    // Optimistic
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, completed } : s));
    try {
      await api.updateSubtask(id, { completed });
    } catch (err) {
      console.error('Failed to toggle subtask:', err);
      // Revert
      setSubtasks(prev => prev.map(s => s.id === id ? { ...s, completed: !completed } : s));
    }
  }

  async function handleUpdate(id, fields) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s));
    try {
      const updated = await api.updateSubtask(id, fields);
      setSubtasks(prev => prev.map(s => s.id === id ? updated : s));
    } catch (err) {
      console.error('Failed to update subtask:', err);
    }
  }

  async function handleDelete(id) {
    setSubtasks(prev => prev.filter(s => s.id !== id));
    try {
      await api.deleteSubtask(id);
    } catch (err) {
      console.error('Failed to delete subtask:', err);
    }
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIdx = subtasks.findIndex(s => s.id === active.id);
    const newIdx = subtasks.findIndex(s => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(subtasks, oldIdx, newIdx);
    setSubtasks(reordered);
    try {
      await api.reorderSubtasks(taskId, reordered.map(s => s.id));
    } catch (err) {
      console.error('Failed to reorder subtasks:', err);
      // Revert
      load();
    }
  }

  const completed = subtasks.filter(s => s.completed).length;
  const total = subtasks.length;

  const labelColor = darkMode ? 'text-slate-400' : 'text-slate-500';
  const addInput = darkMode
    ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-indigo-500';

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <label className={`block text-xs uppercase tracking-wide font-medium ${labelColor}`}>
          Subtasks <span className={`ml-1 text-[10px] normal-case tracking-normal ${labelColor}`}>({completed}/{total})</span>
        </label>
      </div>
      {loading && subtasks.length === 0 ? (
        <p className={`text-xs ${labelColor}`}>Loading…</p>
      ) : subtasks.length === 0 ? (
        <p className={`text-xs ${labelColor} italic mb-2`}>No subtasks yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={subtasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5 mb-2">
              {subtasks.map(s => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  darkMode={darkMode}
                  onToggle={handleToggle}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="+ Add subtask (Enter to save)"
          disabled={adding}
          className={`flex-1 text-sm border rounded-lg px-3 py-1.5 focus:outline-none ${addInput} disabled:opacity-50`}
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || adding}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Add
        </button>
      </form>
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
  // Bumped on any task change to trigger subtasks refetch
  const [subtaskRefreshKey, setSubtaskRefreshKey] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(task.due_date ? task.due_date.split('T')[0] : '');
    setPriority(task.priority);
    setAssignees(Array.isArray(task.assignees) ? task.assignees : []);
    setCategoryId(task.category_id || '');
    setSubtaskRefreshKey(k => k + 1);
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

          {/* Subtasks */}
          <SubtasksSection taskId={task.id} darkMode={dm} refreshKey={subtaskRefreshKey} />

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
