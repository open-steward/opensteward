/**
 * Helpshift single-issue read (getTicket, listMessages) and tag refusal.
 *
 * https://developers.helpshift.com/rest-api/scenarios/ — "Sample Retrieval of
 * a Single Issue (GET)": "Using the /issues/ {issue-id} request, developers
 * are able to extract a single issue by passing the issue-id into the path of
 * the request." Its sample response wraps the issue in the list envelope:
 * { "page": 1, "page-size": 100, "issues": [ { ..., "messages": [ { "body",
 * "created_at", "author": { "name", "id", "emails" } } ] } ], "total-hits": 1,
 * "total-pages": 1 }. DOC_SINGLE_ISSUE below is that sample (issue 12,
 * "Coupon Code"), verbatim. DOC_ISSUE (issue 5696) is the multi-message
 * sample from "Sample Filtering on CSAT Feedback (GET)" on the same page
 * (GET /issues?includes=["feedback"]), verbatim apart from the long `meta`
 * block; it has the same issues[] envelope and message fields.
 *
 * Message `origin` ('end-user' | 'helpshift') and `attachment.file_name` are
 * read by Helpshift's own sample
 * https://github.com/helpshift/helpshift-api/blob/master/samples/python/export_issues_to_csv.py
 *
 * The fake honours only GET /issues/{issue-id}; any other path or any query
 * parameter is an error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { listPage, readUpstreamPage, withPageSink, type Credentials } from '@opensteward/shared'
import { HelpshiftAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpshift/index'
import {
  transformMessage,
  type RawHelpshiftMessage,
} from '../../../../../../src/verticals/customer-support/adapters/helpshift/transform/message'
import {
  transformTicket,
  type RawHelpshiftIssue,
} from '../../../../../../src/verticals/customer-support/adapters/helpshift/transform/ticket'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'
import { TicketSchema } from '../../../../../../src/verticals/customer-support/schema/ticket'

const creds: Credentials = { accessToken: 'key', extra: { domain: 'lenote' } }

const DOC_SINGLE_ISSUE: RawHelpshiftIssue = {
  tags: ['b2c'],
  meta: {},
  assignee_name: null,
  app_id: 'zatori_app_20170712203132970-1370923e4e06ab6',
  title: 'Coupon Code',
  messages: [
    {
      body: 'What happened to my coupon code? It showed up in my cart but then after editing an item I can no longer enter in the code. Boooo! ',
      created_at: 1501869101896,
      author: {
        name: 'doctor.awesome',
        id: 'zatori_profile_20170804173640732-9e0ce257391bdbc',
        emails: ['doctor.awesome@starlabs.com'],
      },
    },
  ],
  assignee_id: 'unassigned',
  id: 12,
  author_name: 'doctor.awesome',
  author_email: 'doctor.awesome@starlabs.com',
  domain: 'zatori',
  state_data: { state: 'new', changed_at: 1501869101896 },
  created_at: 1501869101896,
}

const DOC_ISSUE: RawHelpshiftIssue = {
  tags: [],
  custom_fields: {},
  feedback_rating: 5,
  assignee_name: 'tushar',
  app_id: 'lenote_app_20120731055743208-b44bd7a4f9431b6',
  feedback_comment: 'great',
  title: 'hi',
  messages: [
    {
      body: 'hi',
      created_at: 1506925931287,
      author: {
        name: 'din',
        id: 'lenote_profile_20171002063209991-113d007dcbabf33',
        emails: ['abc@gmaim.com'],
      },
    },
    {
      body: 'Please look into this on priority',
      created_at: 1506925931514,
      author: {
        name: 'Automations',
        id: 'lenote_profile_20170125141056623-496ec4dd6e89afc',
        emails: ['queue-bot@lenote.mail.helpshift.com'],
      },
    },
    {
      body: 'llk',
      created_at: 1506925991404,
      author: {
        name: 'tushar',
        id: 'lenote_profile_20120828025138536-b5896304ca06ecc',
        emails: ['tmakhija@gmail.com', 'rubyjabbal@gmail.com'],
      },
    },
    {
      body: 'ok',
      created_at: 1506926001346,
      author: {
        name: 'din',
        id: 'lenote_profile_20171002063209991-113d007dcbabf33',
        emails: ['abc@gmaim.com'],
      },
    },
    {
      body: 'wf',
      created_at: 1506926204825,
      author: {
        name: 'tushar',
        id: 'lenote_profile_20120828025138536-b5896304ca06ecc',
        emails: ['tmakhija@gmail.com', 'rubyjabbal@gmail.com'],
      },
    },
    {
      body: 'Accepted the solution',
      created_at: 1506926210060,
      author: {
        name: 'din',
        id: 'lenote_profile_20171002063209991-113d007dcbabf33',
        emails: ['abc@gmaim.com'],
      },
    },
  ],
  assignee_id: 'lenote_profile_20120828025138536-b5896304ca06ecc',
  id: 5696,
  author_name: 'din',
  author_email: 'abc@gmaim.com',
  domain: 'lenote',
  state_data: { state: 'resolved', changed_at: 1506926210060 },
  created_at: 1506925931287,
}

const envelope = (issue: RawHelpshiftIssue | undefined) => ({
  page: 1,
  'page-size': 100,
  issues: issue ? [issue] : [],
  'total-hits': issue ? 1 : 0,
  'total-pages': 1,
})

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}
let calls: Call[] = []
let issueById: Record<string, RawHelpshiftIssue> = {}

beforeEach(() => {
  calls = []
  issueById = { '5696': DOC_ISSUE, '12': DOC_SINGLE_ISSUE }
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          calls.push({ path, params: cfg?.params })
          if (cfg?.params && Object.keys(cfg.params).length > 0)
            throw new Error('undocumented query params')
          const m = /^\/issues\/([^/]+)$/.exec(path)
          if (!m) throw new Error(`undocumented path ${path}`)
          return { data: envelope(issueById[decodeURIComponent(m[1]!)]) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('helpshift transformMessage (documented sample)', () => {
  it('parses every documented message with MessageSchema', () => {
    const out = (DOC_ISSUE.messages as RawHelpshiftMessage[]).map((m) =>
      MessageSchema.parse(transformMessage(m, '5696')),
    )
    expect(out[0]).toMatchObject({
      id: '5696:1506925931287:lenote_profile_20171002063209991-113d007dcbabf33',
      ticketId: '5696',
      authorId: 'lenote_profile_20171002063209991-113d007dcbabf33',
      body: 'hi',
      createdAt: new Date(1506925931287).toISOString(),
      platform: 'helpshift',
      metadata: { authorName: 'din' },
    })
    expect(new Set(out.map((m) => m.id)).size).toBe(6)
  })

  it('without a documented origin the author type is unknown', () => {
    const msg = MessageSchema.parse(
      transformMessage(DOC_ISSUE.messages![0] as RawHelpshiftMessage, '5696'),
    )
    expect(msg.authorType).toBe('unknown')
    expect(msg.type).toBe('unknown')
  })

  it("maps the sample script's origins: end-user is a contact; helpshift (agent or automation) stays unknown", () => {
    const base = DOC_ISSUE.messages![0] as RawHelpshiftMessage
    expect(transformMessage({ ...base, origin: 'end-user' }, '5696').authorType).toBe('contact')
    const out = transformMessage({ ...base, origin: 'helpshift' }, '5696')
    expect(out.authorType).toBe('unknown')
    expect(out.metadata['origin']).toBe('helpshift')
  })

  it('counts a documented attachment', () => {
    const base = DOC_ISSUE.messages![0] as RawHelpshiftMessage
    expect(transformMessage(base, '5696').attachmentCount).toBe(0)
    expect(
      transformMessage({ ...base, attachment: { file_name: 'a.png' } }, '5696').attachmentCount,
    ).toBe(1)
  })

  it('throws rather than inventing a timestamp or author', () => {
    const base = DOC_ISSUE.messages![0] as RawHelpshiftMessage
    expect(() => transformMessage({ ...base, created_at: undefined }, '5696')).toThrow(/created_at/)
    expect(() => transformMessage({ ...base, author: { name: 'x' } }, '5696')).toThrow(/author\.id/)
  })
})

describe('helpshift transformTicket (documented sample)', () => {
  it('parses with TicketSchema and reads the documented assignee_id', () => {
    const t = TicketSchema.parse(transformTicket(DOC_ISSUE))
    expect(t).toMatchObject({
      id: '5696',
      subject: 'hi',
      status: 'resolved',
      requesterId: 'abc@gmaim.com',
      assigneeId: 'lenote_profile_20120828025138536-b5896304ca06ecc',
      createdAt: new Date(1506925931287).toISOString(),
    })
    expect(t.metadata['assigneeName']).toBe('tushar')
  })

  it('the documented "unassigned" sentinel is no assignee', () => {
    expect(transformTicket({ ...DOC_ISSUE, assignee_id: 'unassigned' }).assigneeId).toBeUndefined()
  })

  it('throws rather than inventing a creation time', () => {
    expect(() => transformTicket({ ...DOC_ISSUE, created_at: undefined })).toThrow(/created_at/)
  })
})

describe('helpshift getTicket', () => {
  const adapter = new HelpshiftAdapter({})

  it('reads the issue out of the documented issues envelope', async () => {
    const t = await adapter.getTicket(creds, '5696')
    expect(calls).toEqual([{ path: '/issues/5696', params: undefined }])
    expect(TicketSchema.parse(t).id).toBe('5696')
  })

  it('reads the documented single-issue sample (issue 12, "unassigned")', async () => {
    const t = TicketSchema.parse(await adapter.getTicket(creds, '12'))
    expect(calls).toEqual([{ path: '/issues/12', params: undefined }])
    expect(t).toMatchObject({
      id: '12',
      subject: 'Coupon Code',
      status: 'open',
      requesterId: 'doctor.awesome@starlabs.com',
      tagIds: ['b2c'],
    })
    expect(t.assigneeId).toBeUndefined()
  })

  it('encodes the issue id into a single path segment', async () => {
    issueById['a/b?c'] = { ...DOC_SINGLE_ISSUE, id: 'a/b?c' }
    await adapter.getTicket(creds, 'a/b?c')
    expect(calls).toEqual([{ path: '/issues/a%2Fb%3Fc', params: undefined }])
  })

  it('an empty envelope is not found', async () => {
    await expect(adapter.getTicket(creds, '1')).rejects.toThrow(/not found/)
  })
})

describe('helpshift listMessages', () => {
  const adapter = new HelpshiftAdapter({})

  it('serves the documented issue messages from GET /issues/{issue-id}', async () => {
    const rows = await adapter.listMessages(creds, '5696', withPageSink({ page: 1, limit: 100 }))
    expect(calls).toEqual([{ path: '/issues/5696', params: undefined }])
    expect(rows.map((r) => r.body)).toEqual([
      'hi',
      'Please look into this on priority',
      'llk',
      'ok',
      'wf',
      'Accepted the solution',
    ])
    for (const r of rows) MessageSchema.parse(r)
  })

  it('serves the documented single-issue sample message (issue 12)', async () => {
    const rows = await adapter.listMessages(creds, '12', withPageSink({ page: 1, limit: 100 }))
    expect(calls).toEqual([{ path: '/issues/12', params: undefined }])
    expect(rows).toHaveLength(1)
    expect(MessageSchema.parse(rows[0])).toMatchObject({
      id: '12:1501869101896:zatori_profile_20170804173640732-9e0ce257391bdbc',
      ticketId: '12',
      authorId: 'zatori_profile_20170804173640732-9e0ce257391bdbc',
    })
  })

  it('pages 2L+1 messages locally: every id once, hasMore exact', async () => {
    const L = 3
    const n = 2 * L + 1
    issueById['7'] = {
      ...DOC_ISSUE,
      id: 7,
      messages: Array.from({ length: n }, (_, i) => ({
        body: `m${i + 1}`,
        created_at: 1506925931287 + i,
        author: { name: 'din', id: 'p1', emails: ['abc@gmaim.com'] },
      })),
    }
    const ids: string[] = []
    const reported: (boolean | undefined)[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listMessages(creds, '7', params)
      ids.push(...rows.map((r) => r.id))
      reported.push(readUpstreamPage(params)?.hasMore)
      hasMore.push(listPage(rows, params, 'helpshift').meta.hasMore ?? undefined)
    }
    expect(ids).toHaveLength(n)
    expect(new Set(ids).size).toBe(n)
    expect(reported).toEqual([true, true, false])
    expect(hasMore).toEqual([true, true, false])
  })

  it('an issue the envelope does not return is not found', async () => {
    await expect(
      adapter.listMessages(creds, '1', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/not found/)
  })
})

describe('helpshift tags', () => {
  const adapter = new HelpshiftAdapter({})

  it('listTags refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      adapter.listTags(creds, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('getTag refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.getTag(creds, 'b2c')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})
