/**
 * Embeds one Apache Superset dashboard (views/dashboards/superset.ejs).
 *
 * Uses the vendored embedded SDK (`/vendor/superset-embedded-sdk.js`, global
 * `supersetEmbeddedSdk`). The SDK frames Superset's `/embedded/<uuid>` page
 * and calls `fetchGuestToken` for the first token and again before each one
 * expires. Tokens come from this console — `POST /dashboards/superset/<id>/guest-token`
 * with the page's CSRF token — never from Superset directly, so what the frame
 * shows is always bounded by the signed-in operator's tenant scope.
 *
 * No inline script: the page runs under the strict CSP (`script-src 'self'`,
 * `frame-src` = the Superset origin).
 */
;(function () {
  'use strict'

  var root = document.querySelector('[data-superset-embed]')
  if (!root) return
  var state = root.querySelector('[data-superset-state]')
  var mount = root.querySelector('[data-superset-mount]')

  function show(message) {
    if (!state) return
    state.textContent = message
    state.hidden = false
  }

  var sdk = window.supersetEmbeddedSdk
  if (!sdk || typeof sdk.embedDashboard !== 'function') {
    show('The dashboard library did not load.')
    return
  }

  var dashboardId = root.getAttribute('data-dashboard-id') || ''
  var csrf = root.getAttribute('data-csrf') || ''

  // The SDK inserts a bare <iframe>; size it to the card as soon as it lands.
  function fit(frame) {
    frame.style.width = '100%'
    frame.style.height = '75vh'
    frame.style.border = '0'
    frame.style.display = 'block'
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () {
      var frame = mount.querySelector('iframe')
      if (frame) fit(frame)
    }).observe(mount, { childList: true })
  }

  function fetchGuestToken() {
    return fetch('/dashboards/superset/' + encodeURIComponent(dashboardId) + '/guest-token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ _csrf: csrf }).toString(),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return null
        })
        .then(function (json) {
          if (!res.ok || !json || typeof json.token !== 'string') {
            var message =
              json && json.error && json.error.message
                ? json.error.message
                : 'The dashboard could not be authorised (HTTP ' + res.status + ').'
            show(message)
            throw new Error(message)
          }
          return json.token
        })
    })
  }

  sdk
    .embedDashboard({
      id: root.getAttribute('data-embedded-uuid') || '',
      supersetDomain: root.getAttribute('data-superset-domain') || '',
      mountPoint: mount,
      fetchGuestToken: fetchGuestToken,
      dashboardUiConfig: { hideTitle: true, filters: { expanded: false } },
      iframeTitle: document.title,
      // The console sends `Referrer-Policy: no-referrer` (helmet), but
      // Superset admits an embedded dashboard only when the frame's Referer
      // matches one of its allowed domains. Send the origin — never the path.
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    .then(function () {
      if (state) state.hidden = true
      var frame = mount.querySelector('iframe')
      if (frame) fit(frame)
    })
    .catch(function (err) {
      if (!state || state.hidden) show('The dashboard could not be loaded.')
      if (window.console) window.console.error(err)
    })
})()
