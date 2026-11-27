/** The one-line toast the shell mounts as `#toast2` (markets-hero run.js `toast`). */
let timer = 0;

export function toast(message: string, ms = 3600): void {
  const el = document.getElementById('toast2');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.style.display = 'none';
  }, ms);
}
