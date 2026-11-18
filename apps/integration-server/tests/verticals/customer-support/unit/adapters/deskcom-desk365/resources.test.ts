/**
 * Desk365 contacts, conversations, agents and groups.
 *
 * Source: the Desk365 v3 OpenAPI spec
 * (https://apps.desk365.io/apis/v3/api-docs?group=v3, loaded by
 * https://apps.desk365.io/apis/api-docs.html?version=v3).
 *
 *   - GET /v3/contacts, `offset`: "Get next 30 contacts from offset value."
 *     Response ContactList `{ count, content }`.
 *   - GET /v3/contacts/details, `primary_email`: "The primary email address of the contact."
 *   - GET /v3/tickets/conversations, `ticket_number` (required) and the
 *     include_* flags ("1 - include ..., 0 - do not include ..."). No paging
 *     parameter. Response TicketConversationsModel `{ count, ..., conversations }`.
 *   - No agents or groups path exists in the spec.
 *
 * The fakes honour only those documented parameters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { DeskcomDesk365Adapter } from '../../../../../../src/verticals/customer-support/adapters/deskcom-desk365/index'
import { ContactSchema } from '../../../../../../src/verticals/customer-support/schema/contact'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'

const creds: Credentials = { accessToken: 'key', extra: { tenantSubdomain: 'acme' } }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  handler = () => {
    throw new Error('no handler')
  }
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new DeskcomDesk365Adapter()
const range = (n: number, prefix = 'c') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}@example.com`)

/** GET /v3/contacts: fixed pages of 30 from a row `offset`; nothing else honoured. */
function contacts(n: number) {
  return (path: string, params: Record<string, unknown>) => {
    if (path !== '/contacts') throw new Error(`unexpected path ${path}`)
    const offset = Number(params['offset'] ?? 0)
    return {
      count: n,
      content: range(n)
        .slice(offset, offset + 30)
        .map((email) => ({ name: email.split('@')[0], primary_email: email })),
    }
  }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'deskcom-desk365').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

describe('deskcom-desk365 listContacts', () => {
  const run = (p: QueryParams) => adapter.listContacts(creds, p)

  it('sends only the documented offset to GET /contacts and reads `content`', async () => {
    handler = contacts(5)
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([{ path: '/contacts', params: { offset: 0 } }])
    expect(rows.map((r) => r.id)).toEqual(range(5))
    for (const r of rows) ContactSchema.parse(r)
  })

  it('serves every contact once across pages of 2L+1 rows (L = 20, uneven upstream pages of 30)', async () => {
    const L = 20
    handler = contacts(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(new Set(ids).size).toBe(ids.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every contact once when a caller page spans several upstream pages (L = 45)', async () => {
    const L = 45
    handler = contacts(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['offset'])).toEqual(expect.arrayContaining([0, 30, 60, 90]))
  })

  it('page 2 asks for the row offset it needs', async () => {
    handler = contacts(100)
    const rows = await run(withPageSink({ page: 2, limit: 30 }))
    expect(rows.map((r) => r.id)).toEqual(range(60).slice(30))
    expect(calls.map((c) => c.params['offset'])).toContain(30)
    expect(calls.every((c) => Object.keys(c.params).every((k) => k === 'offset'))).toBe(true)
  })

  it('an exact multiple of 30 ends on the empty page after it', async () => {
    handler = contacts(60)
    const { ids, hasMore } = await walk(run, 30)
    expect(ids).toEqual(range(60))
    expect(hasMore).toEqual([true, false, false])
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = contacts(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'deskcom-desk365')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('deskcom-desk365 getContact', () => {
  it('reads GET /contacts/details by primary_email', async () => {
    handler = (path, params) => {
      if (path !== '/contacts/details') throw new Error(`unexpected path ${path}`)
      return { name: 'Joe', primary_email: params['primary_email'], company_name: 'Contoso' }
    }
    const out = await adapter.getContact(creds, 'contact@contoso.com')
    expect(calls).toEqual([
      { path: '/contacts/details', params: { primary_email: 'contact@contoso.com' } },
    ])
    expect(out.id).toBe('contact@contoso.com')
    ContactSchema.parse(out)
  })
})

describe('deskcom-desk365 listMessages', () => {
  const conv = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    ticket_number: 10,
    created_by: 'test@example.com',
    sender_type: 'agent',
    body_text: `m${id}`,
    created_on: '2023-10-01 12:34:56',
    ...extra,
  })
  // Ids 3 and 5 are private notes; the rest are replies, public notes or forwards.
  const PRIVATE = new Set([3, 5])
  const TOTAL = 7

  /** GET /v3/tickets/conversations: honours ticket_number and the include_* flags only. */
  function conversations(path: string, params: Record<string, unknown>) {
    if (path !== '/tickets/conversations') throw new Error(`unexpected path ${path}`)
    if (params['ticket_number'] !== '10') throw new Error('ticket_number is required')
    const privateOnly =
      params['include_contact_replies'] === '0' &&
      params['include_agent_replies'] === '0' &&
      params['include_public_notes'] === '0' &&
      params['include_forward_messages'] === '0'
    const all = Array.from({ length: TOTAL }, (_, i) => i + 1)
    const rows = privateOnly ? all.filter((id) => PRIVATE.has(id)) : all
    return { count: rows.length, conversations: rows.map((id) => conv(id)) }
  }

  it('asks the documented path with ticket_number, then only private notes', async () => {
    handler = conversations
    await adapter.listMessages(creds, '10', withPageSink({ page: 1, limit: 50 }))
    expect(calls).toEqual([
      { path: '/tickets/conversations', params: { ticket_number: '10' } },
      {
        path: '/tickets/conversations',
        params: {
          ticket_number: '10',
          include_contact_replies: '0',
          include_agent_replies: '0',
          include_public_notes: '0',
          include_forward_messages: '0',
        },
      },
    ])
  })

  it('marks private notes internal and everything else public', async () => {
    handler = conversations
    const rows = await adapter.listMessages(creds, '10', withPageSink({ page: 1, limit: 50 }))
    expect(rows.map((r) => [r.id, r.type])).toEqual([
      ['1', 'public'],
      ['2', 'public'],
      ['3', 'internal'],
      ['4', 'public'],
      ['5', 'internal'],
      ['6', 'public'],
      ['7', 'public'],
    ])
    for (const r of rows) MessageSchema.parse(r)
    expect(rows.every((r) => r.ticketId === '10')).toBe(true)
  })

  it('serves every message once across pages of 2L+1 rows (L = 3)', async () => {
    handler = conversations
    const { ids, hasMore } = await walk((p) => adapter.listMessages(creds, '10', p), 3)
    expect(ids).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('deskcom-desk365 agents and groups', () => {
  const refused = [
    ['listUsers', () => adapter.listUsers(creds, withPageSink({ page: 1, limit: 20 }))],
    ['getUser', () => adapter.getUser(creds, 'a@example.com')],
    ['listTeams', () => adapter.listTeams(creds, withPageSink({ page: 1, limit: 20 }))],
    ['getTeam', () => adapter.getTeam(creds, 'Support')],
  ] as const

  for (const [name, call] of refused) {
    it(`${name} refuses with 501 NOT_SUPPORTED and sends no request`, async () => {
      handler = () => ({})
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(calls).toEqual([])
    })
  }
})
