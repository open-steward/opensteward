/**
 * `_table-filters-form.ejs` mirrors a hidden column's value into a hidden
 * input — but must NOT mirror a `rendered` one.
 *
 * A `hidden` column has no `<th>`, so it has no control of its own to carry
 * its value across a submit; the hidden mirror is what stops an active filter
 * on it from vanishing the moment the operator clicks Search. `rendered`
 * (table-controls.ts's `ColumnSpec.rendered`) is the exception: /audit's
 * from/to date range is hidden from the one-control-per-column filter row
 * because a two-value range cannot fit in it, but audit.ejs draws the two date
 * inputs itself under the same `f_from`/`f_to` names.
 *
 * Mirroring those too submits each name TWICE, and the browser sends both —
 * `one()` in table-controls.ts takes the last value, which is the hidden
 * mirror. An operator clearing the date box would watch the old date come
 * straight back, with nothing on screen to explain it. That is the failure
 * this file pins: the count, not merely the presence, of the mirrors.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTableQuery, type TableSpec } from '../../../src/core/views/table-controls'

const FORM_PATH = join(__dirname, '../../../views/_table-filters-form.ejs')

const SPEC: TableSpec = {
  id: 'mirror-filters',
  baseUrl: '/mirror',
  columns: [
    { key: 'name', header: 'Name', sortable: true, filter: 'text' },
    // No control of its own anywhere on the page — needs the mirror.
    { key: 'search', header: '', filter: 'text', hidden: true },
    // The view draws this one itself — must NOT be mirrored.
    { key: 'from', header: '', filter: 'text', hidden: true, rendered: true },
  ],
}

async function render(query: Record<string, string>): Promise<string> {
  const ejs = await import('ejs')
  const source = readFileSync(FORM_PATH, 'utf8')
  return ejs.render(
    source,
    { tableSpec: SPEC, tableState: parseTableQuery(query, SPEC) },
    { filename: FORM_PATH },
  )
}

/** Every `f_<key>` carried by a hidden input, in document order. */
function mirroredKeys(html: string): string[] {
  return [...html.matchAll(/<input type="hidden"[^>]*\bname="(f_[^"]+)"/g)].map((m) => m[1])
}

describe('_table-filters-form.ejs hidden-column mirrors', () => {
  it('mirrors a hidden column but not a `rendered` one, even with both filters active', async () => {
    const html = await render({ f_search: 'zephyr', f_from: '2026-01-01' })
    // Anti-vacuity: if the loop stopped emitting anything at all, an
    // "excludes from" assertion alone would pass while the real regression
    // (the mirror vanishing for `search` too) went unnoticed.
    expect(mirroredKeys(html)).toEqual(['f_search'])
    expect(html).toContain('value="zephyr"')
    expect(html).not.toContain('value="2026-01-01"')
  })

  it('mirrors nothing when neither hidden filter is active', async () => {
    expect(mirroredKeys(await render({ f_name: 'anything' }))).toEqual([])
  })
})
