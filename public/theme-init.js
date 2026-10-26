// Applies the saved theme before first paint (Phase 1 spec; moved out of index.html so the
// Content-Security-Policy in public/_headers needs no inline scripts, P2 spec §10).
(function () {
  try {
    document.documentElement.classList.toggle('dark', localStorage.getItem('ui.theme') !== 'light');
  } catch {
    document.documentElement.classList.add('dark');
  }
})();
