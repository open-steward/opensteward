import { describe, it, expect } from 'vitest'
import { parseTableQuery, sortHref, tableQs, type TableSpec } from '../../src/core/views/table-controls'

const SPEC: TableSpec = {
  id: 't', baseUrl: '/platforms', preserve: ['tab'],
  columns: [
    { key: 'platform', header: 'Platform', sortable: true, filter: 'text', get: (r: any) => r.slug },
    { key: 'vertical', header: 'Vertical', sortable: true, filter: 'text', get: (r: any) => r.vertical },
    { key: 'actions', header: '' },
  ],
}

describe('tableQs', () => {
  it('is empty for a bare table', () => {
    expect(tableQs(parseTableQuery({}, SPEC), SPEC)).toBe('')
  })

  it('emits sort, filters and preserved params, and never page', () => {
    // _pagination.ejs appends `&page=N` itself; a page here would produce
    // `?page=2&page=3` and silently keep the operator on the wrong page.
    const qs = tableQs(parseTableQuery({ sort: 'platform', dir: 'desc', f_vertical: 'crm', tab: 'configure', page: '4' }, SPEC), SPEC)
    expect(qs).toContain('sort=platform')
    expect(qs).toContain('dir=desc')
    expect(qs).toContain('f_vertical=crm')
    expect(qs).toContain('tab=configure')
    expect(qs).not.toContain('page')
    expect(qs.startsWith('&')).toBe(false)
  })

  it('percent-encodes values', () => {
    const qs = tableQs(parseTableQuery({ f_platform: 'a b&c=d' }, SPEC), SPEC)
    expect(qs).toBe('f_platform=a%20b%26c%3Dd')
  })

  it('omits dir when there is no sort', () => {
    expect(tableQs(parseTableQuery({ dir: 'desc' }, SPEC), SPEC)).toBe('')
  })
})

describe('sortHref', () => {
  it('sorts ascending on a column that is not sorted', () => {
    expect(sortHref(parseTableQuery({}, SPEC), SPEC, 'platform'))
      .toBe('/platforms?sort=platform&dir=asc')
  })

  it('flips direction on the active column', () => {
    const asc = parseTableQuery({ sort: 'platform', dir: 'asc' }, SPEC)
    expect(sortHref(asc, SPEC, 'platform')).toBe('/platforms?sort=platform&dir=desc')
    const desc = parseTableQuery({ sort: 'platform', dir: 'desc' }, SPEC)
    expect(sortHref(desc, SPEC, 'platform')).toBe('/platforms?sort=platform&dir=asc')
  })

  it('starts a different column ascending rather than inheriting the direction', () => {
    const desc = parseTableQuery({ sort: 'platform', dir: 'desc' }, SPEC)
    expect(sortHref(desc, SPEC, 'vertical')).toBe('/platforms?sort=vertical&dir=asc')
  })

  it('carries the submitted filters and preserved params', () => {
    const s = parseTableQuery({ f_vertical: 'crm', tab: 'configure' }, SPEC)
    const href = sortHref(s, SPEC, 'platform')
    expect(href).toContain('f_vertical=crm')
    expect(href).toContain('tab=configure')
  })

  it('drops the page, so sorting returns to the first page', () => {
    const s = parseTableQuery({ page: '7' }, SPEC)
    expect(sortHref(s, SPEC, 'platform')).not.toContain('page')
  })
})

describe('a hidden column (ColumnSpec.hidden)', () => {
  // Fix-round-2, fold-in: `pairs()` (which both tableQs and sortHref build
  // on) iterates every column with a `filter`, `hidden` or not — a hidden
  // column's active value must survive a sort click or a `_pagination.ejs`
  // page link exactly like a visible column's, or clicking either would
  // silently drop it. (The form-SUBMIT path is different — see
  // _table-filters-form.ejs and table-sort-filter.test.ts's
  // "carries a hidden column's active filter across a plain form submit".)
  const spec: TableSpec = {
    ...SPEC,
    columns: [...SPEC.columns, { key: 'search', header: '', hidden: true, filter: 'text' }],
  }

  it('tableQs carries a hidden column\'s active filter', () => {
    const qs = tableQs(parseTableQuery({ f_search: 'acme' }, spec), spec)
    expect(qs).toContain('f_search=acme')
  })

  it('sortHref carries a hidden column\'s active filter', () => {
    const s = parseTableQuery({ f_search: 'acme' }, spec)
    expect(sortHref(s, spec, 'platform')).toContain('f_search=acme')
  })
})
