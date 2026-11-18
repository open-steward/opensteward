/**
 * An enum filter must keep showing a value that is not among its options.
 *
 * The option list is built from whatever the server knows RIGHT NOW — the live
 * audit-action registry, the current tenant list. An active filter can outlive
 * that: an action retired since those rows were written, a tenant deleted
 * since the bookmark was made. Without this, the `<select>` renders with `All`
 * selected while the filter is still applied — the table shows a narrowed set
 * and the only control on screen says it is not narrowed — and the operator's
 * next submit posts an empty value, silently widening the result.
 *
 * That is the same scope-misreporting class as the tenant-picker defect, and
 * /audit had a hand-rolled version of this fix in its own view before the
 * shared filter row absorbed it (audit.ejs's old "retired action" branch).
 * Moving it into the partial gives every enum column on every table the
 * behaviour, rather than one page keeping it by accident.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTableQuery, sortHref, type TableSpec } from '../../../src/core/views/table-controls'

const TABLE_HEAD_PATH = join(__dirname, '../../../views/_table-head.ejs')

const SPEC: TableSpec = {
  id: 'enum-filters',
  baseUrl: '/enum',
  columns: [
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      filter: {
        type: 'enum',
        options: [
          { value: 'user.login', label: 'user.login' },
          { value: 'api_key.mint', label: 'api_key.mint' },
        ],
      },
    },
  ],
}

async function render(query: Record<string, string>): Promise<string> {
  const ejs = await import('ejs')
  const source = readFileSync(TABLE_HEAD_PATH, 'utf8')
  return ejs.render(
    source,
    { tableSpec: SPEC, tableState: parseTableQuery(query, SPEC), sortHref },
    { filename: TABLE_HEAD_PATH },
  )
}

/** `[value, isSelected]` for every option inside the select, in order. */
function options(html: string): Array<[string, boolean]> {
  const select = html.match(/<select\b[^>]*\bname="f_action"[^>]*>([\s\S]*?)<\/select>/)
  if (!select) return []
  return [...select[1].matchAll(/<option value="([^"]*)"([^>]*)>/g)].map((m) => [
    m[1],
    m[2].includes('selected'),
  ])
}

describe('_table-head.ejs enum filter', () => {
  it('keeps an active value the option list no longer carries, and marks it selected', async () => {
    const opts = options(await render({ f_action: 'legacy.retired' }))
    expect(opts).toContainEqual(['legacy.retired', true])
    // The real options are still offered, so the filter can be CHANGED and not
    // merely cleared — the half of the tenant-picker defect that made the
    // control useless rather than merely misleading.
    expect(opts.map(([v]) => v)).toEqual(
      expect.arrayContaining(['', 'user.login', 'api_key.mint']),
    )
  })

  it('does not duplicate a value that IS among the options', async () => {
    const opts = options(await render({ f_action: 'user.login' }))
    expect(opts.filter(([v]) => v === 'user.login')).toEqual([['user.login', true]])
  })

  it('adds nothing when no filter is active', async () => {
    expect(options(await render({})).map(([v]) => v)).toEqual(['', 'user.login', 'api_key.mint'])
  })
})
