import { describe, it, expect } from 'vitest'
import { parseTableQuery, type TableSpec } from '../../src/core/views/table-controls'

const SPEC: TableSpec = {
  id: 'users-filters',
  baseUrl: '/users',
  columns: [
    { key: 'username', header: 'Username', sortable: true, filter: 'text', get: (u: any) => u.username },
    { key: 'role', header: 'Role', sortable: true, filter: { type: 'enum', options: [] }, get: (u: any) => u.role },
    { key: 'created', header: 'Created', sortable: true, get: (u: any) => u.createdAt },
    { key: 'actions', header: '', },
  ],
}

describe('parseTableQuery', () => {
  it('reads the sort key, direction and per-column filters', () => {
    const s = parseTableQuery({ sort: 'username', dir: 'desc', f_username: 'jane', page: '3' }, SPEC)
    expect(s.sort).toBe('username')
    expect(s.dir).toBe('desc')
    expect(s.filters).toEqual({ username: 'jane' })
    expect(s.page).toBe(3)
  })

  it('ignores a sort key that is not a sortable column, rather than erroring', () => {
    // A stale bookmark or a hand-edited URL must render the page, not a 400.
    expect(parseTableQuery({ sort: 'actions' }, SPEC).sort).toBeNull()
    expect(parseTableQuery({ sort: 'nonsense' }, SPEC).sort).toBeNull()
  })

  it('defaults direction to ascending and page to 1', () => {
    const s = parseTableQuery({ sort: 'role' }, SPEC)
    expect(s.dir).toBe('asc')
    expect(s.page).toBe(1)
  })

  it('survives a repeated query key instead of throwing', () => {
    // Fastify 5's parser returns an array for `?f_username=a&f_username=b`.
    // Every admin route does `request.query.x?.trim()`, which throws on an
    // array and 500s. The last value wins, as a browser form would send.
    const s = parseTableQuery({ f_username: ['a', 'b'], sort: ['role', 'username'] }, SPEC)
    expect(s.filters).toEqual({ username: 'b' })
    expect(s.sort).toBe('username')
  })

  it('drops blank and unknown filters', () => {
    const s = parseTableQuery({ f_username: '   ', f_nope: 'x', f_actions: 'y' }, SPEC)
    expect(s.filters).toEqual({})
  })

  it('clamps a nonsense page to 1', () => {
    expect(parseTableQuery({ page: '0' }, SPEC).page).toBe(1)
    expect(parseTableQuery({ page: '-4' }, SPEC).page).toBe(1)
    expect(parseTableQuery({ page: 'abc' }, SPEC).page).toBe(1)
  })

  it('honours a legacy param, and lets the explicit one win', () => {
    const spec: TableSpec = {
      ...SPEC,
      columns: SPEC.columns.map((c) =>
        c.key === 'username' ? { ...c, legacy: 'search' } : c,
      ),
    }
    expect(parseTableQuery({ search: 'acme' }, spec).filters).toEqual({ username: 'acme' })
    expect(parseTableQuery({ search: 'acme', f_username: 'beta' }, spec).filters).toEqual({
      username: 'beta',
    })
  })

  it('captures preserved params and nothing else', () => {
    const spec: TableSpec = { ...SPEC, preserve: ['tab'] }
    const s = parseTableQuery({ tab: 'configure', reveal: 'true' }, spec)
    expect(s.extra).toEqual({ tab: 'configure' })
  })

  describe('a hidden column (ColumnSpec.hidden)', () => {
    // `hidden` only tells _table-head.ejs not to render a <th> for this
    // column (fix-round-1, Important 6 — /webhooks' synthetic search-across-
    // fields alias). parseTableQuery never looks at it: a hidden column is
    // parsed exactly like a visible one, explicit param and legacy alias
    // both. Fix-round-2, fold-in: this invariant had no unit coverage at all.
    const spec: TableSpec = {
      ...SPEC,
      columns: [
        ...SPEC.columns,
        {
          key: 'search',
          header: '',
          hidden: true,
          filter: 'text',
          legacy: 'q',
          get: (u: any) => u.username,
        },
      ],
    }

    it('reads its explicit f_<key> param', () => {
      expect(parseTableQuery({ f_search: 'jane' }, spec).filters).toEqual({ search: 'jane' })
    })

    it('honours its legacy alias, and lets the explicit one win', () => {
      expect(parseTableQuery({ q: 'jane' }, spec).filters).toEqual({ search: 'jane' })
      expect(parseTableQuery({ q: 'jane', f_search: 'amy' }, spec).filters).toEqual({
        search: 'amy',
      })
    })
  })
})
