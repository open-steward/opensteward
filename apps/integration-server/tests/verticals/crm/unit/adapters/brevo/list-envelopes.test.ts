import { describe, it, expect, vi, afterEach } from 'vitest'
import { BrevoAdapter } from '../../../../../../src/verticals/crm/adapters/brevo/index'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

/**
 * Pins the request BrevoAdapter's list/get methods send (method, path,
 * query params) and the envelope shape each one reads back, against
 * fixtures built from the vendor spec's per-property examples:
 *
 *   - GET /companies, /crm/deals, /crm/tasks return {items: [...]}.
 *   - GET /crm/notes, /crm/pipeline/details/all return a bare array.
 *   - GET /companies paginates by `page` + `limit`; it has no `offset`.
 *
 * Mocking `fetch` (rather than the transform functions) is deliberate: a
 * regression that reverts to the wrong envelope key silently degrades a 200
 * response to `[]` — assertions on the mapped record catch that, a
 * transform-only test would not.
 */

const CREDS = { accessToken: 'brevo-key' } as unknown as Credentials

function mockFetchOnce(body: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response)
}

function calledUrl(spy: ReturnType<typeof vi.spyOn>): URL {
  const [url] = spy.mock.calls[0] as [string, RequestInit]
  return new URL(String(url))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BrevoAdapter list/get request shape and envelopes', () => {
  it('listCompanies sends GET /companies with page+limit (no offset) and reads {items}', async () => {
    const fetchSpy = mockFetchOnce({
      items: [
        {
          id: '61f4b45d90124f66d70c33d0',
          attributes: { name: 'Acme Industries', domain: 'acme.example' },
          linkedContactsIds: [12, 32],
          createdAt: '2026-01-15T09:30:00.000+01:00',
          updatedAt: '2026-02-01T14:20:00.000+01:00',
        },
      ],
    })

    const adapter = new BrevoAdapter()
    const companies = await adapter.listCompanies(CREDS, { limit: 10, page: 2 })

    const url = calledUrl(fetchSpy)
    expect(url.pathname).toBe('/v3/companies')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.has('offset')).toBe(false)

    expect(companies).toHaveLength(1)
    expect(companies[0]?.id).toBe('61f4b45d90124f66d70c33d0')
    expect(companies[0]?.name).toBe('Acme Industries')
  })

  it('a companies response under the old `companies` key comes back empty — envelope guard', async () => {
    mockFetchOnce({ companies: [{ id: '1', attributes: { name: 'Stale envelope' } }] })
    const adapter = new BrevoAdapter()
    const companies = await adapter.listCompanies(CREDS, {})
    expect(companies).toEqual([])
  })

  it('getCompany reads the raw object directly (no envelope) from GET /companies/{id}', async () => {
    const fetchSpy = mockFetchOnce({
      id: '61f4b45d90124f66d70c33d0',
      attributes: { name: 'Acme Industries', domain: 'acme.example' },
    })
    const adapter = new BrevoAdapter()
    const company = await adapter.getCompany(CREDS, '61f4b45d90124f66d70c33d0')

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/companies/61f4b45d90124f66d70c33d0')
    expect(company.name).toBe('Acme Industries')
  })

  // getDeal, getActivity and getNote follow getCompany's single-object,
  // no-envelope GET pattern. Their field mapping is covered by the transform
  // unit tests, but those run on hand-built fixtures — nothing exercised the
  // adapter's own get()+transform call, so a typo'd path or an unexpected
  // envelope would have gone unnoticed here. These pin the path AND that the
  // raw object is read directly, which is the pair that transform tests
  // cannot check.
  it('getDeal reads the raw object directly (no envelope) from GET /crm/deals/{id}', async () => {
    const fetchSpy = mockFetchOnce({
      id: 'deal-1042',
      attributes: { deal_name: 'Q1 Expansion', amount: 25000 },
    })
    const adapter = new BrevoAdapter()
    const deal = await adapter.getDeal(CREDS, 'deal-1042')

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/deals/deal-1042')
    expect(deal.id).toBe('deal-1042')
    expect(deal.title).toBe('Q1 Expansion')
  })

  it('a getDeal response wrapped in an {items} envelope does not silently map — envelope guard', async () => {
    // The list routes read {items}; the single-object routes must not. If one
    // ever starts answering with a list envelope, the id must not survive.
    mockFetchOnce({ items: [{ id: 'deal-1042', attributes: { deal_name: 'Q1 Expansion' } }] })
    const adapter = new BrevoAdapter()
    const deal = await adapter.getDeal(CREDS, 'deal-1042')
    expect(deal.id).not.toBe('deal-1042')
  })

  it('getActivity reads the raw object directly (no envelope) from GET /crm/tasks/{id}', async () => {
    const fetchSpy = mockFetchOnce({
      id: 'task-77',
      name: 'Discovery call',
      taskTypeName: 'Call',
    })
    const adapter = new BrevoAdapter()
    const activity = await adapter.getActivity(CREDS, 'task-77')

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/tasks/task-77')
    expect(activity.id).toBe('task-77')
    expect(activity.subject).toBe('Discovery call')
  })

  it('getNote reads the raw object directly (no envelope) from GET /crm/notes/{id}', async () => {
    const fetchSpy = mockFetchOnce({
      id: 'note-9',
      text: 'Follow up on Q1 expansion',
    })
    const adapter = new BrevoAdapter()
    const note = await adapter.getNote(CREDS, 'note-9')

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/notes/note-9')
    expect(note.id).toBe('note-9')
    expect(note.content).toBe('Follow up on Q1 expansion')
  })

  it('listDeals sends GET /crm/deals and reads {items}', async () => {
    const fetchSpy = mockFetchOnce({
      items: [
        {
          id: '63102c2fdfd15f658862dc76',
          attributes: { deal_name: 'Acme Q1 Expansion', amount: 5000, currency: 'EUR' },
          linkedContactsIds: [12],
          linkedCompaniesIds: ['61f4b45d90124f66d70c33d0'],
        },
      ],
    })

    const adapter = new BrevoAdapter()
    const deals = await adapter.listDeals(CREDS, { limit: 10 })

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/deals')
    expect(deals).toHaveLength(1)
    expect(deals[0]?.id).toBe('63102c2fdfd15f658862dc76')
    expect(deals[0]?.title).toBe('Acme Q1 Expansion')
    expect(deals[0]?.company_id).toBe('61f4b45d90124f66d70c33d0')
  })

  it('a deals response under the old `deals` key comes back empty — envelope guard', async () => {
    mockFetchOnce({ deals: [{ id: '1', attributes: { deal_name: 'Stale envelope' } }] })
    const adapter = new BrevoAdapter()
    const deals = await adapter.listDeals(CREDS, {})
    expect(deals).toEqual([])
  })

  it('listPipelines sends GET /crm/pipeline/details/all and reads a bare array', async () => {
    const fetchSpy = mockFetchOnce([
      {
        pipeline: 'PIPELINE1',
        pipeline_name: 'Sales Pipeline',
        stages: [{ id: 'stage1', name: 'New' }],
      },
    ])

    const adapter = new BrevoAdapter()
    const pipelines = await adapter.listPipelines(CREDS, {})

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/pipeline/details/all')
    expect(pipelines).toHaveLength(1)
    expect(pipelines[0]?.id).toBe('PIPELINE1')
    expect(pipelines[0]?.name).toBe('Sales Pipeline')
  })

  it('a pipelines response wrapped under a `pipelines` key comes back empty — envelope guard', async () => {
    // The spec returns a bare array; `res ?? []` on an object (no array-ness)
    // must not silently coerce into something with .map — this pins that a
    // wrapped response fails loudly rather than resurrecting the old key.
    mockFetchOnce({ pipelines: [{ pipeline: 'P1', pipeline_name: 'Stale envelope' }] })
    const adapter = new BrevoAdapter()
    await expect(adapter.listPipelines(CREDS, {})).rejects.toThrow()
  })

  it('listActivities sends GET /crm/tasks and reads {items}', async () => {
    const fetchSpy = mockFetchOnce({
      items: [
        {
          id: '63104e51ad2b9e4bcb970c37',
          taskTypeId: 'task_type_call',
          name: 'Discovery call',
          contactsIds: [12],
          companiesIds: ['61f4b45d90124f66d70c33d0'],
          dealsIds: ['63102c2fdfd15f658862dc76'],
          assignToId: '6329d10b0b78ba3212e8bb26',
        },
      ],
    })

    const adapter = new BrevoAdapter()
    const activities = await adapter.listActivities(CREDS, { limit: 10 })

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/tasks')
    expect(activities).toHaveLength(1)
    expect(activities[0]?.id).toBe('63104e51ad2b9e4bcb970c37')
    expect(activities[0]?.type).toBe('task_type_call')
    expect(activities[0]?.company_id).toBe('61f4b45d90124f66d70c33d0')
    expect(activities[0]?.deal_id).toBe('63102c2fdfd15f658862dc76')
    expect(activities[0]?.owner_id).toBe('6329d10b0b78ba3212e8bb26')
  })

  it('a tasks response under the old `tasks` key comes back empty — envelope guard', async () => {
    mockFetchOnce({ tasks: [{ id: '1', name: 'Stale envelope' }] })
    const adapter = new BrevoAdapter()
    const activities = await adapter.listActivities(CREDS, {})
    expect(activities).toEqual([])
  })

  it('listNotes sends GET /crm/notes and reads a bare array', async () => {
    const fetchSpy = mockFetchOnce([
      {
        id: 'note_1',
        text: 'Follow up on Q1 expansion',
        contactIds: [12],
        companyIds: ['61f4b45d90124f66d70c33d0'],
        dealIds: ['63102c2fdfd15f658862dc76'],
        authorId: { id: '6329d10b0b78ba3212e8bb26', email: 'olivia@acme.example' },
      },
    ])

    const adapter = new BrevoAdapter()
    const notes = await adapter.listNotes(CREDS, { limit: 10 })

    expect(calledUrl(fetchSpy).pathname).toBe('/v3/crm/notes')
    expect(notes).toHaveLength(1)
    expect(notes[0]?.content).toBe('Follow up on Q1 expansion')
    expect(notes[0]?.company_id).toBe('61f4b45d90124f66d70c33d0')
    expect(notes[0]?.deal_id).toBe('63102c2fdfd15f658862dc76')
    expect(notes[0]?.owner_id).toBe('6329d10b0b78ba3212e8bb26')
  })

  it('a notes response wrapped under a `notes` key comes back empty — envelope guard', async () => {
    mockFetchOnce({ notes: [{ id: '1', text: 'Stale envelope' }] })
    const adapter = new BrevoAdapter()
    await expect(adapter.listNotes(CREDS, {})).rejects.toThrow()
  })
})
