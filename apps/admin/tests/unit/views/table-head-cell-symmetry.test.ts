/**
 * Header-row / filter-row `<th>` cell-count symmetry for `_table-head.ejs`,
 * and that a `hidden` column (table-controls.ts's `ColumnSpec.hidden`) is
 * excluded from BOTH rows, not just one.
 *
 * Nine tables now depend on this holding — `/api-keys` builds its TableSpec
 * per-role specifically so the Actions column vanishes together from both
 * rows for a non-admin, and `/webhooks`' hidden `search` alias must vanish
 * from both rows too, or a stray blank `<th>` misaligns every real column
 * next to it. The invariant is one careless edit to a single loop in
 * `_table-head.ejs` (header row vs. filter row) away from breaking for every
 * table on the page at once, and nothing guarded it directly — this renders
 * the partial itself and counts, so a broken loop fails here immediately
 * rather than being noticed by accident in nine separate journey tests.
 *
 * Renders `_table-head.ejs` in isolation (`ejs.render`, not the full Fastify
 * view pipeline), passing only what the partial actually reads:
 * `tableSpec`, `tableState`, and `sortHref` — the same three the app's own
 * `defaultContext` (server.ts) merges into every EJS render.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTableQuery, sortHref, type TableSpec, type TableState } from '../../../src/core/views/table-controls'

const VIEWS = join(__dirname, '../../../views')
const TABLE_HEAD_PATH = join(VIEWS, '_table-head.ejs')

/**
 * Counts `<th` cells, NOT `<thead`: `<thead>` is itself a 3-character-prefix
 * match for a bare `/<th/` regex ("<" + "th" + "ead"), which silently
 * over-counts the header row by one and would have made the very symmetry
 * bug this file exists to catch invisible.
 */
function countThCells(html: string): number {
  return (html.match(/<th[ >]/g) ?? []).length
}

const SPEC: TableSpec = {
  id: 'symmetry-filters',
  baseUrl: '/symmetry',
  columns: [
    { key: 'name', header: 'Name', sortable: true, filter: 'text', get: (r: any) => r.name },
    { key: 'status', header: 'Status', sortable: true, get: (r: any) => r.status },
    // Hidden — a synthetic alias column with no cell of its own, the same
    // shape as /webhooks' `search` column (fix-round-1, Important 6).
    {
      key: 'search',
      header: '',
      sortable: false,
      filter: 'text',
      hidden: true,
      get: (r: any) => r.name,
    },
    { key: 'actions', header: '' },
  ],
}

async function renderTableHead(tableState: TableState): Promise<string> {
  const ejs = await import('ejs')
  const source = readFileSync(TABLE_HEAD_PATH, 'utf8')
  return ejs.render(source, { tableSpec: SPEC, tableState, sortHref }, { filename: TABLE_HEAD_PATH })
}

describe('_table-head.ejs header/filter row cell-count symmetry', () => {
  it('renders the same number of <th> in the filter row as the header row', async () => {
    const html = await renderTableHead(parseTableQuery({}, SPEC))
    const filterRowStart = html.indexOf('<tr class="table__filters">')
    expect(filterRowStart).toBeGreaterThan(-1)
    const headerHtml = html.slice(0, filterRowStart)
    const filterHtml = html.slice(filterRowStart)
    const headerCount = countThCells(headerHtml)
    const filterCount = countThCells(filterHtml)
    expect(filterCount).toBeGreaterThan(0)
    expect(filterCount).toBe(headerCount)
  })

  it('excludes the hidden column from both rows — no stray control, no stray blank cell', async () => {
    const html = await renderTableHead(parseTableQuery({}, SPEC))
    // The hidden column's own filter box must not appear anywhere: proof it
    // was actually skipped, not merely undercounted by coincidence.
    expect(html).not.toContain('name="f_search"')
    // Three visible columns (name, status, actions) × two rows (header,
    // filter) = 6. A count of 8 would mean the hidden column got a blank
    // `<th></th>` in both rows instead of being skipped — symmetric, but
    // wrong, and the count-equality assertion above would not catch it.
    expect(countThCells(html)).toBe(6)
  })

  it('still renders the visible columns\' controls, so the hidden column is the only thing skipped', async () => {
    const html = await renderTableHead(parseTableQuery({}, SPEC))
    expect(html).toContain('name="f_name"')
    expect(html).toContain('Name')
    expect(html).toContain('Status')
  })
})
