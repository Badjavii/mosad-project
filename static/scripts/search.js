// scripts/search.js
// Single song search, results animation and download modal.

const searchInput   = document.getElementById('search-input');
const btnSearch     = document.getElementById('btn-search');
const searchTitle   = document.getElementById('search-title');
const searchSection = document.getElementById('search-section');
const resultsSection= document.getElementById('results-section');
const resultsList   = document.getElementById('results-list');

const modalEl       = document.getElementById('modal-download');
const modalUrl      = document.getElementById('modal-url');
const modalTitle    = document.getElementById('modal-input-title');
const modalArtist   = document.getElementById('modal-input-artist');
const modalAlbum    = document.getElementById('modal-input-album');
const btnDownload   = document.getElementById('btn-download');
const btnCancel     = document.getElementById('btn-cancel');

let hasSearched = false;

// ── Search ────────────────────────────────────────────────────────────────────

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  btnSearch.disabled = true;
  btnSearch.textContent = 'Searching…';

  // Animate title out on first search
  if (!hasSearched) {
    searchTitle.classList.add('hidden-animated');
    searchSection.classList.add('has-results');
    hasSearched = true;
  }

  resultsSection.classList.add('hidden');
  resultsList.innerHTML = '';

  try {
    const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');

    renderResults(data.results || []);
    resultsSection.classList.remove('hidden');

  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = 'Search';
  }
}

btnSearch.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

// ── Render results ────────────────────────────────────────────────────────────

function renderResults(results) {
  if (!results.length) {
    resultsList.innerHTML = '<li style="text-align:center;padding:2rem;color:#6c7086">No results found.</li>';
    return;
  }

  results.forEach((song, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${i * 50}ms`;
    li.innerHTML = `
      <div class="result-card">
        <div class="result-info">
          <div class="result-title">${esc(song.title)}</div>
          <div class="result-artist">${esc(song.channel)}</div>
          <span class="result-duration">${esc(song.duration)}</span>
        </div>
        <button class="btn-download"
          data-url="${esc(song.url)}"
          data-title="${esc(song.title)}"
          data-channel="${esc(song.channel)}">
          ↓ Download
        </button>
      </div>
    `;
    li.querySelector('.btn-download').addEventListener('click', openModal);
    resultsList.appendChild(li);
  });
}

// ── Download modal ────────────────────────────────────────────────────────────

function openModal(e) {
  const btn = e.currentTarget;
  modalUrl.value    = btn.dataset.url;
  modalTitle.value  = btn.dataset.title;
  modalArtist.value = btn.dataset.channel;
  modalAlbum.value  = '';
  modalEl.showModal();
  modalTitle.focus();
}

btnCancel.addEventListener('click', () => modalEl.close());

// Close on backdrop click
modalEl.addEventListener('click', e => {
  const rect = modalEl.getBoundingClientRect();
  const outside = e.clientX < rect.left || e.clientX > rect.right ||
                  e.clientY < rect.top  || e.clientY > rect.bottom;
  if (outside) modalEl.close();
});

btnDownload.addEventListener('click', async () => {
  const title  = modalTitle.value.trim();
  const artist = modalArtist.value.trim();
  const album  = modalAlbum.value.trim();
  const url    = modalUrl.value;

  if (!title || !artist) { showToast('Title and artist are required.', 'err'); return; }

  btnDownload.disabled = true;
  btnDownload.textContent = 'Downloading…';

  showToast(`Downloading "${title}"…`, 'info');

  try {
    const res  = await fetch('/api/single/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist, album, youtube_url: url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Download failed');

    modalEl.close();
    showToast(`"${title}" saved to downloads/singles/`, 'ok');

  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = '↓ Download MP3';
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
