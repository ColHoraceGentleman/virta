const BASE = '/api/v1';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data;
}

export const api = {
  // Projects
  getProjects: () => request('GET', '/projects'),
  getProject: (id) => request('GET', `/projects/${id}`),
  createProject: (data) => request('POST', '/projects', data),
  updateProject: (id, data) => request('PATCH', `/projects/${id}`, data),
  deleteProject: (id) => request('DELETE', `/projects/${id}`),

  // Columns
  createColumn: (projectId, data) => request('POST', `/projects/${projectId}/columns`, data),
  updateColumn: (id, data) => request('PATCH', `/columns/${id}`, data),
  deleteColumn: (id) => request('DELETE', `/columns/${id}`),

  // Tasks
  getTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/tasks${qs ? '?' + qs : ''}`);
  },
  getTask: (id) => request('GET', `/tasks/${id}`),
  createTask: (data) => request('POST', '/tasks', data),
  updateTask: (id, data) => request('PATCH', `/tasks/${id}`, data),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),
  moveTask: (id, data) => request('PATCH', `/tasks/${id}/move`, data),

  // Notes
  getNotes: (taskId) => request('GET', `/tasks/${taskId}/notes`),
  addNote: (taskId, data) => request('POST', `/tasks/${taskId}/notes`, data),
  deleteNote: (id) => request('DELETE', `/notes/${id}`),

  // Categories
  getCategories: (projectId) => request('GET', `/categories${projectId ? `?projectId=${projectId}` : ''}`),
  createCategory: (data) => request('POST', '/categories', data),
  updateCategory: (id, data) => request('PATCH', `/categories/${id}`, data),
  deleteCategory: (id) => request('DELETE', `/categories/${id}`),

  // Attachments
  getAttachments: (taskId) => request('GET', `/tasks/${taskId}/attachments`),
  uploadAttachment: (taskId, formData) => fetch(`/api/v1/tasks/${taskId}/attachments`, { method: 'POST', body: formData }).then(r => r.json()).then(j => { if (!j.data) throw new Error(j.error); return j.data; }),
  deleteAttachment: (id) => request('DELETE', `/attachments/${id}`),
  downloadAttachment: (id) => `/api/v1/attachments/${id}/download`,  // returns URL string

  // Auth (stubs)
  getAuthStatus: () => request('GET', '/auth/status'),

  // Google Calendar (calendar router is mounted at /api/v1 in server/index.js)
  googleAuthStatus: () => request('GET', '/auth/status'),
  googleConnectUrl: () => `${BASE}/auth/google`,
  googleDisconnect: () => request('DELETE', '/auth/google'),
  listCalendars: () => request('GET', '/calendars'),
  listAllEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/calendar/events${qs ? '?' + qs : ''}`);
  },
  createCalendarEvent: (calendarId, data) => {
    // Calendar IDs can contain @, so encode once for the URL and let server decode once.
    return request('POST', `/calendars/${encodeURIComponent(calendarId)}/events`, data);
  },
  deleteCalendarEvent: (calendarId, eventId) => request('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`),
  getTaskCalendarEvents: (taskId) => request('GET', `/tasks/${taskId}/calendar-events`)
};