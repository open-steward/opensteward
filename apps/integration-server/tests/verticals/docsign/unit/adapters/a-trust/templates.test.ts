/**
 * A-Trust templates are read from the Signaturbox API.
 *
 * Spec: https://docs.a-trust.at/swagger/signaturbox.yaml
 *   servers: - url: https://testbox.a-trust.at
 *   /v2/templates: get: operationId: listTemplates, "Returns a list of templates."
 *     200 → TemplateList { templateList: TemplateSummary[] }, no parameters.
 *   ApiKeyAuth: { type: apiKey, in: header, name: x-api-key }
 *
 * Guide: https://docs.a-trust.at/apis/SignaturServer/templates
 *   "The call gets a list of all available templates for the API Key."
 *
 * The call takes no paging parameter and returns every template, so the
 * adapter pages the list locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ATrustClient } from '../../../../../../src/verticals/docsign/adapters/a-trust/client'
import { ATrustAdapter } from '../../../../../../src/verticals/docsign/adapters/a-trust'
import { TemplateSchema } from '../../../../../../src/verticals/docsign/schema/template'

const CREDS = { accessToken: 'at_key', extra: {} } as Credentials
const adapter = new ATrustAdapter({ clientId: '', clientSecret: '', redirectUri: '' })

afterEach(() => vi.restoreAllMocks())

/** A fake `GET /v2/templates` holding `n` templates. It honours no query parameter. */
function mockTemplates(n: number) {
  return vi
    .spyOn(ATrustClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path !== '/v2/templates') throw new Error(`unexpected path ${path}`)
      if (params !== undefined) throw new Error('GET /v2/templates takes no query params')
      return {
        templateList: Array.from({ length: n }, (_, i) => ({
          id: String(i + 1),
          description: `Template ${i + 1}`,
        })),
      } as never
    })
}

const L = 2
const N = 2 * L + 1
const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('ATrustAdapter.listTemplates pages GET /v2/templates locally', () => {
  it('with N = 2L+1 rows, pages 1..3 return every id once with an exact hasMore', async () => {
    const get = mockTemplates(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTemplates(CREDS, params)
      for (const r of rows) TemplateSchema.parse(r)
      seen.push(...rows.map((r) => r.externalId))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c).toEqual(['/v2/templates'])
  })

  it('page 2 is not page 1', async () => {
    mockTemplates(N)
    const p1 = await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))
    const p2 = await adapter.listTemplates(CREDS, withPageSink({ page: 2, limit: L }))
    expect(p1.map((r) => r.externalId)).toEqual(['1', '2'])
    expect(p2.map((r) => r.externalId)).toEqual(['3', '4'])
  })

  it('serves page 2 on the API path through parseListQuery and listPage', async () => {
    mockTemplates(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const rows = await adapter.listTemplates(CREDS, params)
    const env = listPage(rows, params, 'a-trust')
    expect(env.data.map((r) => r.externalId)).toEqual(['3', '4'])
    expect(env.meta.totalCount).toBe(N)
    expect(env.meta.hasMore).toBe(true)
  })

  it('an empty templateList is an empty, ended list', async () => {
    mockTemplates(0)
    const params = withPageSink({ page: 1, limit: L })
    expect(await adapter.listTemplates(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws on a 200 body without templateList instead of reporting zero templates', async () => {
    // An XML body, an HTML error page or a changed shape must not read as an
    // empty, finished list; the documented response always carries templateList.
    for (const body of ['<SignatureTemplateStyle/>', {}, { templateList: 'x' }]) {
      vi.spyOn(ATrustClient.prototype, 'get').mockResolvedValue(body as never)
      await expect(
        adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L })),
      ).rejects.toThrow(/templateList/)
      vi.restoreAllMocks()
    }
  })

  it('propagates an upstream error instead of reporting zero templates', async () => {
    vi.spyOn(ATrustClient.prototype, 'get').mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    )
    await expect(adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      'not found',
    )
  })

  it('getTemplate reads a template past the first page back by its listed id', async () => {
    const get = mockTemplates(N)
    const t = TemplateSchema.parse(await adapter.getTemplate(CREDS, String(N)))
    expect(t.externalId).toBe(String(N))
    expect(t.name).toBe(`Template ${N}`)
    for (const c of get.mock.calls) expect(c).toEqual(['/v2/templates'])
  })

  it('getTemplate on an id the list does not hold is a 404', async () => {
    mockTemplates(N)
    await expect(adapter.getTemplate(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('ATrustClient request shape', () => {
  it('targets the documented Signaturbox host and authenticates with x-api-key', () => {
    const create = vi.spyOn(axios, 'create')
    new ATrustClient(CREDS)
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://testbox.a-trust.at')
    const headers = cfg.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('at_key')
    expect(headers['Authorization']).toBeUndefined()
  })
})
