// scripts/search.js
// Handles YouTube search and single song download on the Single Song page.

const searchInput  = document.getElementById("search-input");
const btnSearch    = document.getElementById("btn-search");
const resultsList  = document.getElementById("results-list");
const modal        = document.getElementById("modal");
const modalUrl     = document.getElementById("modal-url");
const modalTitle   = document.getElementById("modal-title");
const modalArtist  = document.getElementById("modal-artist");
const modalAlbum   = document.getElementById("modal-album");
const btnDownload  = document.getElementById("btn-download");
const btnCancel    = document.getElementById("btn-cancel");

// ── Search ────────────────────────────────────────────────────────────────────

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  btnSearch.disabled = true;
  btnSearch.textContent = "Searching…";
  resultsList.innerHTML = "";

  try {
    const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Search failed");
    if (!data.results.length) {
      resultsList.innerHTML = `<p class="muted" style="text-align:center">No results found.</p>`;
      return;
    }

    data.results.forEach(song => {
      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <img class="result-thumb" src="${song.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />
        <div class="result-info">
          <div class="result-title">${escapeHtml(song.title)}</div>
          <div class="result-meta">${escapeHtml(song.channel)}</div>
          <span class="result-duration">${song.duration}</span>
        </div>
        <div class="result-actions">
          <button class="btn btn-primary btn-sm" data-url="${song.url}" data-title="${escapeHtml(song.title)}" data-channel="${escapeHtml(song.channel)}">
            &#8595; Download
          </button>
        </div>
      `;
      card.querySelector("button").addEventListener("click", openDownloadModal);
      resultsList.appendChild(card);
    });

  } catch (err) {
    showToast(err.message, "err");
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = "Search";
  }
}

btnSearch.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

// ── Download modal ────────────────────────────────────────────────────────────

function openDownloadModal(e) {
  const btn = e.currentTarget;
  modalUrl.value    = btn.dataset.url;
  modalTitle.value  = btn.dataset.title;
  modalArtist.value = btn.dataset.channel;
  modalAlbum.value  = "";
  modal.classList.remove("hidden");
  modalTitle.focus();
}

btnCancel.addEventListener("click", () => modal.classList.add("hidden"));

btnDownload.addEventListener("click", async () => {
  const title  = modalTitle.value.trim();
  const artist = modalArtist.value.trim();
  const album  = modalAlbum.value.trim();
  const url    = modalUrl.value;

  if (!title || !artist) {
    showToast("Title and Artist are required.", "err");
    return;
  }

  btnDownload.disabled = true;
  btnDownload.textContent = "Downloading…";

  try {
    const res = await fetch("/api/single/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist, album, youtube_url: url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Download failed");
    }

    // Trigger browser download from the binary response
    const blob     = await res.blob();
    const blobUrl  = URL.createObjectURL(blob);
    const disposition = res.headers.get("Content-Disposition") || "";
    const match    = disposition.match(/filename="(.+)"/);
    const filename = match ? match[1] : `${artist}-${title}.mp3`;

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);

    modal.classList.add("hidden");
    showToast(`"${title}" downloaded successfully.`, "ok");

  } catch (err) {
    showToast(err.message, "err");
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = "↓ Download MP3";
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
