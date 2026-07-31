// scripts/playlists.js
// Playlist management: sidebar, CRUD, drag & drop, download progress.

let allPlaylists = [];
let activePl     = null;
let dragSrcOrder = null;
let pollTimer    = null;

const navList       = document.getElementById('playlist-nav');
const contentArea   = document.getElementById('playlist-content');
const importInput   = document.getElementById('import-file-input');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar       = document.getElementById('sidebar');

// ── Mobile sidebar toggle ─────────────────────────────────────────────────────
sidebarToggle?.addEventListener('click', () => sidebar.classList.toggle('open'));

// ── Init ──────────────────────────────────────────────────────────────────────
loadPlaylists();

async function loadPlaylists() {
  try {
    const res = await fetch('/api/playlists');
    const data = await res.json();
    allPlaylists = data.playlists || [];
    renderNav();
    if (!activePl) renderEmpty();
  } catch {
    showToast('Could not load playlists.', 'err');
  }
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
function renderNav() {
  navList.innerHTML = '';
  if (!allPlaylists.length) {
    navList.innerHTML = '<li style="color:#6c7086;font-size:0.8rem;padding:0.25rem 0">No playlists yet.</li>';
    return;
  }
  allPlaylists.forEach(pl => {
    const li = document.createElement('li');
    li.className = 'playlist-nav-item' + (activePl?.id === pl.id ? ' active' : '');
    li.innerHTML = `
      <span class="playlist-nav-name">${esc(pl.name)}</span>
      <button class="playlist-nav-delete" data-id="${pl.id}" aria-label="Delete ${esc(pl.name)}">✕</button>
    `;
    li.addEventListener('click', e => {
      if (e.target.classList.contains('playlist-nav-delete')) return;
      selectPlaylist(pl.id);
      sidebar.classList.remove('open');
    });
    li.querySelector('.playlist-nav-delete').addEventListener('click', e => {
      e.stopPropagation();
      deletePlaylist(pl.id);
    });
    navList.appendChild(li);
  });
}

// ── Select playlist ───────────────────────────────────────────────────────────
async function selectPlaylist(id) {
  try {
    const res = await fetch(`/api/playlists/${id}`);
    if (!res.ok) throw new Error();
    activePl = await res.json();
    renderNav();
    renderPlaylist();
  } catch {
    showToast('Could not load playlist.', 'err');
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────
function renderEmpty() {
  contentArea.innerHTML = `
    <div class="empty-state">
      <p>Select any playlist from the sidebar,<br />import a playlist with JSON or create a new playlist.</p>
    </div>`;
}

// ── Render playlist ───────────────────────────────────────────────────────────
function renderPlaylist() {
  if (!activePl) return;
  const songs = activePl.songs || [];

  contentArea.innerHTML = `
    <div class="playlist-header">
      <h1 class="playlist-header-title">${esc(activePl.name)}</h1>
      <div class="playlist-header-actions">
        <button class="header-btn header-btn--add" id="btn-add-song">+ Add Song</button>
        <button class="header-btn header-btn--download" id="btn-download-playlist">↓ Download</button>
      </div>
    </div>
    <p class="playlist-meta">${songs.length} song${songs.length !== 1 ? 's' : ''} · drag to reorder</p>
    <ul class="song-list" id="song-list" role="list">
      ${songs.length === 0
        ? '<li style="color:#6c7086;padding:1rem 0">No songs yet. Add one!</li>'
        : songs.map(renderSongCard).join('')}
    </ul>
  `;

  document.getElementById('btn-add-song')?.addEventListener('click', openAddSongModal);
  document.getElementById('btn-download-playlist')?.addEventListener('click', startDownload);
  initDragDrop();
  initSongActions();
}

// ── Song card ─────────────────────────────────────────────────────────────────
function renderSongCard(song) {
  return `
    <li class="song-card" draggable="true" data-order="${song.order}">
      <span class="song-order">${String(song.order).padStart(2, '0')}</span>
      <div class="song-info">
        <div class="song-title">${esc(song.title)}</div>
        <div class="song-artist">${esc(song.artist)}</div>
        <div class="song-filename">${esc(song.file_name)}</div>
      </div>
      <div class="song-actions">
        <button class="song-btn" data-act="edit"     data-order="${song.order}">Edit</button>
        <button class="song-btn" data-act="download" data-order="${song.order}">↓</button>
        <button class="song-btn song-btn--delete" data-act="delete" data-order="${song.order}">✕</button>
      </div>
    </li>
  `;
}

function initSongActions() {
  document.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = parseInt(btn.dataset.order);
      if (btn.dataset.act === 'edit')     openEditModal(order);
      if (btn.dataset.act === 'download') downloadSong(order);
      if (btn.dataset.act === 'delete')   deleteSong(order);
    });
  });
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function initDragDrop() {
  const cards = document.querySelectorAll('.song-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrcOrder = parseInt(card.dataset.order);
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.song-card').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.song-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    card.addEventListener('drop', async e => {
      e.preventDefault();
      const targetOrder = parseInt(card.dataset.order);
      if (!dragSrcOrder || dragSrcOrder === targetOrder) return;

      const songs = [...activePl.songs];
      const si = songs.findIndex(s => s.order === dragSrcOrder);
      const ti = songs.findIndex(s => s.order === targetOrder);
      const [moved] = songs.splice(si, 1);
      songs.splice(ti, 0, moved);

      activePl.songs = songs.map((s, i) => ({ ...s, order: i + 1 }));
      renderPlaylist();

      try {
        const res = await fetch(`/api/playlists/${activePl.id}/songs/reorder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordered_orders: songs.map(s => s.order) }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        activePl.songs = data.songs;
        renderPlaylist();
      } catch { showToast('Reorder failed.', 'err'); }
    });
  });
}

// ── New Playlist ──────────────────────────────────────────────────────────────
document.getElementById('btn-new-playlist')?.addEventListener('click', () => {
  document.getElementById('new-playlist-name').value = '';
  document.getElementById('modal-new-playlist').showModal();
  setTimeout(() => document.getElementById('new-playlist-name').focus(), 50);
});

document.getElementById('btn-cancel-new-playlist')?.addEventListener('click', () => {
  document.getElementById('modal-new-playlist').close();
});

document.getElementById('btn-create-playlist')?.addEventListener('click', async () => {
  const name = document.getElementById('new-playlist-name').value.trim();
  if (!name) { showToast('Enter a playlist name.', 'err'); return; }

  const res  = await fetch('/api/playlists', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'err'); return; }

  document.getElementById('modal-new-playlist').close();
  showToast(`"${name}" created.`, 'ok');
  await loadPlaylists();
  selectPlaylist(data.id);
});

// ── Import JSON ───────────────────────────────────────────────────────────────
document.getElementById('btn-import-json')?.addEventListener('click', () => importInput.click());

importInput?.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res  = await fetch('/api/playlists/import', { method: 'POST', body: fd });
  const data = await res.json();
  importInput.value = '';
  if (!res.ok) { showToast(data.error, 'err'); return; }
  showToast(`"${data.name}" imported.`, 'ok');
  await loadPlaylists();
  selectPlaylist(data.id);
});

// ── Delete Playlist ───────────────────────────────────────────────────────────
async function deletePlaylist(id) {
  if (!confirm('Delete this playlist? This cannot be undone.')) return;
  await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
  if (activePl?.id === id) activePl = null;
  showToast('Playlist deleted.', 'ok');
  await loadPlaylists();
  if (!activePl) renderEmpty();
}

// ── Add Song Modal ────────────────────────────────────────────────────────────
function openAddSongModal() {
  document.getElementById('add-song-input').value = '';
  document.getElementById('add-results-list').innerHTML = '';
  document.getElementById('add-song-results').classList.add('hidden');
  document.getElementById('modal-add-song').showModal();
}

document.getElementById('btn-cancel-add-song')?.addEventListener('click', () => {
  document.getElementById('modal-add-song').close();
});

document.getElementById('btn-add-song-search')?.addEventListener('click', doAddSearch);
document.getElementById('add-song-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') doAddSearch();
});

async function doAddSearch() {
  const q   = document.getElementById('add-song-input').value.trim();
  const btn = document.getElementById('btn-add-song-search');
  if (!q) return;

  btn.disabled = true; btn.textContent = '…';
  const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Search';

  const list = document.getElementById('add-results-list');
  const wrap = document.getElementById('add-song-results');
  list.innerHTML = '';
  wrap.classList.remove('hidden');

  (data.results || []).forEach(song => {
    const li = document.createElement('li');
    li.className = 'add-result-item';
    li.innerHTML = `
      <div class="add-result-info">
        <div class="add-result-title">${esc(song.title)}</div>
        <div class="add-result-meta">${esc(song.channel)} · ${esc(song.duration)}</div>
      </div>
      <button class="add-result-btn"
        data-url="${esc(song.url)}"
        data-title="${esc(song.title)}"
        data-channel="${esc(song.channel)}">Add</button>
    `;
    li.querySelector('.add-result-btn').addEventListener('click', addSongToPlaylist);
    list.appendChild(li);
  });
}

async function addSongToPlaylist(e) {
  const btn    = e.currentTarget;
  const title  = btn.dataset.title;
  const artist = btn.dataset.channel;
  const url    = btn.dataset.url;

  btn.disabled = true; btn.textContent = '…';

  const res  = await fetch(`/api/playlists/${activePl.id}/songs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist, youtube_url: url }),
  });
  const data = await res.json();

  btn.disabled = false; btn.textContent = 'Add';
  if (!res.ok) { showToast(data.error, 'err'); return; }

  showToast(`"${title}" added.`, 'ok');
  document.getElementById('modal-add-song').close();
  await selectPlaylist(activePl.id);
}

// ── Edit Song ─────────────────────────────────────────────────────────────────
function openEditModal(order) {
  const song = activePl.songs.find(s => s.order === order);
  if (!song) return;
  document.getElementById('edit-song-order').value  = order;
  document.getElementById('edit-song-title').value  = song.title;
  document.getElementById('edit-song-artist').value = song.artist;
  document.getElementById('edit-song-album').value  = song.album || '';
  document.getElementById('modal-edit-song').showModal();
}

document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
  document.getElementById('modal-edit-song').close();
});

document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
  const order  = parseInt(document.getElementById('edit-song-order').value);
  const title  = document.getElementById('edit-song-title').value.trim();
  const artist = document.getElementById('edit-song-artist').value.trim();
  const album  = document.getElementById('edit-song-album').value.trim();
  if (!title || !artist) { showToast('Title and artist are required.', 'err'); return; }

  const res = await fetch(`/api/playlists/${activePl.id}/songs/${order}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist, album }),
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'err'); return; }

  document.getElementById('modal-edit-song').close();
  showToast('Metadata updated.', 'ok');
  await selectPlaylist(activePl.id);
});

// ── Delete Song ───────────────────────────────────────────────────────────────
async function deleteSong(order) {
  if (!confirm('Remove this song from the playlist?')) return;
  await fetch(`/api/playlists/${activePl.id}/songs/${order}`, { method: 'DELETE' });
  showToast('Song removed.', 'ok');
  await selectPlaylist(activePl.id);
}

// ── Download single song ──────────────────────────────────────────────────────
async function downloadSong(order) {
  showToast('Starting download…', 'info');
  const res  = await fetch(`/api/playlists/${activePl.id}/songs/${order}/download`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'err'); return; }
  showToast('Song saved to downloads/singles/', 'ok');
}

// ── Download playlist with progress ──────────────────────────────────────────
async function startDownload() {
  const modal   = document.getElementById('modal-downloading');
  const bar     = document.getElementById('dl-progress-bar');
  const pct     = document.getElementById('dl-progress-pct');
  const log     = document.getElementById('dl-log');

  bar.value = 0; pct.textContent = '0%'; log.textContent = '';
  modal.showModal();

  const res  = await fetch(`/api/playlists/${activePl.id}/download`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    modal.close();
    showToast(data.error, 'err');
    return;
  }

  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const r = await fetch(`/api/playlists/${activePl.id}/download/progress`);
    if (!r.ok) { clearInterval(pollTimer); return; }
    const job = await r.json();

    const p = job.total ? Math.round((job.done / job.total) * 100) : 0;
    bar.value = p;
    pct.textContent = `${p}%`;
    log.textContent = (job.log || []).join('\n');
    log.scrollTop = log.scrollHeight;

    if (job.status === 'done' || job.status === 'done_with_errors') {
      clearInterval(pollTimer);
      const msg = job.failed > 0
        ? `Done with ${job.failed} error(s).`
        : `All songs saved to downloads/playlists/`;
      showToast(msg, job.failed > 0 ? 'err' : 'ok');
    }
  }, 1000);
}

document.getElementById('btn-cancel-download')?.addEventListener('click', () => {
  clearInterval(pollTimer);
  document.getElementById('modal-downloading').close();
});

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => {
    const r = m.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      m.close();
    }
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
