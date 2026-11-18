import { describe, it, expect, vi, afterEach } from 'vitest'
import { HubSpotAdapter } from '../../../../../../src/verticals/crm/adapters/hubspot/index'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

/**
 * A HubSpot note has no parent field. It is an engagement, and it reaches a
 * contact, company or deal ONLY through the associations API — which the
 * object list endpoint does not return.
 *
 * So `listNotes` produced notes with `contact_id`, `company_id` and `deal_id`
 * all empty, while `NoteSchema` advertises all three. `company_id`/`deal_id`
 * were worse than usually-absent: `transformNote` had no parameter for either,
 * so no code path could ever populate them.
 *
 * Associations are read per PAGE rather than per note. One request per target
 * type against a full page is 3; one per note would be 300, against a rate
 * limit of 100 requests per 10 seconds.
 */

const CREDS = { accessToken: 'tok', portalId: 1 } as unknown as Credentials

interface Call {
  path: string
  body?: unknown
}

function fakeClient(
  notes: Array<{ id: string }>,
  links: Record<string, Array<{ from: string; to: number | string }>>,
  calls: Call[] = [],
) {
  return {
    list: vi.fn(async () => ({
      items: notes.map((n) => ({ id: n.id, properties: { hs_note_body: `body ${n.id}` } })),
      hasMore: false,
    })),
    batchFirstAssociations: vi.fn(async (from: string, to: string, ids: string[]) => {
      calls.push({ path: `${from}->${to}`, body: ids })
      const out = new Map<string, string>()
      for (const row of links[to] ?? []) {
        if (ids.includes(row.from)) out.set(row.from, String(row.to))
      }
      return out
    }),
  }
}

function withClient(adapter: HubSpotAdapter, client: unknown): void {
  vi.spyOn(
    adapter as unknown as { client: (c: Credentials) => unknown },
    'client',
  ).mockReturnValue(client)
}

afterEach(() => vi.restoreAllMocks())

describe('listNotes resolves linkage', () => {
  it('populates contact_id, company_id and deal_id', () => {
    const adapter = new HubSpotAdapter()
    const client = fakeClient([{ id: '1' }], {
      contacts: [{ from: '1', to: 864517141717 }],
      companies: [{ from: '1', to: 'co-5' }],
      deals: [{ from: '1', to: 'd-9' }],
    })
    withClient(adapter, client)

    return adapter.listNotes(CREDS, { limit: 10 }).then((notes) => {
      expect(notes[0]?.contact_id).toBe('864517141717')
      expect(notes[0]?.company_id).toBe('co-5')
      expect(notes[0]?.deal_id).toBe('d-9')
    })
  })

  it('coerces HubSpot’s numeric toObjectId to a string', async () => {
    // `toObjectId` comes back as a NUMBER while every id we expose is a
    // string. Without the coercion the value still appears — as a number —
    // and never matches the contact it points at.
    const adapter = new HubSpotAdapter()
    const client = fakeClient([{ id: '1' }], { contacts: [{ from: '1', to: 864517141717 }] })
    withClient(adapter, client)

    const notes = await adapter.listNotes(CREDS, { limit: 10 })
    expect(typeof notes[0]?.contact_id).toBe('string')
  })

  it('reads associations once per target type per PAGE, not per note', async () => {
    // 50 notes must still cost 3 association requests. Per-note resolution
    // would cost 150 and exhaust the rate limit on one page.
    const calls: Call[] = []
    const adapter = new HubSpotAdapter()
    const notes = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }))
    withClient(adapter, fakeClient(notes, {}, calls))

    await adapter.listNotes(CREDS, { limit: 100 })
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.path).sort()).toEqual([
      'notes->companies',
      'notes->contacts',
      'notes->deals',
    ])
  })

  it('links each note to its own records, not the first note’s', async () => {
    const adapter = new HubSpotAdapter()
    const client = fakeClient([{ id: '1' }, { id: '2' }, { id: '3' }], {
      contacts: [
        { from: '1', to: 'c-1' },
        { from: '3', to: 'c-3' },
      ],
    })
    withClient(adapter, client)

    const notes = await adapter.listNotes(CREDS, { limit: 10 })
    expect(notes.map((n) => n.contact_id)).toEqual(['c-1', undefined, 'c-3'])
  })

  it('still returns the notes when nothing is associated', async () => {
    const adapter = new HubSpotAdapter()
    withClient(adapter, fakeClient([{ id: '1' }], {}))

    const notes = await adapter.listNotes(CREDS, { limit: 10 })
    expect(notes).toHaveLength(1)
    expect(notes[0]?.content).toBe('body 1')
    expect(notes[0]?.contact_id).toBeUndefined()
  })
})

describe('a failed association read does not take the page down', () => {
  it('yields an empty map rather than throwing', async () => {
    // Exercises the REAL client, not the fake: the swallow lives inside
    // `batchFirstAssociations`, so a fake that throws would only be testing
    // itself. A missing scope for the TARGET object type fails that read
    // alone, and a note with no linkage still has a body worth returning.
    const { HubSpotClient } = await import(
      '../../../../../../src/verticals/crm/adapters/hubspot/client.js'
    )
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'missing scope',
    } as unknown as Response)

    const client = new HubSpotClient(CREDS)
    await expect(client.batchFirstAssociations('notes', 'deals', ['1'])).resolves.toEqual(new Map())
  })

  it('does not call HubSpot at all for an empty page', async () => {
    const { HubSpotClient } = await import(
      '../../../../../../src/verticals/crm/adapters/hubspot/client.js'
    )
    const f = vi.spyOn(globalThis, 'fetch')
    const client = new HubSpotClient(CREDS)
    await client.batchFirstAssociations('notes', 'contacts', [])
    expect(f).not.toHaveBeenCalled()
  })
})
