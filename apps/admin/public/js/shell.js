/**
 * Behaviour of the signed-in shell (layout.ejs): theme toggle, the mobile
 * sidebar, the toast layer, copy-on-click and the build-info footer.
 *
 * These lived inline in layout.ejs with `onclick="…"` attributes. They moved
 * here, wired by delegated listeners on `data-*` hooks, so a page may be
 * served with `script-src 'self'` — no inline script, no inline handler —
 * and still have a working shell. `window.oiToggleTheme`, `oiOpenSidebar`,
 * `oiCloseSidebar` and `oiToast` stay global for any caller that used them.
 */
;(function () {
  'use strict'

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
    try {
      localStorage.setItem('os-theme', next)
    } catch (e) {}
    document.querySelectorAll('[data-theme-toggle] i').forEach(function (i) {
      i.className = next === 'dark' ? 'ph ph-sun' : 'ph ph-moon'
    })
    // Charts (public/js/dashboard.js) re-read the design tokens on this.
    document.dispatchEvent(new CustomEvent('os:themechange', { detail: { theme: next } }))
  }

  function openSidebar() {
    var s = document.querySelector('.sidebar')
    var b = document.querySelector('.sidebar-backdrop')
    if (s) s.setAttribute('data-open', 'true')
    if (b) b.setAttribute('data-open', 'true')
  }

  function closeSidebar() {
    var s = document.querySelector('.sidebar')
    var b = document.querySelector('.sidebar-backdrop')
    if (s) s.removeAttribute('data-open')
    if (b) b.removeAttribute('data-open')
  }

  window.oiToggleTheme = toggleTheme
  window.oiOpenSidebar = openSidebar
  window.oiCloseSidebar = closeSidebar

  window.oiToast = function (opts) {
    var stack = document.getElementById('toast-stack')
    if (!stack) return
    var tone = (opts && opts.tone) || 'info'
    var body = (opts && opts.body) || ''
    var duration = opts && typeof opts.duration === 'number' ? opts.duration : 4000
    var icons = {
      success: 'check-circle',
      danger: 'warning-circle',
      warning: 'warning',
      info: 'info',
    }
    var el = document.createElement('div')
    el.className = 'toast toast--' + tone
    el.innerHTML =
      '<i class="ph toast__icon ph-' +
      (icons[tone] || 'info') +
      '" aria-hidden="true"></i>' +
      '<span class="toast__body"></span>' +
      '<button class="toast__close" aria-label="Dismiss"><i class="ph ph-x"></i></button>'
    el.querySelector('.toast__body').textContent = body
    el.querySelector('.toast__close').addEventListener('click', function () {
      el.remove()
    })
    stack.appendChild(el)
    if (duration > 0)
      setTimeout(function () {
        el.remove()
      }, duration)
  }

  document.addEventListener('click', function (e) {
    var t = e.target
    if (!t || !t.closest) return
    if (t.closest('[data-theme-toggle]')) return toggleTheme()
    if (t.closest('[data-sidebar-open]')) return openSidebar()
    if (t.closest('[data-sidebar-close]')) return closeSidebar()
    // Global copy-on-click for any [data-copy] element.
    var btn = t.closest('[data-copy]')
    if (!btn) return
    var text = btn.getAttribute('data-copy') || ''
    if (!text) return
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          window.oiToast({ tone: 'success', body: 'Copied to clipboard' })
        },
        function () {
          window.oiToast({ tone: 'danger', body: 'Copy failed — select manually' })
        },
      )
    }
  })

  // `<form data-confirm="…">` asks before submitting — the CSP-safe
  // replacement for an inline `onsubmit="return confirm(…)"`.
  document.addEventListener('submit', function (e) {
    var form = e.target
    if (!form || !form.getAttribute) return
    var msg = form.getAttribute('data-confirm')
    if (msg && !window.confirm(msg)) e.preventDefault()
  })

  // Build-info footer: the OpenSteward release, e.g. "OpenSteward 0.1.0", with
  // " · dev" for a build made from source rather than a published image. The
  // release is the console's own (the admin entry, answered in-process); the
  // System page is where services that disagree are flagged. Same-origin GET —
  // admin proxies the cross-service /version fan-out. One-shot; failure removes
  // the footer so the sidebar doesn't show a permanent "loading…".
  function versionFooter() {
    var el = document.querySelector('[data-version-footer]')
    if (!el) return
    fetch('/api/version-info', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null
      })
      .then(function (info) {
        var own = info && info.admin
        if (!own || typeof own !== 'object' || !own.release || own.release === 'unknown') {
          el.remove()
          return
        }
        var dev = own.gitSha === 'dev'
        el.textContent = 'OpenSteward ' + own.release + (dev ? ' · dev' : '')
        if (!dev && own.gitSha) el.title = 'git sha: ' + own.gitSha
      })
      .catch(function () {
        el.remove()
      })
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', versionFooter)
  else versionFooter()
})()
