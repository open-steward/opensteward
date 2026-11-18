/**
 * search-palette.ts — ⌘K palette shell.
 *
 * Built as a plain <div role="dialog"> rather than a native <dialog>:
 *   - the native element has a default border + `::backdrop` that
 *     would stack on top of our own backdrop and produce a dark frame
 *     around the box.
 *   - keeping it as a div lets us own the open/close state, the
 *     backdrop, and the focus management without fighting the UA.
 *
 * The fetched /search-index.json carries a full `body` field per
 * page so the lunr index searches keywords throughout the document,
 * not just the title + first paragraph. Body matches show a snippet
 * around the first occurrence so users see *why* a page matched.
 */

export const SEARCH_PALETTE_TRIGGER = `
  <button type="button" class="btn btn--ghost btn--sm" data-search-open aria-haspopup="dialog" aria-controls="search-palette" aria-label="Search docs">
    <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
    <kbd class="search-trigger__kbd">⌘K</kbd>
  </button>
`

export const SEARCH_PALETTE_STYLES = `
  .search-trigger__kbd {
    display: inline-block;
    margin-left: var(--space-1, 4px);
    padding: 0 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    font: inherit;
    font-size: var(--text-2xs, 11px);
    color: var(--fg-3);
    background: var(--surface-1);
  }
  @media (max-width: 880px) {
    .search-trigger__kbd { display: none; }
  }

  /* The palette is a <div>, not a native <dialog>: state every
     important property under the .is-open modifier so the box renders
     without UA chrome and without a doubled backdrop. */
  .search-palette {
    display: none;
  }
  .search-palette.is-open {
    display: flex;
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1000);
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: color-mix(in srgb, var(--fg-1) 28%, transparent);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    animation: search-palette-fade var(--motion-fast, 120ms) ease-out;
  }
  @keyframes search-palette-fade { from { opacity: 0 } to { opacity: 1 } }

  .search-palette__match {
    color: var(--fg-2);
    font-size: var(--text-xs);
    display: block;
    margin-top: 2px;
    line-height: 1.4;
  }
  .search-palette__match mark {
    background: color-mix(in srgb, var(--accent, #f59e0b) 30%, transparent);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
  }
  .search-palette__result {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .search-palette__footer kbd {
    display: inline-block;
    padding: 0 5px;
    border: 1px solid var(--border-subtle);
    border-radius: 3px;
    background: var(--surface-1);
    color: var(--fg-3);
    font-size: var(--text-2xs, 11px);
    margin: 0 2px;
  }
`

export const SEARCH_PALETTE_HTML = `
  <div class="search-palette" id="search-palette" role="dialog" aria-modal="true" aria-label="Search docs" aria-hidden="true">
    <div class="search-palette__box" role="document">
      <div class="search-palette__input-row">
        <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        <input class="search-palette__input" type="search" placeholder="Search docs…" aria-label="Search query" data-search-input autocomplete="off">
        <button type="button" class="btn btn--ghost btn--sm" data-search-close aria-label="Close"><i class="ph ph-x"></i></button>
      </div>
      <div class="search-palette__results" role="listbox" data-search-results>
        <div class="search-palette__empty">Type to search the docs.</div>
      </div>
      <div class="search-palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
`

/**
 * Browser-side script body. Wired up via a `<script>` tag emitted by
 * the docs-server templates. Lunr is fetched lazily on first ⌘K so
 * the byte-cost only lands for users who actually search.
 */
export const SEARCH_PALETTE_SCRIPT = `
(() => {
  const palette = document.getElementById('search-palette');
  if (!palette) return;
  const input = palette.querySelector('[data-search-input]');
  const results = palette.querySelector('[data-search-results]');
  let entries = null;
  let idx = null;
  let selected = 0;
  let lastFocus = null;

  function open() {
    if (palette.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    palette.classList.add('is-open');
    palette.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input && input.focus(), 0);
    ensureIndex();
  }
  function close() {
    palette.classList.remove('is-open');
    palette.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }
  function isOpen() {
    return palette.classList.contains('is-open');
  }

  // Load /design/vendor/lunr/lunr.min.js once, resolving to window.lunr.
  // Cached on the promise so repeated opens do not re-inject the tag.
  let lunrPromise = null;
  function loadLunr() {
    if (window.lunr) return Promise.resolve(window.lunr);
    if (lunrPromise) return lunrPromise;
    lunrPromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = '/design/vendor/lunr/lunr.min.js';
      s.onload = function () {
        if (window.lunr) resolve(window.lunr);
        else reject(new Error('lunr loaded but window.lunr is unset'));
      };
      s.onerror = function () { reject(new Error('failed to load lunr')); };
      document.head.appendChild(s);
    });
    return lunrPromise;
  }

  async function ensureIndex() {
    if (entries) return;
    try {
      const res = await fetch('/search-index.json');
      if (!res.ok) throw new Error('no index');
      entries = await res.json();
      try {
        // lunr ships UMD, not ESM. A bare dynamic import() of the UMD
        // file throws, because UMD assigns to this.lunr and "this" is
        // undefined at the top level of a module. So load it as a classic
        // script and read the global it sets.
        const lunr = await loadLunr();
        idx = lunr(function () {
          this.ref('url');
          this.field('title', { boost: 10 });
          this.field('headings', { boost: 5 });
          this.field('snippet', { boost: 2 });
          this.field('body');
          entries.forEach(e => this.add(e));
        });
      } catch (e) {
        idx = null;
      }
      render(input.value || '');
    } catch (e) {
      entries = [];
      results.innerHTML = '<div class="search-palette__empty">Search index not built yet. Run <code>pnpm docs:all</code> to generate one.</div>';
    }
  }

  function highlight(text, q) {
    if (!text) return '';
    const escaped = escape(text);
    if (!q) return escaped;
    const re = new RegExp('(' + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\s+/g, '|') + ')', 'gi');
    return escaped.replace(re, '<mark>$1</mark>');
  }

  function snippetFor(entry, q) {
    if (!q) return entry.snippet || '';
    const body = String(entry.body || entry.snippet || '');
    if (!body) return entry.snippet || '';
    const lc = body.toLowerCase();
    const first = q.toLowerCase().split(/\\s+/).filter(Boolean)[0] || '';
    const i = first ? lc.indexOf(first) : -1;
    if (i < 0) return entry.snippet || body.slice(0, 160);
    const start = Math.max(0, i - 60);
    const end = Math.min(body.length, i + 120);
    return (start > 0 ? '…' : '') + body.slice(start, end).trim() + (end < body.length ? '…' : '');
  }

  function render(query) {
    if (!entries) return;
    const q = (query || '').trim();
    if (!q) {
      results.innerHTML = '<div class="search-palette__empty">Type to search the docs.</div>';
      return;
    }
    let hits = [];
    if (idx) {
      try {
        // Trailing wildcard so partial matches surface as you type.
        const lunrQuery = q.split(/\\s+/).filter(Boolean).map(t => t + '*').join(' ');
        hits = idx.search(lunrQuery).slice(0, 12).map(h => entries.find(e => e.url === h.ref)).filter(Boolean);
      } catch (e) { hits = []; }
    }
    if (hits.length === 0) {
      const lc = q.toLowerCase();
      hits = entries.filter(e =>
        (e.title || '').toLowerCase().includes(lc) ||
        (e.snippet || '').toLowerCase().includes(lc) ||
        (e.body || '').toLowerCase().includes(lc) ||
        (Array.isArray(e.headings) ? e.headings.join(' ').toLowerCase() : '').includes(lc)
      ).slice(0, 12);
    }
    if (hits.length === 0) {
      results.innerHTML = '<div class="search-palette__empty">No matches.</div>';
      return;
    }
    selected = 0;
    results.innerHTML = hits.map((h, i) => {
      const title = highlight(h.title || h.url, q);
      const match = highlight(snippetFor(h, q), q);
      return \`
        <a class="search-palette__result" role="option" aria-selected="\${i === 0 ? 'true' : 'false'}" href="\${h.url}">
          <strong>\${title}</strong>
          <span>\${escape(h.url)}</span>
          <span class="search-palette__match">\${match}</span>
        </a>
      \`;
    }).join('');
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function moveSelection(delta) {
    const items = results.querySelectorAll('.search-palette__result');
    if (items.length === 0) return;
    items[selected]?.setAttribute('aria-selected', 'false');
    selected = (selected + delta + items.length) % items.length;
    const next = items[selected];
    next.setAttribute('aria-selected', 'true');
    next.scrollIntoView({ block: 'nearest' });
  }

  function activate() {
    const sel = results.querySelector('.search-palette__result[aria-selected="true"]');
    if (sel && sel.href) window.location.href = sel.href;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close();
    } else if (isOpen()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(); }
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-search-open]')) { e.preventDefault(); open(); }
    else if (t.closest('[data-search-close]')) { e.preventDefault(); close(); }
    else if (isOpen() && t === palette) { close(); }
  });

  if (input) input.addEventListener('input', (e) => render(e.target.value));
})();
`
