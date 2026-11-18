/**
 * The Swagger UI reference shell, shared by /unified-api (the developer
 * API) and /operator-api (admin-api).
 *
 * One shell so the two pages look and behave the same: a 240px sticky
 * sidebar that reads the spec once on load, renders a tag rail plus the
 * active tag's operations, and drives Swagger UI's own filter through the
 * Redux action its built-in filter input fires (that input is hidden so
 * there is one filter UI). Light and dark modes both work — the caller's
 * `head` carries the theme bootstrap, and swagger-theme.css covers the
 * surfaces Swagger UI colours with literal hex values.
 *
 * What differs per page is data, not layout: which spec to load, what the
 * rail's groups are called ("Verticals" for the developer API, "Sections"
 * for the operator API), the header's spec links, and whether to wire the
 * vertical→adapter cascade, which only makes sense where operations take a
 * `vertical` and a `platform` parameter.
 *
 * The spec is fetched client-side, so the sidebar reflects the live spec
 * without a server restart.
 */
import { renderHeader } from './header.js'
import { SEARCH_PALETTE_HTML, SEARCH_PALETTE_SCRIPT } from './search-palette.js'

export interface SwaggerReferenceOptions {
  /** Page title, before " - Documentation - OpenSteward". */
  title: string
  /** The `<head>` block: design-system links, theme bootstrap, nav styles. */
  head: string
  /** URL Swagger UI loads and the sidebar reads. */
  specJsonUrl: string
  /** Links rendered in the page header, typically to the raw spec files. */
  anchorLinks: Array<{ href: string; label: string; className?: string }>
  /** What one tag group is called, lower case, e.g. "vertical" / "section". */
  groupNoun: string
  /** Eyebrow above the tag rail, e.g. "Verticals" / "Sections". */
  groupsEyebrow: string
  /**
   * Wire the vertical→adapter cascade on Try-it-out forms. Only the
   * developer API has operations taking `vertical` + `platform`, and only
   * it serves /specs/platform-slugs.json.
   */
  adapterCascade: boolean
}

/**
 * The cascade filters each operation's adapter <select> by the chosen
 * vertical. OpenAPI cannot express this: Swagger UI renders a parameter's
 * `enum` as a flat <select> built from that one schema node; if/then, oneOf
 * and dependentSchemas are drawn in the Models tab but never reach the
 * Try-it-out controls. So the cascade lives here, the same way the admin
 * portal does it (views/connect-links/new.ejs): hold the catalog, filter on
 * change.
 *
 * Everything in it is best-effort. Swagger UI arrives from a vendored build
 * whose DOM can change under us; on any surprise it bails and leaves the
 * page exactly as it was — a full, unfiltered adapter list that still works.
 */
const ADAPTER_CASCADE_JS = `
      var adaptersByVertical = null;

      function loadAdapterCatalog() {
        return fetch('/specs/platform-slugs.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !Array.isArray(data.entries)) return null;
            var map = {};
            data.entries.forEach(function (e) {
              if (!e || !e.vertical || !e.slug) return;
              (map[e.vertical] = map[e.vertical] || []).push({ slug: e.slug, name: e.name || e.slug });
            });
            Object.keys(map).forEach(function (v) {
              map[v].sort(function (a, b) { return a.name.localeCompare(b.name); });
            });
            adaptersByVertical = map;
            return map;
          })
          .catch(function () { return null; });
      }

      /** The <select> for a named parameter within one operation block. */
      function paramSelect(opblock, names) {
        var rows = opblock.querySelectorAll('tr[data-param-name]');
        for (var i = 0; i < rows.length; i++) {
          if (names.indexOf(rows[i].getAttribute('data-param-name')) !== -1) {
            var sel = rows[i].querySelector('select');
            if (sel) return sel;
          }
        }
        return null;
      }

      function fillAdapterSelect(select, vertical) {
        var list = (adaptersByVertical && adaptersByVertical[vertical]) || null;
        if (!list) return;
        var previous = select.value;
        // Swagger's own placeholder is the first option; keep it so the
        // parameter can still be cleared.
        var placeholder = select.options.length ? select.options[0] : null;
        select.innerHTML = '';
        if (placeholder && !placeholder.value) select.appendChild(placeholder);
        list.forEach(function (a) {
          var opt = document.createElement('option');
          opt.value = a.slug;
          opt.textContent = a.name + ' (' + a.slug + ')';
          select.appendChild(opt);
        });
        // Keep the operator's choice when the new vertical still offers it.
        for (var i = 0; i < select.options.length; i++) {
          if (select.options[i].value === previous) { select.value = previous; return; }
        }
      }

      function wireAdapterCascade() {
        if (!adaptersByVertical) return;
        var blocks = document.querySelectorAll('#swagger-ui .opblock');
        for (var i = 0; i < blocks.length; i++) {
          var block = blocks[i];
          if (block.getAttribute('data-oi-cascade') === '1') continue;
          var verticalSel = paramSelect(block, ['vertical']);
          var adapterSel = paramSelect(block, ['platform', 'slug']);
          if (!verticalSel || !adapterSel) continue;
          block.setAttribute('data-oi-cascade', '1');
          (function (vSel, aSel) {
            var apply = function () { fillAdapterSelect(aSel, vSel.value); };
            vSel.addEventListener('change', apply);
            if (vSel.value) apply();
          })(verticalSel, adapterSel);
        }
      }

      function safeCascade() {
        try { wireAdapterCascade(); } catch (e) { /* leave the page as-is */ }
      }

      loadAdapterCatalog().then(function (map) { if (map) safeCascade(); });
      document.addEventListener('oi-swagger-ready', safeCascade);
`

/** No cascade on this page; the observer below still calls the name. */
const NO_CASCADE_JS = `
      function safeCascade() {}
`

export function renderSwaggerReference(opts: SwaggerReferenceOptions): string {
  const noun = opts.groupNoun
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title} - Documentation - OpenSteward</title>
  ${opts.head}
  <!-- Load order matters: swagger-ui.css first so our swagger-theme.css
       can override via specificity + later-declared-wins. (Don't use
       @layer here — unlayered rules beat named layers in the CSS
       cascade, so our overrides would silently lose.) -->
  <link rel="stylesheet" href="/design/vendor/swagger-ui/swagger-ui.css">
  <link rel="stylesheet" href="/design/swagger-theme.css">
  <style>
    body { background: var(--paper); }

    /* ── Shell ────────────────────────────────────────────────────── */
    .api-ref-shell {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 var(--space-6);
      gap: var(--space-6);
      align-items: start;
    }
    .api-ref-shell .docs-shell__main {
      max-width: none;
      margin: 0;
      padding: var(--space-4) 0 var(--space-6);
      min-width: 0;
    }

    /* Swagger's own Servers + Authorize bar is sticky/top:0/z:9999 —
       it slides up under our page header on scroll. Pin it inline. */
    .swagger-ui .scheme-container {
      position: static;
      box-shadow: none;
      background: transparent;
      padding: var(--space-2) 0;
    }

    /* Hide Swagger UI's built-in filter input — the sidebar input
       drives the same layoutActions.updateFilter Redux action that
       this input would. Two filter UIs would be confusing. */
    .swagger-ui .filter-container { display: none; }

    /* ── Sidebar (rail) ──────────────────────────────────────────── */
    .api-ref-rail {
      position: sticky;
      top: calc(64px + var(--space-2));
      align-self: start;
      max-height: calc(100vh - 64px - var(--space-4));
      overflow-y: auto;
      padding: var(--space-4) 0;
      font-size: var(--text-sm);
      border-right: 1px solid var(--border-subtle);
    }
    .api-ref-rail__filter {
      position: relative;
      margin: 0 var(--space-3) var(--space-4);
    }
    .api-ref-rail__filter > i {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      font-size: 14px; color: var(--fg-3); pointer-events: none;
    }
    .api-ref-rail__filter input {
      width: 100%;
      height: 32px;
      padding: 0 var(--space-2) 0 32px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--fg-1);
      background: var(--surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }
    .api-ref-rail__filter input:focus-visible {
      outline: none;
      border-color: var(--accent);
      box-shadow: var(--shadow-focus);
    }
    .api-ref-rail__filter input::placeholder { color: var(--fg-4); }

    .api-ref-rail__section { padding: 0 var(--space-3); }
    .api-ref-rail__section + .api-ref-rail__section { margin-top: var(--space-4); }
    .api-ref-rail__eyebrow {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      color: var(--fg-3);
      padding: 0 var(--space-2);
      margin-bottom: var(--space-1_5);
    }

    .api-ref-rail__tag {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 6px var(--space-2);
      margin-left: -2px;
      border-left: 2px solid transparent;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      color: var(--fg-2);
      text-decoration: none;
      font-size: var(--text-sm);
      cursor: pointer;
      background: none;
      border-top: 0; border-right: 0; border-bottom: 0;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }
    .api-ref-rail__tag:hover { color: var(--fg-1); background: var(--surface-1); }
    .api-ref-rail__tag[aria-current="true"] {
      color: var(--fg-1);
      font-weight: 500;
      background: var(--surface-1);
      border-left-color: var(--accent);
    }
    .api-ref-rail__tag .vtile {
      width: 20px; height: 20px; font-size: 10px;
      border-radius: var(--radius-xs);
    }
    .api-ref-rail__tag-label { flex: 1; min-width: 0; }
    .api-ref-rail__tag-count {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg-3);
    }

    .api-ref-rail__op {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 4px var(--space-2);
      color: var(--fg-2);
      text-decoration: none;
      font-size: var(--text-sm);
      border-radius: var(--radius-xs);
    }
    .api-ref-rail__op:hover { background: var(--surface-1); color: var(--fg-1); }
    .api-ref-rail__op__method {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      min-width: 36px;
      text-align: right;
      color: var(--fg-3);
      flex-shrink: 0;
    }
    .api-ref-rail__op__method--get     { color: var(--method-get, #2F6AA8); }
    .api-ref-rail__op__method--post    { color: var(--method-post, #3D7A47); }
    .api-ref-rail__op__method--put     { color: var(--method-put, #B5751E); }
    .api-ref-rail__op__method--patch   { color: var(--method-patch, #2F7A79); }
    .api-ref-rail__op__method--delete  { color: var(--method-delete, #B33A2A); }
    .api-ref-rail__op__method--head    { color: var(--method-head, #6D52A3); }
    .api-ref-rail__op__method--options { color: var(--method-options, #73746A); }
    .api-ref-rail__op__path {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .api-ref-rail__empty {
      padding: var(--space-3) var(--space-2);
      color: var(--fg-3);
      font-size: var(--text-sm);
    }

    @media (max-width: 880px) {
      .api-ref-shell {
        grid-template-columns: 1fr;
        gap: var(--space-2);
        padding: 0 var(--space-4);
      }
      .api-ref-rail {
        position: static;
        max-height: none;
        border-right: 0;
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: var(--space-2);
      }
    }
  </style>
</head>
<body>
  ${renderHeader({ anchorLinks: opts.anchorLinks })}
  <div class="api-ref-shell">
    <aside class="api-ref-rail" data-rail aria-label="${opts.title} navigation">
      <div class="api-ref-rail__filter">
        <i class="ph ph-funnel" aria-hidden="true"></i>
        <input type="search" data-filter
               placeholder="Filter operations…"
               aria-label="Filter operations by path or summary">
      </div>
      <div class="api-ref-rail__section">
        <div class="api-ref-rail__eyebrow">${opts.groupsEyebrow}</div>
        <div data-rail-tags>
          <div class="api-ref-rail__empty">Loading…</div>
        </div>
      </div>
      <div class="api-ref-rail__section">
        <div class="api-ref-rail__eyebrow">Operations</div>
        <div data-rail-ops>
          <div class="api-ref-rail__empty">Select a ${noun} above.</div>
        </div>
      </div>
    </aside>
    <main class="docs-shell__main">
      <div id="swagger-ui"></div>
    </main>
  </div>
  <script src="/design/vendor/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="/design/vendor/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script>
    (function () {
      // Boot Swagger UI with filter:true so its native filter machinery
      // is active. The sidebar drives it via the same Redux action its
      // built-in filter input fires.
      var ui = SwaggerUIBundle({
        url: '${opts.specJsonUrl}',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        tryItOutEnabled: true,
        deepLinking: true,
        filter: true,
        onComplete: function () {
          document.dispatchEvent(new CustomEvent('oi-swagger-ready'));
        },
      });
      window.ui = ui;

      function updateSwaggerFilter(value) {
        try {
          ui.getSystem().layoutActions.updateFilter(value || '');
        } catch (e) {
          document.addEventListener('oi-swagger-ready', function once() {
            document.removeEventListener('oi-swagger-ready', once);
            try { ui.getSystem().layoutActions.updateFilter(value || ''); } catch (_) {}
          });
        }
      }

      var rail        = document.querySelector('[data-rail]');
      var tagsHost    = rail.querySelector('[data-rail-tags]');
      var opsHost     = rail.querySelector('[data-rail-ops]');
      var filterInput = rail.querySelector('[data-filter]');

      // Tag name (lower-cased) -> vertical token stem. Stems must match the
      // --vertical-{stem} tokens / .vtile--{stem} modifiers. All 9 verticals
      // are mapped (plus a few synonym tags) so every Accounting, Doc-signing,
      // etc. group gets its accent — not just the first five. Tags that are
      // not verticals (the operator API's) get a plain tile.
      var VERTICAL_MAP = {
        accounting: 'accounting', accountancy: 'accounting',
        crm: 'crm', sales: 'crm',
        ecommerce: 'ecommerce', commerce: 'ecommerce', orders: 'ecommerce',
        logistics: 'logistics', shipping: 'logistics', fulfilment: 'logistics',
        payments: 'payments', payment: 'payments', billing: 'payments',
        docsign: 'docsign', docsigning: 'docsign', 'doc signing': 'docsign', esignature: 'docsign',
        projects: 'projects', project: 'projects',
        'customer-support': 'customer-support', 'customer support': 'customer-support',
        customersupport: 'customer-support', support: 'customer-support',
        inventory: 'inventory', stock: 'inventory',
      };
      function verticalFor(tagName) {
        var k = (tagName || '').toLowerCase();
        return VERTICAL_MAP[k] || '';
      }

      fetch('${opts.specJsonUrl}').then(function (r) { return r.json(); }).then(function (spec) {
        var paths = spec.paths || {};
        var declaredTags = (spec.tags || []).map(function (t) { return t.name; });
        var byTag = {};

        Object.keys(paths).forEach(function (path) {
          var ops = paths[path];
          Object.keys(ops).forEach(function (method) {
            if (['get','post','put','patch','delete','head','options'].indexOf(method) === -1) return;
            var op = ops[method];
            var tags = (op.tags && op.tags.length) ? op.tags : ['default'];
            tags.forEach(function (tag) {
              if (!byTag[tag]) byTag[tag] = [];
              byTag[tag].push({
                method: method,
                path: path,
                summary: op.summary || op.operationId || '',
                operationId: op.operationId || (method + '-' + path),
              });
            });
          });
        });

        var tagNames = declaredTags.slice();
        Object.keys(byTag).forEach(function (t) { if (tagNames.indexOf(t) === -1) tagNames.push(t); });

        renderTags(tagNames, byTag);

        var hashTag = decodeURIComponent((location.hash.match(/#tag\\/([^/]+)/) || [])[1] || '');
        if (hashTag && byTag[hashTag]) {
          activate(hashTag, byTag);
        } else {
          renderOps(null, byTag);
        }
      }).catch(function (err) {
        tagsHost.innerHTML = '<div class="api-ref-rail__empty">The spec failed to load.</div>';
        console.error('[api-ref-rail] failed to load spec', err);
      });

      function renderTags(tagNames, byTag) {
        var totalOps = 0;
        tagNames.forEach(function (t) { totalOps += (byTag[t] || []).length; });

        var allBtn =
          '<button type="button" class="api-ref-rail__tag" data-tag="" aria-current="true">' +
            '<span class="api-ref-rail__tag-label">All operations</span>' +
            '<span class="api-ref-rail__tag-count">' + totalOps + '</span>' +
          '</button>';

        var rest = tagNames.map(function (t) {
          var n = (byTag[t] || []).length;
          var v = verticalFor(t);
          var initials = t.slice(0, 2);
          var tile = v
            ? '<span class="vtile vtile--' + v + '">' + initials + '</span>'
            : '<span class="vtile">' + initials + '</span>';
          return (
            '<button type="button" class="api-ref-rail__tag" data-tag="' + escapeAttr(t) + '">' +
              tile +
              '<span class="api-ref-rail__tag-label">' + escapeHtml(t) + '</span>' +
              '<span class="api-ref-rail__tag-count">' + n + '</span>' +
            '</button>'
          );
        }).join('');

        tagsHost.innerHTML = allBtn + rest;
        tagsHost.addEventListener('click', function (e) {
          var btn = e.target.closest('.api-ref-rail__tag');
          if (!btn) return;
          activate(btn.dataset.tag, byTag);
        });
      }

      function renderOps(activeTag, byTag) {
        if (!activeTag || !byTag[activeTag]) {
          opsHost.innerHTML = '<div class="api-ref-rail__empty">Pick a ${noun} to list operations.</div>';
          return;
        }
        var ops = byTag[activeTag].slice(0, 80);
        if (ops.length === 0) {
          opsHost.innerHTML = '<div class="api-ref-rail__empty">No operations.</div>';
          return;
        }
        opsHost.innerHTML = ops.map(function (op) {
          var anchor = '#/' + encodeURIComponent(activeTag) + '/' + encodeURIComponent(op.operationId);
          var m = op.method;
          // Display the operation name (op.summary, falling back to
          // operationId, then path). Paths get truncated in a 240px
          // rail; names are concise and identify the action better.
          // The full path is in the title= tooltip for power users.
          var label = op.summary || op.operationId || op.path;
          return (
            '<a class="api-ref-rail__op" href="' + anchor + '" title="' + escapeAttr(m.toUpperCase() + ' ' + op.path) + '">' +
              '<span class="api-ref-rail__op__method api-ref-rail__op__method--' + m + '">' + m.toUpperCase() + '</span>' +
              '<span class="api-ref-rail__op__path">' + escapeHtml(label) + '</span>' +
            '</a>'
          );
        }).join('');
      }

      function activate(tag, byTag) {
        var buttons = tagsHost.querySelectorAll('[data-tag]');
        buttons.forEach(function (b) {
          var match = b.dataset.tag === (tag || '');
          if (match) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        });

        renderOps(tag, byTag);
        updateSwaggerFilter(tag || '');
        applyOpTextFilter(filterInput.value);
      }

      // Free-text op-name filter layered on top of Swagger's tag filter.
      // Swagger's native filter matches tag names only; this overlay
      // walks the visible .opblock elements and toggles display so users
      // can search by path or summary too. Bounded — Swagger doesn't
      // re-render the opblock list during normal browsing.
      function applyOpTextFilter(q) {
        q = (q || '').trim().toLowerCase();
        document.querySelectorAll('.swagger-ui .opblock-tag-section').forEach(function (section) {
          if (section.offsetParent === null) return;
          section.querySelectorAll('.opblock').forEach(function (b) {
            if (!q) { b.style.display = ''; return; }
            var path = (b.querySelector('.opblock-summary-path') || {}).textContent || '';
            var desc = (b.querySelector('.opblock-summary-description') || {}).textContent || '';
            var method = (b.querySelector('.opblock-summary-method') || {}).textContent || '';
            var hay = (path + ' ' + desc + ' ' + method).toLowerCase();
            b.style.display = hay.indexOf(q) !== -1 ? '' : 'none';
          });
        });
      }

      // Stamp each operation-group section with its vertical so the theme
      // can tint the tag header + opblock accent stripe to the vertical
      // colour (e.g. forest for Accounting). Swagger re-renders sections on
      // filter changes, so this is idempotent and re-run on every update.
      function tintSections() {
        document.querySelectorAll('.swagger-ui .opblock-tag-section').forEach(function (section) {
          var tagEl = section.querySelector('.opblock-tag');
          var tag = (tagEl && (tagEl.getAttribute('data-tag') || tagEl.textContent)) || '';
          var v = verticalFor(tag.trim());
          if (v) section.setAttribute('data-vertical', v);
          else section.removeAttribute('data-vertical');
        });
      }

      filterInput.addEventListener('input', function () {
        applyOpTextFilter(filterInput.value);
      });
      document.addEventListener('oi-swagger-ready', function () {
        tintSections();
        applyOpTextFilter(filterInput.value);
      });
${opts.adapterCascade ? ADAPTER_CASCADE_JS : NO_CASCADE_JS}
      // Swagger mutates the opblock list when a tag is expanded/filtered;
      // re-tint on DOM changes so freshly-rendered sections get their accent,
      // and re-wire any operation block that has just been rendered.
      var swaggerRoot = document.getElementById('swagger-ui');
      if (swaggerRoot && window.MutationObserver) {
        var tintScheduled = false;
        new MutationObserver(function () {
          if (tintScheduled) return;
          tintScheduled = true;
          requestAnimationFrame(function () { tintScheduled = false; tintSections(); safeCascade(); });
        }).observe(swaggerRoot, { childList: true, subtree: true });
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
      }
      function escapeAttr(s) { return escapeHtml(s); }
    })();
  </script>
  ${SEARCH_PALETTE_HTML}
  <script>${SEARCH_PALETTE_SCRIPT}</script>
</body>
</html>`
}
