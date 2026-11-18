/**
 * Renders queued flash messages as toasts. No framework, no build step.
 *
 * Loaded with `defer` after /public/js/shell.js, which defines
 * `window.oiToast`: deferred scripts run in document order, so it has already
 * executed. That is why there is no DOMContentLoaded wrapper here, unlike the
 * view-inlined toast scripts this replaces.
 *
 * Why the payload arrives in a <template> rather than templated JS: its
 * contents are an inert document fragment, and EJS escapes the text, so a
 * "</script>" inside an upstream error message cannot break out — there is no
 * script for it to break out of. `.textContent` hands back the exact original
 * string with no parsing at this end.
 *
 * It is also what makes flashes announced. #toast-stack is aria-live="polite"
 * and empty at parse time; content already present in a live region when the
 * page loads is NOT announced. Appending after load is the announcement.
 */
;(function () {
  'use strict'

  var tpl = document.getElementById('flash-data')
  if (!tpl || !window.oiToast) return

  // Severity decides persistence, and it is decided here rather than at each
  // call site so "errors do not disappear on their own" cannot be broken by a
  // route forgetting to pass a duration.
  var STICKY = { danger: true, warning: true }

  var nodes = tpl.content.querySelectorAll('[data-flash-tone]')
  for (var i = 0; i < nodes.length; i++) {
    var tone = nodes[i].getAttribute('data-flash-tone') || 'info'
    var body = (nodes[i].textContent || '').trim()
    if (!body) continue
    window.oiToast({ tone: tone, body: body, duration: STICKY[tone] ? 0 : 4000 })
  }

  tpl.remove()
})()
