/**
 * JSON tree for stored records (views/data/record.ejs).
 *
 * Upgrades every `[data-json-view]` container: reads the record from its
 * inert `<script type="application/json" data-json-view-source>` block and
 * the field classes from `[data-json-view-classes]`, and replaces the plain
 * `<pre>` fallback with a collapsible tree. Keys whose field is classified
 * `pii` or `financial` carry a badge, so a reader can tell a masked value
 * from one that simply looks odd.
 *
 * Built with DOM APIs and `textContent` only — record values are customer
 * data and are never parsed as HTML. No inline script anywhere, so it runs
 * under the data pages' `script-src 'self'` policy.
 *
 * The record page is also opened inside the resource modal, where scripts in
 * the fetched page do not run — so this file is loaded by the list page too,
 * and a MutationObserver upgrades a tree the moment the dialog inserts it.
 */
;(function () {
  'use strict'

  var OPEN_DEPTH = 2

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }

  function readJson(container, selector) {
    var node = container.querySelector(selector)
    if (!node) return null
    try {
      return JSON.parse(node.textContent || 'null')
    } catch (e) {
      return null
    }
  }

  function badgeFor(cls) {
    if (cls === 'pii') return el('span', 'badge badge--warning json-view__badge', 'PII')
    if (cls === 'financial') return el('span', 'badge badge--info json-view__badge', 'financial')
    return null
  }

  function scalar(value) {
    var type = value === null ? 'null' : typeof value
    var text = type === 'string' ? JSON.stringify(value) : String(value)
    return el('span', 'json-view__value json-view__value--' + type, text)
  }

  function keyLine(key, path, classes) {
    var frag = document.createDocumentFragment()
    if (key === null) return frag
    frag.appendChild(el('span', 'json-view__key', String(key)))
    var b = badgeFor(classes[path])
    if (b) frag.appendChild(b)
    frag.appendChild(el('span', 'json-view__colon', ': '))
    return frag
  }

  function node(key, value, path, classes, depth) {
    var isArr = Array.isArray(value)
    if (value === null || typeof value !== 'object') {
      var li = el('li', 'json-view__row')
      li.appendChild(keyLine(key, path, classes))
      li.appendChild(scalar(value))
      return li
    }
    var entries = isArr
      ? value.map(function (v, i) {
          return [i, v]
        })
      : Object.keys(value).map(function (k) {
          return [k, value[k]]
        })
    var row = el('li', 'json-view__row')
    var details = el('details', 'json-view__branch')
    if (depth < OPEN_DEPTH) details.open = true
    var summary = el('summary', 'json-view__summary')
    summary.appendChild(keyLine(key, path, classes))
    summary.appendChild(
      el(
        'span',
        'json-view__meta',
        isArr ? '[' + entries.length + ']' : '{' + entries.length + '}',
      ),
    )
    details.appendChild(summary)
    var list = el('ul', 'json-view__list')
    entries.forEach(function (e) {
      // Array elements share their parent's path: classes are per field, not index.
      var childPath = isArr ? path : path ? path + '.' + e[0] : String(e[0])
      list.appendChild(node(isArr ? e[0] : e[0], e[1], childPath, classes, depth + 1))
    })
    details.appendChild(list)
    row.appendChild(details)
    return row
  }

  function upgrade(container) {
    if (container.getAttribute('data-json-view-ready') === 'true') return
    var data = readJson(container, '[data-json-view-source]')
    if (data === null) return
    var classes = readJson(container, '[data-json-view-classes]') || {}
    container.setAttribute('data-json-view-ready', 'true')

    var toolbar = el('div', 'json-view__toolbar row')
    var expand = el('button', 'btn btn--ghost btn--sm', 'Expand all')
    expand.type = 'button'
    var collapse = el('button', 'btn btn--ghost btn--sm', 'Collapse all')
    collapse.type = 'button'
    toolbar.appendChild(expand)
    toolbar.appendChild(collapse)

    var root = el('ul', 'json-view__list json-view__root mono')
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach(function (k) {
        root.appendChild(node(k, data[k], k, classes, 0))
      })
    } else {
      root.appendChild(node(null, data, '', classes, 0))
    }
    expand.addEventListener('click', function () {
      root.querySelectorAll('details').forEach(function (d) {
        d.open = true
      })
    })
    collapse.addEventListener('click', function () {
      root.querySelectorAll('details').forEach(function (d) {
        d.open = false
      })
    })

    var fallback = container.querySelector('.json-view__fallback')
    if (fallback) fallback.remove()
    container.appendChild(toolbar)
    container.appendChild(root)
  }

  function scan(scope) {
    ;(scope || document).querySelectorAll('[data-json-view]').forEach(upgrade)
  }

  function start() {
    scan(document)
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes
          for (var j = 0; j < added.length; j++) {
            var n = added[j]
            if (n.nodeType !== 1) continue
            if (n.matches && n.matches('[data-json-view]')) upgrade(n)
            else if (n.querySelectorAll) scan(n)
          }
        }
      }).observe(document.body, { childList: true, subtree: true })
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
