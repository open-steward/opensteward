/**
 * Jadlog list methods, against the "Documento de Integração" v2.3 (Agosto-2025):
 * https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf
 *
 * - listWarehouses/getWarehouse: "Consulta Pickup Points Diário" (pp. 24-25),
 *   "1) Retorno para todos os Pudos / Endpoint:
 *   https://www.jadlog.com.br/pickup/address/pudos?tipos=LOCKER,PUBLICO,JADLOG",
 *   response `{ "pudos": [...] }` with no paging, so the page is sliced locally.
 * - listShipments/listTrackingEvents: "Consulta do Tracking" (p. 15) is a
 *   lookup of 1-20 ids ("consulta ... Grupo de itens para consulta ... 1-20"),
 *   so both refuse with 501 before sending anything.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { JadlogAdapter } from '../../../../../../src/verticals/logistics/adapters/jadlog/index'
import { documentedPudo } from './fixtures'

const CREDS = { accessToken: 'tok' }
const PUDOS_URL = 'https://www.jadlog.com.br/pickup/address/pudos'
const L = 5
const N = 2 * L + 1

const pudoId = (i: number) => `BR${10000 + i}`

/** Honours ONLY the documented request: GET <PUDOS_URL> with `tipos`. */
function fakeJadlog(total: number) {
  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    if (url !== PUDOS_URL) throw new Error(`unexpected url ${url}`)
    const keys = Object.entries(cfg?.params ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
    if (keys.join(',') !== 'tipos') throw new Error(`400: query must be exactly tipos, got ${keys}`)
    return {
      data: {
        pudos: Array.from({ length: total }, (_, i) => documentedPudo({ pudoId: pudoId(i + 1) })),
      },
    }
  })
  const post = vi.fn()
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, put: vi.fn() } as never)
  return { get, post }
}

afterEach(() => vi.restoreAllMocks())

describe('jadlog listWarehouses (PUDO network)', () => {
  it('sends the documented GET with tipos=LOCKER,PUBLICO,JADLOG and nothing else', async () => {
    const { get } = fakeJadlog(1)
    await new JadlogAdapter().listWarehouses(CREDS, withPageSink({ page: 1, limit: L }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(PUDOS_URL)
    expect(get.mock.calls[0]![1]).toEqual({ params: { tipos: 'LOCKER,PUBLICO,JADLOG' } })
  })

  it('N = 2L+1: pages 1..3 return every id once with exact hasMore', async () => {
    fakeJadlog(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await new JadlogAdapter().listWarehouses(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      const up = readUpstreamPage(params)
      more.push(up?.hasMore)
      expect(up).toEqual(expect.objectContaining({ totalCount: N, pagedLocally: true }))
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => pudoId(i + 1)))
    expect(more).toEqual([true, true, false])
  })

  it('getWarehouse reads the id back from the network list', async () => {
    fakeJadlog(N)
    const w = await new JadlogAdapter().getWarehouse(CREDS, pudoId(7))
    expect(w.id).toBe(pudoId(7))
  })

  it('getWarehouse throws 404 for an unknown id rather than returning another PUDO', async () => {
    fakeJadlog(N)
    await expect(new JadlogAdapter().getWarehouse(CREDS, 'BR00000')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it.each([
    ['an error body with HTTP 200', { descricao: 'TOKEN INVALIDO', id: 1 }],
    ['pudos that is not an array', { pudos: null }],
  ])(
    'listWarehouses throws on %s instead of reporting an empty, complete network',
    async (_label, body) => {
      const get = vi.fn(async () => ({ data: body }))
      vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
      const params = withPageSink({ page: 1, limit: L })
      await expect(new JadlogAdapter().listWarehouses(CREDS, params)).rejects.toThrow(/pudos/)
      expect(readUpstreamPage(params)).toBeUndefined()
    },
  )

  it('getWarehouse reads its id back even when another PUDO in the network has no pudoId', async () => {
    const good = documentedPudo({ pudoId: pudoId(3) })
    const get = vi.fn(async () => ({ data: { pudos: [documentedPudo({ pudoId: null }), good] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
    const w = await new JadlogAdapter().getWarehouse(CREDS, pudoId(3))
    expect(w.id).toBe(pudoId(3))
  })
})

describe('jadlog lists with no documented list endpoint', () => {
  it.each(['listShipments', 'listTrackingEvents'] as const)(
    '%s throws 501 NOT_SUPPORTED and sends no request',
    async (method) => {
      const { get, post } = fakeJadlog(N)
      await expect(
        new JadlogAdapter()[method](CREDS, withPageSink({ page: 1, limit: L })),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    },
  )
})
