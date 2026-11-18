/**
 * SignEasy list reads, rebuilt onto the documented v3 API.
 *
 * - Envelopes: "Fetch all envelopes" is `GET /rs/envelope/` whose only
 *   parameter is `include_expired`, and "Fetch all signed envelopes" is
 *   `GET /rs/envelope/signed/` with no parameters
 *   (https://docs.signeasy.com/reference/list-envelope-rs.md,
 *   https://docs.signeasy.com/reference/list-envelope-signed-documents.md).
 *   Neither pages, so both are fetched whole and paged locally.
 * - Signers and documents: `recipients[]` and `sources[]` of
 *   `GET /rs/envelope/{pending_file_id}`
 *   (https://docs.signeasy.com/reference/fetch-envelope-rs-details.md).
 * - Templates: `GET /template`, no parameters, a bare array
 *   (https://docs.signeasy.com/reference/list-templates.md).
 * - Audit trail: only a PDF certificate is documented
 *   (https://docs.signeasy.com/docs/signature-certificate.md), so the list
 *   refuses with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { SignEasyClient } from '../../../../../../src/verticals/docsign/adapters/signeasy/client'
import { SignEasyAdapter } from '../../../../../../src/verticals/docsign/adapters/signeasy'
import {
  FETCH_ENVELOPE_EXAMPLE,
  FETCH_TEMPLATE_EXAMPLE,
  LIST_ENVELOPES_EXAMPLE,
  LIST_SIGNED_ENVELOPES_EXAMPLE,
  LIST_TEMPLATES_EXAMPLE,
} from './signeasy.fixture'

const CREDS = { accessToken: 'se_token' } as Credentials
const L = 2
const N = 2 * L + 1
const ENV = '200000001'

afterEach(() => vi.restoreAllMocks())

const adapter = new SignEasyAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

interface Upstream {
  pending: unknown[]
  signed: unknown[]
  detail: Record<string, unknown>
  templates: unknown[]
}

/**
 * A fake SignEasy honouring only the documented paths and query parameters.
 * Anything else throws, so an undocumented path or key fails the test.
 */
function fakeSignEasy(up: Upstream) {
  return vi
    .spyOn(SignEasyClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      const keys = Object.keys(params ?? {})
      const allowOnly = (allowed: string[]) => {
        for (const k of keys) if (!allowed.includes(k)) throw new Error(`undocumented param ${k}`)
      }
      if (path === '/rs/envelope/') {
        allowOnly(['include_expired'])
        return { count: up.pending.length, files: up.pending } as never
      }
      if (path === '/rs/envelope/signed/') {
        allowOnly([])
        return { count: up.signed.length, files: up.signed } as never
      }
      const env = /^\/rs\/envelope\/(\d+)$/.exec(path)
      if (env) {
        allowOnly([])
        if (env[1] !== String(up.detail['id']))
          throw Object.assign(new Error('404'), { response: { status: 404 } })
        return up.detail as never
      }
      if (path === '/template') {
        allowOnly([])
        return up.templates as never
      }
      const tpl = /^\/template\/(\d+)$/.exec(path)
      if (tpl) {
        allowOnly([])
        const found = up.templates.find((t) => String((t as { id: number }).id) === tpl[1])
        if (!found) throw Object.assign(new Error('404'), { response: { status: 404 } })
        return found as never
      }
      throw new Error(`undocumented path ${path}`)
    })
}

function upstream(n = N): Upstream {
  const pendingTpl = LIST_ENVELOPES_EXAMPLE.files[0]!
  const signedTpl = LIST_SIGNED_ENVELOPES_EXAMPLE.files[0]!
  const pendingCount = Math.ceil(n / 2)
  return {
    pending: Array.from({ length: pendingCount }, (_, i) => ({ ...pendingTpl, id: 500 + i })),
    signed: Array.from({ length: n - pendingCount }, (_, i) => ({
      ...signedTpl,
      id: 900 + i,
      pending_file: { ...signedTpl.pending_file, id: 600 + i },
    })),
    detail: {
      ...FETCH_ENVELOPE_EXAMPLE,
      recipients: Array.from({ length: n }, (_, i) => ({
        ...FETCH_ENVELOPE_EXAMPLE.recipients[0]!,
        recipient_id: 700 + i,
      })),
      sources: Array.from({ length: n }, (_, i) => ({
        ...FETCH_ENVELOPE_EXAMPLE.sources[0]!,
        id: 800 + i,
      })),
    },
    templates: Array.from({ length: n }, (_, i) => ({
      ...LIST_TEMPLATES_EXAMPLE[0]!,
      id: 100 + i,
    })),
  }
}

async function walk<T extends { id: string }>(
  call: (params: QueryParams) => Promise<T[]>,
): Promise<{ seen: string[]; more: Array<boolean | undefined> }> {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L })
    const rows = await call(params)
    seen.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('SignEasyAdapter.listEnvelopes → GET /rs/envelope/ + GET /rs/envelope/signed/', () => {
  it('asks for expired envelopes too and sends no other parameter', async () => {
    const get = fakeSignEasy(upstream(2))
    await adapter.listEnvelopes(CREDS, {})
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenNthCalledWith(1, '/rs/envelope/', { include_expired: true })
    expect(get).toHaveBeenNthCalledWith(2, '/rs/envelope/signed/')
  })

  it('serves pending envelopes and the pending_file of signed ones, each once', async () => {
    fakeSignEasy(upstream())
    const rows = await adapter.listEnvelopes(CREDS, {})
    expect(rows.map((r) => r.id)).toEqual(['500', '501', '502', '600', '601'])
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent', 'sent', 'completed', 'completed'])
  })

  it('does not serve an envelope twice when both lists carry it', async () => {
    const up = upstream(2)
    ;(up.pending[0] as { id: number }).id = 600
    fakeSignEasy(up)
    const rows = await adapter.listEnvelopes(CREDS, {})
    expect(rows.map((r) => r.id)).toEqual(['600'])
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeSignEasy(upstream())
    const { seen, more } = await walk((p) => adapter.listEnvelopes(CREDS, p))
    expect(seen).toEqual(['500', '501', '502', '600', '601'])
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('serves page 2 through parseListQuery and listPage', async () => {
    fakeSignEasy(upstream())
    const params = withPageSink(
      parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing),
    )
    const rows = await adapter.listEnvelopes(CREDS, params)
    const env = listPage(rows, params, 'signeasy')
    expect(env.data.map((r) => r.id)).toEqual(['502', '600'])
    expect(env.meta.hasMore).toBe(true)
  })

  it('getEnvelope reads back an id listEnvelopes returned, on GET /rs/envelope/{id}', async () => {
    const up = upstream()
    up.detail = { ...up.detail, id: 600 }
    const get = fakeSignEasy(up)
    const [, , , fourth] = await adapter.listEnvelopes(CREDS, {})
    const got = await adapter.getEnvelope(CREDS, fourth!.id)
    expect(got.id).toBe('600')
    expect(get).toHaveBeenLastCalledWith('/rs/envelope/600')
  })
})

describe('SignEasyAdapter.listSigners → recipients[] of GET /rs/envelope/{id}', () => {
  it('reads the envelope detail with no parameters', async () => {
    const get = fakeSignEasy(upstream())
    await adapter.listSigners(CREDS, ENV, {})
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(`/rs/envelope/${ENV}`)
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeSignEasy(upstream())
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, ENV, p))
    expect(seen).toEqual(['700', '701', '702', '703', '704'])
    expect(more).toEqual([true, true, false])
  })
})

describe('SignEasyAdapter.listDocuments → sources[] of GET /rs/envelope/{id}', () => {
  it('reads the envelope detail with no parameters', async () => {
    const get = fakeSignEasy(upstream())
    const rows = await adapter.listDocuments(CREDS, ENV, {})
    expect(get).toHaveBeenCalledWith(`/rs/envelope/${ENV}`)
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4])
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeSignEasy(upstream())
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, ENV, p))
    expect(seen).toEqual(['800', '801', '802', '803', '804'])
    expect(more).toEqual([true, true, false])
  })
})

describe('SignEasyAdapter.listTemplates → GET /template', () => {
  it('sends no parameters and parses the bare array', async () => {
    const get = fakeSignEasy(upstream(2))
    const rows = await adapter.listTemplates(CREDS, { limit: 50 })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/template')
    expect(rows.map((r) => r.id)).toEqual(['100', '101'])
  })

  it('pages 1..3 return every id once with an exact hasMore', async () => {
    fakeSignEasy(upstream())
    const { seen, more } = await walk((p) => adapter.listTemplates(CREDS, p))
    expect(seen).toEqual(['100', '101', '102', '103', '104'])
    expect(more).toEqual([true, true, false])
  })

  it('throws on a body that is not the documented array instead of reporting zero', async () => {
    vi.spyOn(SignEasyClient.prototype, 'get').mockResolvedValue({ templates: [] } as never)
    await expect(adapter.listTemplates(CREDS, {})).rejects.toThrow(/documented array/)
  })

  it('propagates a 404 instead of reporting zero templates', async () => {
    vi.spyOn(SignEasyClient.prototype, 'get').mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    )
    await expect(adapter.listTemplates(CREDS, {})).rejects.toThrow('404')
  })

  it('getTemplate reads back an id listTemplates returned, on GET /template/{id}', async () => {
    const up = upstream()
    up.templates.push({ ...FETCH_TEMPLATE_EXAMPLE })
    const get = fakeSignEasy(up)
    const rows = await adapter.listTemplates(CREDS, {})
    const got = await adapter.getTemplate(CREDS, rows[rows.length - 1]!.id)
    expect(got.id).toBe('11868')
    expect(get).toHaveBeenLastCalledWith('/template/11868')
  })
})

describe('SignEasyAdapter audit trail (undocumented as JSON)', () => {
  it('listAuditTrailEntries refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const get = vi.spyOn(SignEasyClient.prototype, 'get')
    const post = vi.spyOn(SignEasyClient.prototype, 'post')
    await expect(adapter.listAuditTrailEntries(CREDS, ENV, {})).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry refuses the same way and sends nothing', async () => {
    const get = vi.spyOn(SignEasyClient.prototype, 'get')
    await expect(adapter.getAuditTrailEntry(CREDS, `${ENV}:0`)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('SignEasyAdapter OAuth scopes', () => {
  it('requests only scopes named on https://docs.signeasy.com/docs/scopes.md', () => {
    const url = new URL(adapter.getAuthUrl('st'))
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([
      'rs:read',
      'signed:read',
      'rs:update',
      'template:manage',
      'offline_access',
    ])
  })
})

describe('SignEasyClient transport', () => {
  it('uses the documented server and a bearer token', () => {
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    new SignEasyClient(CREDS)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.signeasy.com/v3',
        headers: expect.objectContaining({ Authorization: 'Bearer se_token' }),
      }),
    )
  })
})
