/**
 * A filter form must never be nested inside a table.
 *
 * `<form>` is not a permitted child of `<table>`, `<thead>` or `<tr>`, and
 * twelve of the admin's index tables already carry POST forms in their cells.
 * A misplaced `</form>` makes the parser hand the FIRST row's POST form to the
 * filter form: that row's action button silently becomes a filter GET, and its
 * `_csrf` hidden input is re-owned into the query string — where `req.url`
 * logging does not redact it. This is a permanent guard, not a one-off check.
 *
 * Fix-round-1 note: this guard shipped green for the wrong reason. Two bugs
 * cancelled out —
 *   (a) the "which form's opening tag" lookup used `src.indexOf(tag)`, which
 *       always returns the FIRST `<form` in the whole file no matter which
 *       match the loop is currently on, so every check after the first read
 *       stale text; and
 *   (b) `_table-filters-form.ejs`'s own explanatory comment used to spell the
 *       tag names out as real markup, which the depth-tracking regex below
 *       cannot tell apart from an actual open tag — so that one literal
 *       mention permanently bumped depth to 1 for the rest of the file and
 *       made its own correctly-placed form read as nested.
 * Fixing only one of the two still left the guard silently unable to catch a
 * real nested form. Both are fixed here: `m.index` replaces `src.indexOf`,
 * the comment was reworded to prose with no literal tag text, an
 * anti-vacuity check on `ejsFiles` guards against the walker breaking, and a
 * self-test fixture proves the detection logic actually fires.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const VIEWS = join(import.meta.dirname, '../../../views')

function ejsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? ejsFiles(join(dir, e.name)) : e.name.endsWith('.ejs') ? [join(dir, e.name)] : [],
  )
}

/**
 * Does `src` open an id'd form element while a table element is still open?
 * Pulled out of the loop below so a fixture can exercise it directly — a
 * guard that only ever runs against files that already pass cannot be
 * trusted to catch a regression, which is exactly what happened here.
 *
 * Walks matches by `m.index` (from `matchAll`), never `src.indexOf(tag)`:
 * the latter always resolves to the FIRST occurrence of that tag text in the
 * whole file regardless of which match the loop is on, so every check past
 * the first one was silently re-inspecting stale text instead of the tag
 * actually at this position.
 */
function idFormInsideTable(src: string): string | null {
  let depth = 0
  for (const m of src.matchAll(/<\/?(?:table|form)\b/g)) {
    const tag = m[0]
    if (tag === '<table') depth++
    else if (tag === '</table') depth--
    else if (tag === '<form' && depth > 0) {
      // A POST form inside a <td> is fine and common; what is banned is a
      // form that owns filter controls. Those always carry `form=` on the
      // control instead, so any form declaring an id is the filter form.
      const open = src.slice(m.index, src.indexOf('>', m.index) + 1)
      if (/\bid=/.test(open)) return open
    }
  }
  return null
}

describe('table filter forms', () => {
  const files = ejsFiles(VIEWS)

  it('is actually reading the views', () => {
    // Without this the rule below passes vacuously the moment the walker
    // breaks — the same failure mode the sibling guard in this directory
    // (no-interpolation-in-inline-js.test.ts) already guards against.
    expect(files.length).toBeGreaterThan(30)
  })

  it('never open a <form> inside a <table>', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const offender = idFormInsideTable(src)
      expect(offender, `${file} opens an id'd form inside a table`).toBeNull()
    }
  })

  it('detects a form nested inside a table (guard self-test)', () => {
    // A guard that cannot fail is worse than no guard. This fixture is the
    // exact shape the guard exists to catch — an id'd filter form dropped
    // inside a table rather than left outside it with `form=` controls —
    // and proves the detection logic actually fires, independent of whether
    // the real tree happens to be clean right now.
    const fixture = '<table><thead><tr><th><form id="evil-filters"></form></th></tr></thead></table>'
    expect(idFormInsideTable(fixture)).toMatch(/id="evil-filters"/)
  })

  it('gives every filter control a form attribute', () => {
    const head = readFileSync(join(VIEWS, '_table-head.ejs'), 'utf8')
    const controls = head.match(/<(?:input|select|button)\b[^>]*>/g) ?? []
    expect(controls.length).toBeGreaterThan(0)
    for (const c of controls) expect(c, c).toMatch(/\bform="/)
  })
})
