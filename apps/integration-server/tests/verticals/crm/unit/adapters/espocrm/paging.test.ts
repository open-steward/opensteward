/**
 * EspoCRM record lists: 1-based `page` + caller's `limit` → `offset` +
 * `maxSize` on GET {entityType} (docs.espocrm.com/development/api/crud/:
 * "maxSize – int – max size." / "offset – int – offset."), maxSize capped at
 * the documented 200, and the end read from `total` (-1 "there are more
 * records", -2 "there are no more records").
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { EspoCrmAdapter } from '../../../../../../src/verticals/crm/adapters/espocrm'
import { CREDS, fakeEspo, MAX, type TotalMode } from './fake-espocrm'

afterEach(() => vi.restoreAllMocks())

type Call = (a: EspoCrmAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; entity: string; call: Call }[] = [
  { name: 'listContacts', entity: 'Contact', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', entity: 'Account', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', entity: 'Opportunity', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listActivities', entity: 'Task', call: (a, p) => a.listActivities(CREDS, p) },
  { name: 'listNotes', entity: 'Note', call: (a, p) => a.listNotes(CREDS, p) },
]

function rows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${String(i + 1).padStart(4, '0')}`,
    name: `n${i + 1}`,
    createdAt: '2026-01-02 03:04:05',
  }))
}

describe.each(LISTS)('EspoCRM $name', ({ entity, call }) => {
  const L = 3
  const N = 2 * L + 1

  for (const mode of ['count', 'minus'] as TotalMode[]) {
    it(`walks ${N} rows at limit ${L}, each once, hasMore exact (total ${mode})`, async () => {
      fakeEspo({ entities: { [entity]: rows(N) } }, { total: mode })
      const adapter = new EspoCrmAdapter()
      const seen: string[] = []
      const more: (boolean | undefined)[] = []
      for (let p = 1; p <= 4; p++) {
        const params = withPageSink({ page: p, limit: L })
        seen.push(...(await call(adapter, params)).map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(rows(N).map((r) => r['id']))
      expect(more).toEqual([true, true, false, false])
    })
  }

  it('ends on a full last page from total, without a probe', async () => {
    const fake = fakeEspo({ entities: { [entity]: rows(2 * L) } })
    const params = withPageSink({ page: 2, limit: L })
    expect(await call(new EspoCrmAdapter(), params)).toHaveLength(L)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 2 * L, hasMore: false })
    expect(fake.sent).toHaveLength(1)
  })

  it('sends only offset and maxSize (no stray limit)', async () => {
    const fake = fakeEspo({ entities: { [entity]: rows(1) } })
    await call(new EspoCrmAdapter(), withPageSink({ page: 4, limit: 9 }))
    expect(Object.fromEntries(fake.sent[0]!.searchParams)).toEqual({ offset: '27', maxSize: '9' })
  })

  it('clamps a direct call past 200 and strides by the size sent', async () => {
    const fake = fakeEspo({ entities: { [entity]: rows(1) } })
    const params = withPageSink({ page: 2, limit: 500 })
    await call(new EspoCrmAdapter(), params)
    expect(Object.fromEntries(fake.sent[0]!.searchParams)).toEqual({
      offset: String(MAX),
      maxSize: String(MAX),
    })
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
  })

  it('reports no end when EspoCRM sends no total', async () => {
    fakeEspo({ entities: { [entity]: rows(2) } }, { total: 'none' })
    const params = withPageSink({ page: 1, limit: 5 })
    await call(new EspoCrmAdapter(), params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})
