/* ═══════════════════════════════════════════════════════════
   CRUELLA — Personal Productivity App
   Frontend Logic
   ═══════════════════════════════════════════════════════════ */

// ─── STATE ───
let currentView = 'calendar';
let activeTabId = null;
let currentMonth = new Date();
let tabs = [];
let notes = [];
let events = [];
let visionItems = [];
let selectedNote = null;
let editingEventId = null;
let editingTabId = null;
let confirmCallback = null;
let searchTimeout = null;

// ─── API HELPERS ───
const API = {
  async get(url) {
    const res = await fetch(url);
    return res.json();
  },
  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async put(url, data) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    return res.json();
  }
};

// ─── DATA FETCHING ───
async function fetchTabs() {
  tabs = await API.get('/api/tabs');
  renderSidebar();
}

async function fetchNotes(tabId) {
  notes = await API.get(`/api/notes?tab_id=${tabId}`);
  renderNotesList();
}

async function searchNotes(query) {
  if (!query.trim()) {
    if (activeTabId) await fetchNotes(activeTabId);
    return;
  }
  notes = await API.get(`/api/notes?search=${encodeURIComponent(query)}`);
  renderNotesList();
}

async function fetchEvents(month) {
  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  events = await API.get(`/api/events?month=${monthStr}`);
  renderCalendarGrid();
  fetchUpcoming();
}

async function fetchUpcoming() {
  const upcoming = await API.get('/api/events/upcoming');
  renderUpcomingList(upcoming);
}

async function fetchReminders() {
  const reminders = await API.get('/api/events/reminders');
  const badge = document.getElementById('reminder-badge');
  if (reminders.length > 0) {
    badge.textContent = reminders.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

async function fetchVisionItems() {
  visionItems = await API.get('/api/vision');
  renderVisionBoard();
}

// ═══════════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════════

// ─── SIDEBAR ───
function renderSidebar() {
  const container = document.getElementById('sidebar-tabs');
  container.innerHTML = tabs.map(tab => `
    <button class="sidebar-item ${activeTabId === tab.id ? 'active' : ''}"
            onclick="selectTab(${tab.id})"
            id="tab-item-${tab.id}">
      <span class="sidebar-tab-dot" style="background:${tab.color}"></span>
      <span>${escapeHtml(tab.name)}</span>
      <button class="sidebar-tab-edit" onclick="event.stopPropagation(); openTabModal(${tab.id})" title="Edit">✎</button>
    </button>
  `).join('');
}

// ─── CALENDAR GRID ───
function renderCalendarGrid() {
  const grid = document.getElementById('calendar-grid');
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Update title
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('cal-month-title').textContent = `${monthNames[month]} ${year}`;

  // Day headers
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Calculate grid dates
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const today = new Date();
  const todayStr = formatDate(today);

  // Build 6 weeks of days
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = formatDate(date);
    const isOtherMonth = date.getMonth() !== month;
    const isToday = dateStr === todayStr;

    // Find events for this day
    const dayEvents = events.filter(e => {
      if (e.start_date === dateStr) return true;
      if (e.end_date && e.start_date <= dateStr && e.end_date >= dateStr) return true;
      return false;
    });

    const maxShow = 3;
    const eventsHtml = dayEvents.slice(0, maxShow).map(e => {
      const bgColor = e.tab_color || '#444';
      const textColor = getContrastColor(bgColor);
      return `<div class="cal-event" 
                   style="background:${bgColor}; color:${textColor};" 
                   onclick="event.stopPropagation(); openEventModal(null, ${e.id})"
                   title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</div>`;
    }).join('');

    const moreCount = dayEvents.length - maxShow;
    const moreHtml = moreCount > 0 ? `<div class="cal-events-more">+${moreCount} more</div>` : '';

    html += `
      <div class="cal-day ${isOtherMonth ? 'cal-day--other-month' : ''} ${isToday ? 'cal-day--today' : ''}"
           onclick="openEventModal('${dateStr}')">
        <div class="cal-day-number">${date.getDate()}</div>
        ${eventsHtml}
        ${moreHtml}
      </div>
    `;
  }

  grid.innerHTML = html;
}

// ─── UPCOMING LIST ───
function renderUpcomingList(upcomingEvents) {
  const container = document.getElementById('upcoming-list');

  if (!upcomingEvents || upcomingEvents.length === 0) {
    container.innerHTML = '<div class="upcoming-empty">No upcoming events</div>';
    return;
  }

  container.innerHTML = upcomingEvents.map(e => {
    const tagColor = e.tab_color || '#444';
    const tagText = e.tab_name || 'General';
    const isDone = e.status === 'done';
    return `
      <div class="upcoming-event ${isDone ? 'upcoming-event--done' : ''}"
           style="border-left-color: ${tagColor}"
           onclick="openEventModal(null, ${e.id})">
        <div class="upcoming-event-title">${escapeHtml(e.title)}</div>
        <div class="upcoming-event-date">${formatDisplayDate(e.start_date)}${e.end_date ? ' → ' + formatDisplayDate(e.end_date) : ''}</div>
        <span class="upcoming-event-tag" style="background:${tagColor}20; color:${tagColor}">${escapeHtml(tagText)}</span>
      </div>
    `;
  }).join('');
}

// ─── NOTES LIST ───
function renderNotesList() {
  const container = document.getElementById('notes-list');

  if (notes.length === 0) {
    container.innerHTML = `
      <div class="notes-empty">
        <div class="notes-empty-icon">♠</div>
        <p>No notes yet. Create one!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notes.map(note => `
    <div class="note-card ${selectedNote && selectedNote.id === note.id ? 'active' : ''}"
         onclick="selectNote(${note.id})"
         id="note-card-${note.id}">
      <div class="note-card-title">${escapeHtml(note.title)}</div>
      <div class="note-card-preview">${escapeHtml(note.content || 'Empty note...').substring(0, 80)}</div>
      <div class="note-card-date">${formatDisplayDate(note.updated_at)}</div>
    </div>
  `).join('');
}

// ─── NOTES EDITOR ───
function renderEditor(note) {
  const emptyEl = document.getElementById('editor-empty');
  const activeEl = document.getElementById('editor-active');

  if (!note) {
    emptyEl.classList.remove('hidden');
    activeEl.classList.add('hidden');
    selectedNote = null;
    return;
  }

  emptyEl.classList.add('hidden');
  activeEl.classList.remove('hidden');
  selectedNote = note;

  document.getElementById('editor-title').value = note.title;
  document.getElementById('editor-content').value = note.content || '';
  document.getElementById('editor-timestamp').textContent = `Last edited: ${formatDisplayDate(note.updated_at)}`;

  // Fetch attachments for this note
  fetchFiles(note.id);
}

// ─── VISION BOARD ───
function renderVisionBoard() {
  const grid = document.getElementById('vision-grid');
  if (!visionItems || visionItems.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-style:italic;">Your vision board is empty. Add some quotes or images!</div>';
    return;
  }

  grid.innerHTML = visionItems.map(item => {
    if (item.type === 'quote') {
      return `
        <div class="vision-item">
          <div class="vision-item-quote">${escapeHtml(item.content)}</div>
          <button class="vision-item-delete" onclick="deleteVisionItem(${item.id})">×</button>
        </div>
      `;
    } else if (item.type === 'image') {
      return `
        <div class="vision-item vision-item-image">
          <img class="vision-item-img" src="/uploads/${item.content}" alt="Vision image">
          <button class="vision-item-delete" onclick="deleteVisionItem(${item.id})">×</button>
        </div>
      `;
    }
    return '';
  }).join('');
}

// ─── FILES ───
async function fetchFiles(noteId) {
  const files = await API.get(`/api/notes/${noteId}/files`);
  renderFiles(files);
}

function renderFiles(files) {
  const container = document.getElementById('files-list');
  if (!files || files.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;font-style:italic;">No files attached.</div>';
    return;
  }

  container.innerHTML = files.map(f => `
    <div class="file-item" id="file-${f.id}">
      <span class="file-name" title="${escapeHtml(f.original_name)}">📄 ${escapeHtml(f.original_name)}</span>
      <div class="file-actions">
        <button class="btn-preview-file" onclick="previewFile('${f.filename}', '${f.mimetype}', '${escapeHtml(f.original_name)}')">Preview</button>
        <button class="btn-delete-file" onclick="deleteFile(${f.id})" title="Delete file">×</button>
      </div>
    </div>
  `).join('');
}

function previewFile(filename, mimetype, originalName) {
  const overlay = document.getElementById('preview-overlay');
  const title = document.getElementById('preview-title');
  const content = document.getElementById('preview-content');
  
  title.textContent = originalName || filename;
  
  const fileUrl = `/uploads/${filename}`;
  
  if (mimetype.startsWith('image/')) {
    content.innerHTML = `<img src="${fileUrl}" alt="Preview">`;
  } else if (mimetype === 'application/pdf') {
    content.innerHTML = `<iframe src="${fileUrl}#toolbar=0" type="application/pdf"></iframe>`;
  } else {
    content.innerHTML = `<div style="color:white; text-align:center;">Preview not available for this file type. <br><br> <a href="${fileUrl}" target="_blank" style="color:var(--accent);">Download File</a></div>`;
  }
  
  overlay.classList.remove('hidden');
}

function closePreview() {
  document.getElementById('preview-overlay').classList.add('hidden');
  document.getElementById('preview-content').innerHTML = ''; // clear memory
}

async function uploadFile(event) {
  if (!selectedNote) return;
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/notes/${selectedNote.id}/files`, {
      method: 'POST',
      body: formData
    });
    if (res.ok) {
      showToast('File uploaded', 'success');
      fetchFiles(selectedNote.id);
    } else {
      showToast('Upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error', 'error');
  }

  // Clear input
  event.target.value = '';
}

async function deleteFile(fileId) {
  showConfirm('Delete this attachment?', async () => {
    await API.delete(`/api/files/${fileId}`);
    if (selectedNote) {
      fetchFiles(selectedNote.id);
    }
    showToast('File deleted', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
//  VIEW SWITCHING
// ═══════════════════════════════════════════════════════════

function switchView(view) {
  currentView = view;

  document.getElementById('calendar-view').classList.toggle('hidden', view !== 'calendar');
  document.getElementById('notes-view').classList.toggle('hidden', view !== 'notes');
  document.getElementById('motivation-view').classList.toggle('hidden', view !== 'motivation');

  // Update sidebar active states
  document.getElementById('nav-calendar').classList.toggle('active', view === 'calendar');
  document.getElementById('nav-motivation').classList.toggle('active', view === 'motivation');
  document.querySelectorAll('#sidebar-tabs .sidebar-item').forEach(el => {
    const tabId = parseInt(el.id.replace('tab-item-', ''));
    el.classList.toggle('active', view === 'notes' && tabId === activeTabId);
  });

  if (view === 'calendar') {
    activeTabId = null;
    fetchEvents(currentMonth);
  } else if (view === 'motivation') {
    activeTabId = null;
    fetchVisionItems();
  }
}

function selectTab(tabId) {
  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  switchView('notes');

  document.getElementById('notes-list-title').textContent = tab ? tab.name : 'Notes';
  document.getElementById('notes-search-input').value = '';

  selectedNote = null;
  renderEditor(null);
  fetchNotes(tabId);
}

// ═══════════════════════════════════════════════════════════
//  CALENDAR NAVIGATION
// ═══════════════════════════════════════════════════════════

function navigateMonth(direction) {
  currentMonth.setMonth(currentMonth.getMonth() + direction);
  fetchEvents(currentMonth);
}

function goToToday() {
  currentMonth = new Date();
  fetchEvents(currentMonth);
}

// ═══════════════════════════════════════════════════════════
//  NOTE CRUD
// ═══════════════════════════════════════════════════════════

async function createNewNote() {
  if (!activeTabId) return;

  const note = await API.post('/api/notes', {
    tab_id: activeTabId,
    title: 'Untitled Note',
    content: ''
  });

  await fetchNotes(activeTabId);
  selectNote(note.id);
  showToast('Note created', 'success');

  // Focus the title for immediate editing
  setTimeout(() => {
    const titleEl = document.getElementById('editor-title');
    titleEl.focus();
    titleEl.select();
  }, 100);
}

async function selectNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;

  // Save current note before switching
  if (selectedNote && selectedNote.id !== noteId) {
    await autosaveNote();
  }

  renderEditor(note);
  renderNotesList();
}

async function autosaveNote() {
  if (!selectedNote) return;

  const title = document.getElementById('editor-title').value.trim();
  const content = document.getElementById('editor-content').value;

  if (!title) return;

  if (title !== selectedNote.title || content !== selectedNote.content) {
    const updated = await API.put(`/api/notes/${selectedNote.id}`, { title, content });
    selectedNote = updated;

    // Update the note in the local array
    const idx = notes.findIndex(n => n.id === updated.id);
    if (idx >= 0) notes[idx] = updated;

    renderNotesList();
    document.getElementById('editor-timestamp').textContent = `Last edited: ${formatDisplayDate(updated.updated_at)}`;
  }
}

async function deleteCurrentNote() {
  if (!selectedNote) return;

  showConfirm(`Delete "${selectedNote.title}"? This cannot be undone.`, async () => {
    await API.delete(`/api/notes/${selectedNote.id}`);
    selectedNote = null;
    renderEditor(null);
    await fetchNotes(activeTabId);
    showToast('Note deleted', 'success');
  });
}

function handleNoteSearch(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchNotes(query), 300);
}

// ═══════════════════════════════════════════════════════════
//  EVENT MODAL
// ═══════════════════════════════════════════════════════════

async function openEventModal(dateStr, eventId) {
  const overlay = document.getElementById('event-modal-overlay');
  const form = document.getElementById('event-form');
  const deleteBtn = document.getElementById('event-delete-btn');

  // Populate tab dropdown
  const tabSelect = document.getElementById('event-tab');
  tabSelect.innerHTML = '<option value="">None (General)</option>' +
    tabs.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');

  if (eventId) {
    // Edit existing event
    editingEventId = eventId;
    const allEvents = await API.get('/api/events');
    const evt = allEvents.find(e => e.id === eventId);
    if (!evt) return;

    document.getElementById('event-modal-title').textContent = 'Edit Event';
    document.getElementById('event-id').value = evt.id;
    document.getElementById('event-title-input').value = evt.title;
    document.getElementById('event-description').value = evt.description || '';
    document.getElementById('event-start').value = evt.start_date;
    document.getElementById('event-end').value = evt.end_date || '';
    document.getElementById('event-reminder').value = evt.reminder_date || '';
    document.getElementById('event-tab').value = evt.tab_id || '';
    document.getElementById('event-status').value = evt.status;
    deleteBtn.style.display = 'inline-flex';
  } else {
    // New event
    editingEventId = null;
    document.getElementById('event-modal-title').textContent = 'New Event';
    form.reset();
    document.getElementById('event-start').value = dateStr || formatDate(new Date());
    deleteBtn.style.display = 'none';
  }

  overlay.classList.remove('hidden');
}

function closeEventModal() {
  document.getElementById('event-modal-overlay').classList.add('hidden');
  editingEventId = null;
}

async function handleEventSubmit(e) {
  e.preventDefault();

  const data = {
    tab_id: document.getElementById('event-tab').value || null,
    title: document.getElementById('event-title-input').value,
    description: document.getElementById('event-description').value,
    start_date: document.getElementById('event-start').value,
    end_date: document.getElementById('event-end').value || null,
    reminder_date: document.getElementById('event-reminder').value || null,
    status: document.getElementById('event-status').value
  };

  if (editingEventId) {
    await API.put(`/api/events/${editingEventId}`, data);
    showToast('Event updated', 'success');
  } else {
    await API.post('/api/events', data);
    showToast('Event created', 'success');
  }

  closeEventModal();
  await fetchEvents(currentMonth);
  fetchReminders();
}

async function deleteCurrentEvent() {
  if (!editingEventId) return;

  showConfirm('Delete this event? This cannot be undone.', async () => {
    await API.delete(`/api/events/${editingEventId}`);
    closeEventModal();
    await fetchEvents(currentMonth);
    fetchReminders();
    showToast('Event deleted', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
//  TAB MODAL
// ═══════════════════════════════════════════════════════════

function openTabModal(tabId) {
  const overlay = document.getElementById('tab-modal-overlay');
  const form = document.getElementById('tab-form');
  const deleteBtn = document.getElementById('tab-delete-btn');

  if (tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    editingTabId = tabId;
    document.getElementById('tab-modal-title').textContent = 'Edit Notebook';
    document.getElementById('tab-edit-id').value = tab.id;
    document.getElementById('tab-name-input').value = tab.name;
    document.getElementById('tab-color-input').value = tab.color;
    deleteBtn.style.display = 'inline-flex';
  } else {
    editingTabId = null;
    document.getElementById('tab-modal-title').textContent = 'New Notebook';
    form.reset();
    document.getElementById('tab-color-input').value = '#D72638';
    deleteBtn.style.display = 'none';
  }

  overlay.classList.remove('hidden');
}

function closeTabModal() {
  document.getElementById('tab-modal-overlay').classList.add('hidden');
  editingTabId = null;
}

async function handleTabSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('tab-name-input').value.trim();
  const color = document.getElementById('tab-color-input').value;

  if (!name) return;

  if (editingTabId) {
    await API.put(`/api/tabs/${editingTabId}`, { name, color });
    showToast('Notebook updated', 'success');
  } else {
    await API.post('/api/tabs', { name, color });
    showToast('Notebook created', 'success');
  }

  closeTabModal();
  await fetchTabs();
}

async function deleteCurrentTab() {
  if (!editingTabId) return;

  const tab = tabs.find(t => t.id === editingTabId);
  showConfirm(`Delete "${tab?.name}"? All notes in this notebook will be deleted.`, async () => {
    await API.delete(`/api/tabs/${editingTabId}`);

    if (activeTabId === editingTabId) {
      activeTabId = null;
      switchView('calendar');
    }

    closeTabModal();
    await fetchTabs();
    showToast('Notebook deleted', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
//  VISION BOARD LOGIC
// ═══════════════════════════════════════════════════════════

function openVisionQuoteModal() {
  document.getElementById('vision-quote-input').value = '';
  document.getElementById('vision-modal-overlay').classList.remove('hidden');
}

function closeVisionQuoteModal() {
  document.getElementById('vision-modal-overlay').classList.add('hidden');
}

async function handleVisionQuoteSubmit(e) {
  e.preventDefault();
  const content = document.getElementById('vision-quote-input').value.trim();
  if (!content) return;

  await API.post('/api/vision/quote', { content });
  closeVisionQuoteModal();
  showToast('Quote added', 'success');
  await fetchVisionItems();
}

async function uploadVisionImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/vision/image', {
      method: 'POST',
      body: formData
    });
    if (res.ok) {
      showToast('Image uploaded', 'success');
      await fetchVisionItems();
    } else {
      showToast('Upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error', 'error');
  }

  event.target.value = '';
}

async function deleteVisionItem(id) {
  showConfirm('Delete this item from your vision board?', async () => {
    await API.delete(`/api/vision/${id}`);
    await fetchVisionItems();
    showToast('Item deleted', 'success');
  });
}

// ═══════════════════════════════════════════════════════════
//  CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════

function showConfirm(message, callback) {
  const overlay = document.getElementById('confirm-modal-overlay');
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  overlay.classList.remove('hidden');
}

async function confirmOk() {
  const overlay = document.getElementById('confirm-modal-overlay');
  overlay.classList.add('hidden');
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
  }
}

function confirmCancel() {
  const overlay = document.getElementById('confirm-modal-overlay');
  overlay.classList.add('hidden');
  confirmCallback = null;
}

// ═══════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

function showToast(message, type = 'success') {
  // Remove any existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

// ═══════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function getContrastColor(hexColor) {
  if (!hexColor || hexColor === 'null') return '#fff';
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // YIQ formula for contrast
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#0a0a0a' : '#ffffff';
}

// ═══════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // Escape to close modals
  if (e.key === 'Escape') {
    closeEventModal();
    closeTabModal();
    closeVisionQuoteModal();
    confirmCancel();
    closePreview();
  }

  // Ctrl+S to save note
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    autosaveNote();
    showToast('Saved', 'success');
  }

  // Ctrl+N to create new note (only in notes view)
  if (e.ctrlKey && e.key === 'n' && currentView === 'notes') {
    e.preventDefault();
    createNewNote();
  }
});

// ═══════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════

async function init() {
  await fetchTabs();
  await fetchEvents(currentMonth);
  fetchReminders();
}

// Run on load
init();
