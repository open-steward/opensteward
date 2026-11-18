import { describe, it, expect } from 'vitest'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../../src/core/views/table-controls'

interface Row { username: string; role: string; createdAt: string | null; n: number }

const ROWS: Row[] = [
  { username: 'zoe', role: 'viewer', createdAt: '2026-01-03T00:00:00Z', n: 2 },
  { username: 'Adam', role: 'admin', createdAt: '2026-01-01T00:00:00Z', n: 10 },
  { username: 'mia', role: 'admin', createdAt: null, n: 9 },
]

const SPEC: TableSpec = {
  id: 't', baseUrl: '/users',
  columns: [
    { key: 'username', header: 'Username', sortable: true, filter: 'text', get: (r: any) => r.username },
    { key: 'role', header: 'Role', sortable: true, filter: { type: 'enum', options: [] }, get: (r: any) => r.role },
    { key: 'created', header: 'Created', sortable: true, get: (r: any) => r.createdAt },
    { key: 'n', header: 'N', sortable: true, get: (r: any) => r.n },
  ],
}

const state = (q: Record<string, unknown>) => parseTableQuery(q, SPEC)

describe('applyTableQuery', () => {
  it('returns rows untouched when nothing is asked for', () => {
    // The default order must be byte-identical to today's: several admin-api
    // tests assert exact default ordering.
    expect(applyTableQuery(ROWS, state({}), SPEC)).toEqual(ROWS)
  })

  it('filters text case-insensitively, on a substring', () => {
    const out = applyTableQuery(ROWS, state({ f_username: 'A' }), SPEC)
    expect(out.map((r) => r.username)).toEqual(['Adam', 'mia'])
  })

  it('filters an enum column on an exact match', () => {
    // Substring matching on an enum would make `viewer` match nothing sensible
    // and `admin` match itself only by luck.
    const out = applyTableQuery(ROWS, state({ f_role: 'admin' }), SPEC)
    expect(out.map((r) => r.username)).toEqual(['Adam', 'mia'])
  })

  it('combines filters with AND', () => {
    const out = applyTableQuery(ROWS, state({ f_role: 'admin', f_username: 'mi' }), SPEC)
    expect(out.map((r) => r.username)).toEqual(['mia'])
  })

  it('sorts text case-insensitively', () => {
    const out = applyTableQuery(ROWS, state({ sort: 'username' }), SPEC)
    expect(out.map((r) => r.username)).toEqual(['Adam', 'mia', 'zoe'])
  })

  it('sorts numbers numerically, not as strings', () => {
    const out = applyTableQuery(ROWS, state({ sort: 'n' }), SPEC)
    expect(out.map((r) => r.n)).toEqual([2, 9, 10])
  })

  it('reverses on desc', () => {
    const out = applyTableQuery(ROWS, state({ sort: 'username', dir: 'desc' }), SPEC)
    expect(out.map((r) => r.username)).toEqual(['zoe', 'mia', 'Adam'])
  })

  it('puts empty values last in both directions', () => {
    // A row with no Created date is not "earliest"; it is unknown, and it
    // belongs at the end either way round.
    expect(applyTableQuery(ROWS, state({ sort: 'created' }), SPEC).map((r) => r.username))
      .toEqual(['Adam', 'zoe', 'mia'])
    expect(applyTableQuery(ROWS, state({ sort: 'created', dir: 'desc' }), SPEC).map((r) => r.username))
      .toEqual(['zoe', 'Adam', 'mia'])
  })

  it('does not mutate the array it was given', () => {
    const copy = [...ROWS]
    applyTableQuery(ROWS, state({ sort: 'username' }), SPEC)
    expect(ROWS).toEqual(copy)
  })

  it('filters rows on a hidden column exactly like a visible one', () => {
    // Fix-round-2, fold-in: `hidden` (ColumnSpec.hidden) only affects
    // _table-head.ejs's rendering — applyTableQuery has no notion of it and
    // filters a hidden column's active value the same way as any other.
    const spec: TableSpec = {
      ...SPEC,
      columns: [
        ...SPEC.columns,
        {
          key: 'combo',
          header: '',
          hidden: true,
          filter: 'text',
          get: (r: any) => `${r.username} ${r.role}`,
        },
      ],
    }
    const out = applyTableQuery(ROWS, parseTableQuery({ f_combo: 'admin' }, spec), spec)
    expect(out.map((r) => r.username)).toEqual(['Adam', 'mia'])
  })
})
