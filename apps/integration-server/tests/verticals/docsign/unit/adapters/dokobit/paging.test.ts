/**
 * Dokobit list paging and request shape, against the Portal API
 * (https://beta.dokobit.com/api/doc; production host app.dokobit.com).
 *
 * Every fake below answers at the axios layer and honours ONLY the documented
 * request: an undocumented path or query parameter throws.
 *
 *   - GET /api/signing/list.json: "Returns list of all user signings." Its only
 *     documented parameters are the optional filters `date_from`, `date_to` and
 *     `filter`; there is no page or size, so the adapter pages locally.
 *   - GET /api/signing/{token}/status.json: "Returns all information about
 *     signing, categories, files, signers and them certificates".
 *   - Authentication: the documentation page's own client sends the key as
 *     the `access_token` query parameter (`authentication_delivery = 'query'`,
 *     `api_key_parameter = 'access_token'`).
 *   - No audit-trail or template endpoint is documented.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { DokobitAdapter } from '../../../../../../src/verticals/docsign/adapters/dokobit'
import { EnvelopeSchema } from '../../../../../../src/verticals/docsign/schema/envelope'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { SIGNING_LIST_EXAMPLE, SIGNING_STATUS_EXAMPLE } from './transform/fixtures'

const CREDS: Credentials = { accessToken: 'tok-1', extra: {} }
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50

const adapter = new DokobitAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

interface Sent {
  method: string
  url: string
  params: Record<string, unknown> | undefined
  headers: Record<string, unknown>
  baseURL: string | undefined
}

type Handler = (url: string, params: Record<string, unknown> | undefined) => unknown

function fakeAxios(handler: Handler) {
  const sent: Sent[] = []
  let calls = 0
  const spy = vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    const params = cfg.params as Record<string, unknown> | undefined
    sent.push({
      method: String(cfg.method ?? 'get'),
      url,
      params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
    })
    return { data: handler(url, params), status: 200, headers: {}, config: cfg } as never
  })
  return { sent, spy }
}

function only(params: Record<string, unknown> | undefined, allowed: string[]): void {
  for (const k of Object.keys(params ?? {})) {
    if (!allowed.includes(k)) throw new Error(`undocumented parameter ${k}`)
  }
}

const tokens = (n: number) => Array.from({ length: n }, (_, i) => `sig-${i + 1}`)
const signerTokens = (n: number) => Array.from({ length: n }, (_, i) => `signer-${i + 1}`)

const TEMPLATE_SIGNER = SIGNING_STATUS_EXAMPLE.signers[1]!
const TEMPLATE_FILE = SIGNING_STATUS_EXAMPLE.files[0]!

/**
 * The documented Portal API: list.json answers every signing at once;
 * status.json answers the documented body for a known token, with `signers`
 * and `files` sized by the test.
 */
function fakePortal(total: number, signersPer = 1, filesPer = 1) {
  const known = new Set(tokens(total))
  return fakeAxios((url, params) => {
    if (params?.['access_token'] !== 'tok-1')
      throw new Error('missing access_token query parameter')
    if (url === '/signing/list.json') {
      only(params, ['access_token', 'date_from', 'date_to', 'filter'])
      return {
        status: 'ok',
        signings: tokens(total).map((token) => ({
          ...SIGNING_LIST_EXAMPLE.signings[0]!,
          token,
        })),
      }
    }
    const m = /^\/signing\/([^/]+)\/status\.json$/.exec(url)
    if (m && known.has(m[1]!)) {
      only(params, ['access_token'])
      return {
        ...SIGNING_STATUS_EXAMPLE,
        name: `name of ${m[1]}`,
        signers: signerTokens(signersPer).map((token) => ({ ...TEMPLATE_SIGNER, token })),
        files: Array.from({ length: filesPer }, (_, i) => ({
          ...TEMPLATE_FILE,
          name: `file-${i}.pdf`,
        })),
      }
    }
    throw Object.assign(new Error(`unexpected path ${url}`), { response: { status: 404 } })
  })
}

async function walk(
  list: (params: QueryParams) => Promise<Array<{ id: string }>>,
  pages: number,
  limit = L,
) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    seen.push(...(await list(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('DokobitAdapter auth and base URL', () => {
  it('calls the Portal API host with the access_token query parameter, not a bearer header', async () => {
    const { sent } = fakePortal(1)
    await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    expect(sent[0]!.baseURL).toBe('https://app.dokobit.com/api')
    expect(sent[0]!.params).toEqual({ access_token: 'tok-1' })
    expect(sent[0]!.headers['Authorization']).toBeUndefined()
  })
})

describe('DokobitAdapter.listEnvelopes pages GET /api/signing/list.json locally', () => {
  it('pages 1..3 return every token once, in order, with an exact hasMore', async () => {
    fakePortal(N)
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p), 3)
    expect(seen).toEqual(tokens(N))
    expect(more).toEqual([true, true, false])
  })

  it('reads status.json only for the rows on the requested page', async () => {
    const { sent } = fakePortal(N)
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(['sig-3', 'sig-4'])
    expect(sent.map((s) => s.url)).toEqual([
      '/signing/list.json',
      '/signing/sig-3/status.json',
      '/signing/sig-4/status.json',
    ])
    expect(sent.every((s) => s.method === 'get')).toBe(true)
  })

  it('rows parse with EnvelopeSchema and carry the status.json name as subject', async () => {
    fakePortal(1)
    const [env] = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))
    const out = EnvelopeSchema.parse(env)
    expect(out.subject).toBe('name of sig-1')
    expect(out.metadata['isInTrashBin']).toBe('false')
  })

  it('a list.json body without a signings array throws instead of reading as empty', async () => {
    fakeAxios(() => ({ status: 'ok' }))
    await expect(adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /signings/,
    )
  })

  it('getEnvelope reads GET /api/signing/{token}/status.json', async () => {
    const { sent } = fakePortal(1)
    const env = EnvelopeSchema.parse(await adapter.getEnvelope(CREDS, 'sig-1'))
    expect(env.id).toBe('sig-1')
    expect(sent.map((s) => s.url)).toEqual(['/signing/sig-1/status.json'])
  })
})

describe('DokobitAdapter.listSigners pages status.json signers locally', () => {
  it('pages 1..3 return every signer token once with an exact hasMore', async () => {
    fakePortal(1, N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, 'sig-1', p), 3)
    expect(seen).toEqual(signerTokens(N))
    expect(more).toEqual([true, true, false])
  })

  it('sends GET /api/signing/{token}/status.json and parses with SignerSchema', async () => {
    const { sent } = fakePortal(1, 1)
    const rows = await adapter.listSigners(CREDS, 'sig-1', withPageSink({ page: 1, limit: L }))
    expect(sent.map((s) => s.url)).toEqual(['/signing/sig-1/status.json'])
    expect(SignerSchema.parse(rows[0]).envelopeId).toBe('sig-1')
  })

  it('a status.json body without a signers array throws', async () => {
    fakeAxios(() => ({ name: 'x', status: 'pending' }))
    await expect(
      adapter.listSigners(CREDS, 'sig-1', withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/signers/)
  })
})

describe('DokobitAdapter.listDocuments pages status.json files locally', () => {
  it('pages 1..3 return every file once with an exact hasMore', async () => {
    fakePortal(1, 1, N)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, 'sig-1', p), 3)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `sig-1:${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('rows parse with DocumentSchema', async () => {
    fakePortal(1, 1, 1)
    const rows = await adapter.listDocuments(CREDS, 'sig-1', withPageSink({ page: 1, limit: L }))
    expect(DocumentSchema.parse(rows[0]).name).toBe('file-0.pdf')
  })

  it('getDocument reads back an id listDocuments returned', async () => {
    fakePortal(1, 1, 3)
    const doc = await adapter.getDocument(CREDS, 'sig-1:2')
    expect(doc.id).toBe('sig-1:2')
    expect(doc.name).toBe('file-2.pdf')
  })

  it('getDocument for an index past the files array throws a 404', async () => {
    fakePortal(1, 1, 1)
    await expect(adapter.getDocument(CREDS, 'sig-1:5')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getDocument rejects a negative index with a 400 before sending anything', async () => {
    const { spy } = fakePortal(1, 1, 1)
    await expect(adapter.getDocument(CREDS, 'sig-1:-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('DokobitAdapter refuses what the Portal API cannot list', () => {
  const refusals: Array<[string, () => Promise<unknown>]> = [
    ['listAuditTrailEntries', () => adapter.listAuditTrailEntries(CREDS, 'sig-1', {})],
    ['getAuditTrailEntry', () => adapter.getAuditTrailEntry(CREDS, 'sig-1:0')],
    ['listTemplates', () => adapter.listTemplates(CREDS, {})],
    ['getTemplate', () => adapter.getTemplate(CREDS, 'tpl-1')],
  ]
  for (const [name, call] of refusals) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { spy } = fakePortal(1)
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(spy).not.toHaveBeenCalled()
    })
  }
})
