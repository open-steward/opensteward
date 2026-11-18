/**
 * Applies the stored (or preferred) colour theme before first paint.
 *
 * Loaded synchronously from <head> in layout.ejs — no `defer` — so the page
 * never flashes light before turning dark. An external file rather than an
 * inline <script> so pages served with a strict Content-Security-Policy
 * (`script-src 'self'`, the data viewer and dashboards) run it too.
 */
;(function () {
  try {
    var legacy = localStorage.getItem('oi-theme')
    if (legacy && !localStorage.getItem('os-theme')) {
      localStorage.setItem('os-theme', legacy)
      localStorage.removeItem('oi-theme')
    }
    var stored = localStorage.getItem('os-theme')
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    var theme = stored || (prefersDark ? 'dark' : 'light')
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  } catch (e) {}
})()
