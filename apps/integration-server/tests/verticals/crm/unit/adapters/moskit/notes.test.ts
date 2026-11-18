/**
 * Moskit notes: the spec has no top-level notes list, only
 *   GET /deals/{dealId}/notes        "Lista de notas dos negócios"
 *   GET /contacts/{contactId}/notes  "Lista de notas dos contatos"
 *   GET /companies/{companyId}/notes "Lista de notas das empresas"
 * and the matching .../notes/{id} reads. listNotes streams them through
 * pageByRows over pages of parents, so a caller page is cut from upstream
 * pages of uneven size; getNote reads one back from its composite id.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MoskitAdapter } from '../../../../../../src/verticals/crm/adapters/moskit/index'
import { CREDS, fakeMoskit } from './fake-moskit'

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

function note(id: number) {
  return {
    id,
    description: `note ${id}`,
    dateCreated: '2020-07-08T18:18:50.000+00:00',
    user: { id: 8 },
  }
}

/**
 * 52 deals (two parent pages of 50 and 2), 1 contact, 1 company. Notes are
 * uneven: deal 1 has 3, deal 2 none, deal 50 (the last parent of the first
 * page, so a walk that re-reads or skips the page boundary shows) has 2,
 * deal 51 has 60 (more than one notes page), deal 52 has 1, contact 7 has 2,
 * company 9 has 1.
 */
function world() {
  const deals = Array.from({ length: 52 }, (_, i) => ({ id: i + 1 }))
  const notes: Record<string, Array<ReturnType<typeof note>>> = {
    'deals/1': [note(1), note(2), note(3)],
    'deals/50': [note(50), note(51)],
    'deals/51': Array.from({ length: 60 }, (_, i) => note(100 + i)),
    'deals/52': [note(200)],
    'contacts/7': [note(300), note(301)],
    'companies/9': [note(400)],
  }
  const expected = [
    ...notes['deals/1']!.map((n) => `deal:1:${n.id}`),
    'deal:50:50',
    'deal:50:51',
    ...notes['deals/51']!.map((n) => `deal:51:${n.id}`),
    'deal:52:200',
    'contact:7:300',
    'contact:7:301',
    'company:9:400',
  ]
  return { store: { deals, contacts: [{ id: 7 }], companies: [{ id: 9 }] }, notes, expected }
}

describe('moskit listNotes', () => {
  it('serves every note once over pages 1..2L+1, with exact hasMore', async () => {
    const { store, notes, expected } = world()
    fakeMoskit(store, notes)
    const L = Math.floor(expected.length / 2)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await new MoskitAdapter().listNotes(CREDS, params)).map((n) => n.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(expected.length).toBe(2 * L + 1)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('walks every parent once when the listing total header is absent', async () => {
    const { store, notes, expected } = world()
    const { sent } = fakeMoskit(store, notes, { totalHeader: () => null })
    const out = await new MoskitAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 500 }))
    expect(out.map((n) => n.id)).toEqual(expected)
    const dealPages = sent.filter((u) => u.pathname === '/v2/deals')
    expect(dealPages.map((u) => u.searchParams.get('start'))).toEqual(['0', '50'])
  })

  it("keeps one connection's walk apart from another's", async () => {
    const { store, notes } = world()
    const other = {
      store: { deals: [{ id: 900 }], contacts: [], companies: [] },
      notes: { 'deals/900': Array.from({ length: 5 }, (_, i) => note(9000 + i)) },
    }
    fakeMoskit(store, notes, { accounts: { 'key-2': other } })
    const adapter = new MoskitAdapter()
    const mine: string[] = []
    for (const page of [1, 2]) {
      mine.push(
        ...(await adapter.listNotes(CREDS, withPageSink({ page, limit: 2 }))).map((n) => n.id),
      )
    }
    expect(mine).toEqual(['deal:1:1', 'deal:1:2', 'deal:1:3', 'deal:50:50'])
    // Page 3 continues exactly where the first connection's walk ended, which
    // is where the pager would serve its remembered rows from memory.
    const theirs = await adapter.listNotes(
      { accessToken: 'key-2' },
      withPageSink({ page: 3, limit: 2 }),
    )
    expect(theirs.map((n) => n.id)).toEqual(['deal:900:9004'])
  })

  it('links each note to its parent', async () => {
    const { store, notes } = world()
    fakeMoskit(store, notes)
    const out = await new MoskitAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 200 }))
    expect(out.find((n) => n.id === 'deal:1:1')).toMatchObject({ deal_id: '1', content: 'note 1' })
    expect(out.find((n) => n.id === 'contact:7:300')).toMatchObject({ contact_id: '7' })
    expect(out.find((n) => n.id === 'company:9:400')).toMatchObject({ company_id: '9' })
  })

  it('calls only documented nested notes paths with start and quantity', async () => {
    const { store, notes } = world()
    const { sent } = fakeMoskit(store, notes)
    await new MoskitAdapter().listNotes(CREDS, withPageSink({ page: 1, limit: 200 }))
    expect(sent.some((u) => u.pathname === '/v2/notes')).toBe(false)
    for (const u of sent) {
      expect(u.pathname).toMatch(/^\/v2\/(deals|contacts|companies)(\/\d+\/notes)?$/)
      expect([...u.searchParams.keys()].sort()).toEqual(['quantity', 'start'])
    }
    const deal51 = sent.filter((u) => u.pathname === '/v2/deals/51/notes')
    expect(deal51.map((u) => u.searchParams.get('start'))).toEqual(['0', '50'])
  })

  it('reports an empty, finished collection when there are no parents', async () => {
    fakeMoskit({ deals: [], contacts: [], companies: [] })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new MoskitAdapter().listNotes(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('moskit getNote', () => {
  it.each([
    ['deal:52:200', '/v2/deals/52/notes/200', 'deal_id'],
    ['contact:7:301', '/v2/contacts/7/notes/301', 'contact_id'],
    ['company:9:400', '/v2/companies/9/notes/400', 'company_id'],
  ] as const)('reads %s from %s', async (id, path, link) => {
    const { store, notes } = world()
    const { sent } = fakeMoskit(store, notes)
    const out = await new MoskitAdapter().getNote(CREDS, id)
    expect(out.id).toBe(id)
    expect(out[link]).toBe(id.split(':')[1])
    expect(sent.map((u) => u.pathname)).toEqual([path])
  })

  it('encodes the note id into the path', async () => {
    const { store, notes } = world()
    const { sent } = fakeMoskit(store, notes)
    await expect(new MoskitAdapter().getNote(CREDS, 'deal:52:a/b')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(sent.map((u) => u.pathname)).toEqual(['/v2/deals/52/notes/a%2Fb'])
  })

  it('refuses an id without a parent, before sending anything', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(new MoskitAdapter().getNote(CREDS, '200')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
