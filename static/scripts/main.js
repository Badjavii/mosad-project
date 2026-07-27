// scripts/main.js
// Shared utilities used across all pages.

// ── Toast notifications ───────────────────────────────────────────────────────

const toast = document.getElementById("toast");
let toastTimer = null;

function showToast(message, type = "ok") {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ""; }, 3000);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// Close modal when clicking the overlay background
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// ── Active nav link ───────────────────────────────────────────────────────────

document.querySelectorAll(".nav-link").forEach(link => {
  if (link.href === window.location.href) {
    link.classList.add("active");
  }
});
