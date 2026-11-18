/**
 * movidesk listMessages / getTicket.
 *
 * Movidesk has no action endpoint: a ticket's actions ride on the ticket
 * itself ("actions — Lista com as ações do ticket"), and the ticket reference
 * fetches ONE ticket as `GET /tickets` with the id as a query parameter
 * ("Obtendo um único ticket — GET: /tickets — Parâmetros: id / protocol,
 * token", example `/tickets?token=…&id=1`), returning an object
 * ("Demais colunas no formato do layout acima"). There is no `/tickets/{id}`
 * path in the reference. Source:
 * https://atendimento.movidesk.com/kb/article/256/movidesk-ticket-api
 *
 * The fake below honours ONLY that documented form: GET /tickets with `id`
 * (plus the token) returns the ticket object; any other path 404s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { MovideskAdapter } from '../../../../../../src/verticals/customer-support/adapters/movidesk/index'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'

const creds: Credentials = { accessToken: 'tok' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let tickets: Record<string, unknown> = {}

const DOCUMENTED_SINGLE_TICKET_PARAMS = new Set(['token', 'id', 'protocol', 'includeDeletedItems'])

beforeEach(() => {
  calls = []
  tickets = {}
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          const undocumented = Object.keys(params).filter(
            (k) => !DOCUMENTED_SINGLE_TICKET_PARAMS.has(k),
          )
          if (path !== '/tickets' || params['id'] === undefined || undocumented.length > 0) {
            throw Object.assign(
              new Error(`fake: undocumented request ${path} ${undocumented.join(',')}`),
              {
                response: { status: 404 },
              },
            )
          }
          const key = String(params['id'])
          if (!(key in tickets))
            throw Object.assign(new Error('not found'), { response: { status: 404 } })
          return { data: tickets[key] }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** An action shaped like the documented `ticket.actions[n]` layout. */
const action = (id: number) => ({
  id,
  type: id % 2 === 0 ? 2 : 1,
  origin: 9,
  description: `action ${id}`,
  status: 'Status',
  justification: 'Justificativa',
  createdDate: '2016-11-21T14:25:07.1920886',
  createdBy: {
    id: 'CodRefDoGeradorDaAção',
    personType: 1,
    profileType: 1,
    businessName: 'Nome do gerador da ação',
    email: 'email@gerador.com',
    phone: '(47) 99999-9999',
  },
  isDeleted: false,
  attachments: [],
})

function seedTicket(id: number, actionCount: number) {
  tickets[String(id)] = {
    id,
    protocol: 'MOVI202109000001',
    type: 2,
    subject: 'Assunto',
    status: 'Novo',
    baseStatus: 'New',
    origin: 9,
    createdDate: '2016-11-18T14:25:07.1920886',
    lastUpdate: '2016-11-21T14:25:07.1920886',
    clients: [
      { id: 'CodRefDoCliente', personType: 2, profileType: 2, businessName: 'Nome do cliente' },
    ],
    actions: Array.from({ length: actionCount }, (_, i) => action(i + 1)),
  }
}

describe('movidesk listMessages (actions of GET /tickets?id=)', () => {
  it('requests the documented single-ticket form: GET /tickets with id and the token only', async () => {
    seedTicket(7, 1)
    await new MovideskAdapter().listMessages(creds, '7', { page: 1, limit: 10 })
    expect(calls).toEqual([{ path: '/tickets', params: { token: 'tok', id: '7' } }])
  })

  it('maps every action through MessageSchema, scoped to the ticket', async () => {
    seedTicket(7, 2)
    const rows = await new MovideskAdapter().listMessages(creds, '7', { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['7:1', '7:2'])
    for (const r of rows) {
      expect(() => MessageSchema.parse(r)).not.toThrow()
      expect(r.ticketId).toBe('7')
    }
    expect(rows.map((r) => r.type)).toEqual(['internal', 'public'])
  })

  const L = 3
  it('pages the whole action list locally: 2L+1 actions, every id once, hasMore exact', async () => {
    seedTicket(9, 2 * L + 1)
    const adapter = new MovideskAdapter()
    const seen: string[] = []
    const hasMore: Array<boolean | null | undefined> = []
    for (const page of [1, 2, 3]) {
      const params: QueryParams = withPageSink({ page, limit: L })
      const rows = await adapter.listMessages(creds, '9', params)
      seen.push(...rows.map((r) => r.id))
      const up = readUpstreamPage(params)
      hasMore.push(up?.hasMore)
      expect(up?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(['9:1', '9:2', '9:3', '9:4', '9:5', '9:6', '9:7'])
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('an unknown ticket propagates the upstream error rather than an empty list', async () => {
    await expect(
      new MovideskAdapter().listMessages(creds, '404', { page: 1, limit: 10 }),
    ).rejects.toThrow()
  })
})

describe('movidesk single-ticket read answering with no ticket object', () => {
  const bodies: Array<[string, unknown]> = [
    ['an array', []],
    ['an empty body', ''],
    ['null', null],
  ]
  for (const [label, body] of bodies) {
    it(`treats ${label} as a 404 for listMessages and getTicket`, async () => {
      tickets['5'] = body
      const adapter = new MovideskAdapter()
      await expect(adapter.listMessages(creds, '5', { page: 1, limit: 10 })).rejects.toMatchObject({
        statusCode: 404,
      })
      await expect(adapter.getTicket(creds, '5')).rejects.toMatchObject({ statusCode: 404 })
    })
  }
})

describe('movidesk getTicket (GET /tickets?id=)', () => {
  it('requests GET /tickets with id and the token only, and parses the ticket', async () => {
    seedTicket(7, 1)
    const t = await new MovideskAdapter().getTicket(creds, '7')
    expect(calls).toEqual([{ path: '/tickets', params: { token: 'tok', id: '7' } }])
    expect(t.id).toBe('7')
    expect(() => TicketSchema.parse(t)).not.toThrow()
  })
})
