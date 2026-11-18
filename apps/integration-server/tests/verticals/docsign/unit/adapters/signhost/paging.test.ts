/**
 * Signhost list paging, request shape and refusals.
 *
 * Every fake answers at the axios layer and honours ONLY the documented
 * request (https://developer.signhost.com/openapi/index.md, "API Operations"):
 * the one read of a transaction is `GET /api/transaction/{transactionId}`
 * ("Retrieve transaction details including signers, receivers, files, and
 * current status."), with no query parameters. Anything else throws.
 *
 * Authentication (https://developer.signhost.com/guide/features/authentication.md):
 * "`Application` | `APPKey {appkey token}`" and
 * "`Authorization` | `APIKey {your user token}`".
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SignhostAdapter } from '../../../../../../src/verticals/docsign/adapters/signhost'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { AuditTrailEntrySchema } from '../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { exampleTransaction, TRANSACTION_EXAMPLE } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'user-token-1', extra: { appKey: 'app-key-1' } }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50
const TX = TRANSACTION_EXAMPLE.Id

const adapter = new SignhostAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  method: string
  url: string
  params: unknown
  headers: Record<string, unknown>
  baseURL: string | undefined
}

/** Replace axios's request with `handler`, recording what each request sent. */
function fakeAxios(handler: (url: string, params: unknown) => unknown) {
  const sent: Sent[] = []
  let calls = 0
  vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    sent.push({
      method: String(cfg.method ?? 'get').toLowerCase(),
      url,
      params: cfg.params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
    })
    return { data: handler(url, cfg.params), status: 200, headers: {}, config: cfg } as never
  })
  return sent
}

/** A transaction with `n` signers, each with one activity, and `n` files. */
function bigTransaction(n: number) {
  const base = exampleTransaction()
  const proto = base.Signers[0]!
  const signers = Array.from({ length: n }, (_, i) => ({
    ...proto,
    Id: `signer-${i + 1}`,
    Email: `signer${i + 1}@example.com`,
    Activities: [
      {
        Id: `act-${i + 1}`,
        Code: 101,
        Activity: 'InvitationSent',
        CreatedDateTime: `2016-06-15T23:3${i}:00.0000000+02:00`,
      },
    ],
  }))
  const files = Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `file-${i + 1}.pdf`,
      { ...base.Files['contract.pdf'], DisplayName: `file-${i + 1}.pdf` },
    ]),
  )
  return { ...base, Signers: signers, Files: files }
}

/** GET /api/transaction/{id}: no documented query parameters. */
function fakeTransaction(tx: unknown) {
  return fakeAxios((url, params) => {
    if (url !== `/transaction/${TX}`) throw new Error(`undocumented path ${url}`)
    if (params !== undefined && Object.keys(params as object).length > 0) {
      throw new Error(`undocumented parameters ${JSON.stringify(params)}`)
    }
    return tx
  })
}

async function walk(list: (params: QueryParams) => Promise<Array<{ id: string }>>) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= 3; page++) {
    const params = withPageSink({ page, limit: L })
    seen.push(...(await list(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('SignhostAdapter auth and base URL', () => {
  it('sends the documented Application / Authorization key pair, not a bearer token', async () => {
    const sent = fakeTransaction(exampleTransaction())
    await adapter.getEnvelope(CREDS, TX)
    expect(sent[0]!.baseURL).toBe('https://api.signhost.com/api')
    expect(sent[0]!.headers['Application']).toBe('APPKey app-key-1')
    expect(sent[0]!.headers['Authorization']).toBe('APIKey user-token-1')
  })

  it('refuses credentials without the application key before sending', async () => {
    const sent = fakeTransaction(exampleTransaction())
    await expect(adapter.getEnvelope({ accessToken: 'u', extra: {} }, TX)).rejects.toThrow(
      /APPKey|appKey/,
    )
    expect(sent).toHaveLength(0)
  })

  it('stores the user token and application key from the credential fields', async () => {
    const creds = await adapter.exchangeCredentials({ userToken: 'u1', appKey: 'a1' })
    expect(creds).toEqual({ accessToken: 'u1', extra: { appKey: 'a1' } })
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['appKey', 'userToken'])
  })

  it.each([[{ userToken: 'u1' }], [{ appKey: 'a1' }], [{ appKey: '', userToken: 'u1' }]])(
    'refuses credential fields %j missing either key',
    async (fields) => {
      await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(/appKey and userToken/)
    },
  )
})

describe('SignhostAdapter documented 410 (cleaned transaction)', () => {
  /** Answers with `status`, honouring the request's validateStatus like axios's settle(). */
  function fakeStatus(status: number, data: unknown) {
    const sent: string[] = []
    vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async (config) => {
      const cfg = config as AxiosRequestConfig
      sent.push(String(cfg.url))
      const ok = cfg.validateStatus ? cfg.validateStatus(status) : status >= 200 && status < 300
      if (!ok) {
        throw Object.assign(new Error(`Request failed with status code ${status}`), {
          response: { status, data },
        })
      }
      return { data, status, headers: {}, config: cfg } as never
    })
    return sent
  }

  it('reads the partial Transaction a 410 returns instead of failing', async () => {
    const sent = fakeStatus(410, { ...exampleTransaction(), Status: 50 })
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, TX))
    expect(env.status).toBe('expired')
    const signers = await adapter.listSigners(CREDS, TX, withPageSink({ page: 1, limit: 10 }))
    expect(signers.map((s) => s.id)).toEqual(['fa95495d-6c59-48e0-962a-a4552f8d6b85'])
    expect(sent).toEqual([`/transaction/${TX}`, `/transaction/${TX}`])
  })

  it('still throws on an undocumented non-2xx such as 404', async () => {
    fakeStatus(404, { Message: 'not found' })
    await expect(adapter.getEnvelope(CREDS, TX)).rejects.toThrow(/404/)
  })
})

describe('SignhostAdapter raw carries no live URLs', () => {
  it('strips signing and download URLs from envelope, signer and document raw', async () => {
    fakeTransaction(exampleTransaction())
    const page = withPageSink({ page: 1, limit: 10 })
    const env = await adapter.getEnvelope(CREDS, TX)
    const signers = await adapter.listSigners(CREDS, TX, page)
    const docs = await adapter.listDocuments(CREDS, TX, withPageSink({ page: 1, limit: 10 }))
    for (const raw of [env.raw, ...signers.map((s) => s.raw), ...docs.map((d) => d.raw)]) {
      const json = JSON.stringify(raw)
      expect(json).not.toContain('view.signhost.com')
      expect(json).not.toContain('api.signhost.com')
    }
  })
})

describe('SignhostAdapter getEnvelope', () => {
  it('reads GET /api/transaction/{id} (singular) and parses to the canonical schema', async () => {
    const sent = fakeTransaction(exampleTransaction())
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, TX))
    expect(env.id).toBe(TX)
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([`get /transaction/${TX}`])
  })
})

describe('SignhostAdapter listSigners', () => {
  it('pages the transaction Signers locally: every id once, hasMore exact', async () => {
    const sent = fakeTransaction(bigTransaction(N))
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, TX, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `signer-${i + 1}`))
    expect(more).toEqual([true, true, false])
    expect(new Set(sent.map((s) => s.url))).toEqual(new Set([`/transaction/${TX}`]))
  })

  it('returns canonical signers of the documented example', async () => {
    fakeTransaction(exampleTransaction())
    const rows = await adapter.listSigners(CREDS, TX, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => SignerSchema.parse(r).id)).toEqual([
      'fa95495d-6c59-48e0-962a-a4552f8d6b85',
    ])
  })

  it('throws when the transaction has no Signers array', async () => {
    const { Signers: _s, ...tx } = exampleTransaction()
    fakeTransaction(tx)
    await expect(
      adapter.listSigners(CREDS, TX, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/Signers/)
  })
})

describe('SignhostAdapter listDocuments', () => {
  it('pages the transaction Files locally: every id once, hasMore exact', async () => {
    fakeTransaction(bigTransaction(N))
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, TX, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${TX}:file-${i + 1}.pdf`))
    expect(more).toEqual([true, true, false])
  })

  it('reads the documented Files map, not a documents array', async () => {
    fakeTransaction({ ...exampleTransaction(), documents: [{ id: 'fabricated' }] })
    const rows = await adapter.listDocuments(CREDS, TX, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => DocumentSchema.parse(r).externalId)).toEqual(['contract.pdf'])
    expect(rows.map((r) => r.order)).toEqual([0])
  })

  it('keeps each file order across pages', async () => {
    fakeTransaction(bigTransaction(N))
    const page2 = await adapter.listDocuments(CREDS, TX, withPageSink({ page: 2, limit: L }))
    expect(page2.map((d) => d.order)).toEqual([2, 3])
  })
})

describe('SignhostAdapter listAuditTrailEntries', () => {
  it('pages the signers Activities locally: every id once, hasMore exact', async () => {
    const sent = fakeTransaction(bigTransaction(N))
    const { seen, more } = await walk((p) => adapter.listAuditTrailEntries(CREDS, TX, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${TX}:act-${i + 1}`))
    expect(more).toEqual([true, true, false])
    expect(new Set(sent.map((s) => s.url))).toEqual(new Set([`/transaction/${TX}`]))
  })

  it('returns every documented example activity in time order', async () => {
    fakeTransaction(exampleTransaction())
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      TX,
      withPageSink({ page: 1, limit: 50 }),
    )
    const parsed = rows.map((r) => AuditTrailEntrySchema.parse(r))
    expect(parsed).toHaveLength(9)
    const times = parsed.map((r) => r.occurredAt)
    expect(times).toEqual([...times].sort())
  })

  it('interleaves two signers activities by CreatedDateTime', async () => {
    const tx = exampleTransaction()
    const proto = tx.Signers[0]!
    const act = (Id: string, at: string) => ({
      Id,
      Code: 101,
      Activity: 'InvitationSent',
      CreatedDateTime: at,
    })
    fakeTransaction({
      ...tx,
      Signers: [
        {
          ...proto,
          Id: 's-a',
          Activities: [
            act('a1', '2016-06-15T10:00:00+02:00'),
            act('a2', '2016-06-15T12:00:00+02:00'),
          ],
        },
        { ...proto, Id: 's-b', Activities: [act('b1', '2016-06-15T11:00:00+02:00')] },
      ],
    })
    const rows = await adapter.listAuditTrailEntries(
      CREDS,
      TX,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows.map((r) => r.externalId)).toEqual(['a1', 'b1', 'a2'])
  })

  it('propagates upstream errors instead of reporting an empty trail', async () => {
    fakeAxios(() => {
      throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } })
    })
    await expect(
      adapter.listAuditTrailEntries(CREDS, TX, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('reads one entry back by the id listAuditTrailEntries returned', async () => {
    fakeTransaction(exampleTransaction())
    const id = `${TX}:c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8`
    const entry = AuditTrailEntrySchema.parse(await adapter.getAuditTrailEntry(CREDS, id))
    expect(entry.id).toBe(id)
    expect(entry.eventType).toBe('viewed')
  })

  it('404s an audit id the transaction does not hold', async () => {
    fakeTransaction(exampleTransaction())
    await expect(adapter.getAuditTrailEntry(CREDS, `${TX}:no-such-activity`)).rejects.toMatchObject(
      { statusCode: 404 },
    )
  })

  it('refuses a malformed audit id before sending', async () => {
    const sent = fakeTransaction(exampleTransaction())
    await expect(adapter.getAuditTrailEntry(CREDS, 'no-separator')).rejects.toThrow(
      /<transactionId>:<activityId>/,
    )
    expect(sent).toHaveLength(0)
  })
})

describe('SignhostAdapter refusals', () => {
  it.each([
    ['listEnvelopes', () => adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))],
    ['listTemplates', () => adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))],
    ['getTemplate', () => adapter.getTemplate(CREDS, 'tpl-1')],
    ['getSigner', () => adapter.getSigner(CREDS, 'fa95495d-6c59-48e0-962a-a4552f8d6b85')],
    ['getDocument', () => adapter.getDocument(CREDS, `${TX}:contract.pdf`)],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const sent = fakeAxios(() => {
      throw new Error('no request may be sent')
    })
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(sent).toHaveLength(0)
  })
})
