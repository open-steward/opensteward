/**
 * Melhor Envio listCarriers. GET /api/v2/me/shipment/companies
 * (https://docs.melhorenvio.com.br/reference/listar-transportadoras.md):
 * "Lista todas as transportadoras disponíveis". The operation documents no
 * query parameter (its only parameter is the required User-Agent header) and
 * its 200 schema is `"type": "array"`, so the adapter asks once, with no
 * params, and serves caller pages out of the whole array with pageLocally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MelhorEnvioAdapter } from '../../../../../../src/verticals/logistics/adapters/melhor-envio/index'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'

const CREDS = { accessToken: 'me_test_token', refreshToken: 'me_test_refresh' }
const L = 2
const N = 2 * L + 1

/** Documented item shape: { id, name, picture, services[] }. */
const carrier = (i: number) => ({
  id: i,
  name: `Carrier ${i}`,
  picture: `https://sandbox.melhorenvio.com.br/images/shipping-companies/c${i}.png`,
  services: [{ id: 100 + i, name: `Service ${i}`, type: 'normal', range: 'interstate' }],
})

function fake(body: unknown) {
  const log: Array<{
    path: string
    params: Record<string, unknown>
    headers: Record<string, string>
  }> = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: Record<string, string> }) => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) => {
      const params = Object.fromEntries(
        Object.entries(c?.params ?? {}).filter(([, v]) => v !== undefined),
      )
      log.push({ path, params, headers: cfg.headers })
      if (path !== 'me/shipment/companies') throw new Error(`unexpected path ${path}`)
      // The operation documents no query parameters at all.
      if (Object.keys(params).length)
        throw new Error(`400: undocumented params ${Object.keys(params)}`)
      return { data: body }
    }),
    post: vi.fn(async () => {
      throw new Error('listCarriers must not POST')
    }),
    delete: vi.fn(),
  })) as never)
  return log
}

const adapter = () =>
  new MelhorEnvioAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r', sandbox: true })

afterEach(() => vi.restoreAllMocks())

describe('melhor-envio listCarriers', () => {
  it('GETs me/shipment/companies with no query params and the documented User-Agent header', async () => {
    const log = fake([carrier(1)])
    await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(log).toHaveLength(1)
    expect(log[0]!.path).toBe('me/shipment/companies')
    expect(log[0]!.params).toEqual({})
    expect(log[0]!.headers['User-Agent']).toMatch(/\(.+@.+\)/)
  })

  it('N = 2L+1 carriers: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fake(Array.from({ length: N }, (_, i) => carrier(i + 1)))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const local: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      for (const r of rows) CarrierSchema.parse(r)
      seen.push(...rows.map((r) => r.id ?? '<no id>'))
      const up = readUpstreamPage(params)
      more.push(up?.hasMore)
      local.push(up?.pagedLocally)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(more).toEqual([true, true, false])
    expect(local).toEqual([true, true, true])
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fake(Array.from({ length: N }, (_, i) => carrier(i + 1)))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await adapter().listCarriers(CREDS, params), params, 'melhor-envio')
    expect(env.data.map((c) => c.id)).toEqual(['3', '4'])
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })

  it('maps the documented services onto each carrier', async () => {
    fake([carrier(7)])
    const [c] = await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(c?.services).toEqual([{ code: '107', name: 'Service 7' }])
  })

  it('refuses a body that is not the documented array instead of reporting an empty, complete list', async () => {
    fake({ data: [carrier(1)] })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter().listCarriers(CREDS, params)).rejects.toThrow(/array/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})
