/**
 * listCarriers / getCarrier read Packeta's documented home-delivery carrier
 * list, https://docs.packeta.com/docs/home-delivery/carriers:
 *
 *   "https://pickup-point.api.packeta.com/v5/__API_KEY__/carrier/json?lang=__LANGUAGE__"
 *
 * whose "Result JSON" is a top-level array with no paging parameter. They used
 * to read the legacy `www.zasilkovna.cz/api/v4/{key}/branch.json` pickup-point
 * feed through an undocumented `data.data.pickupPoints` envelope and serve
 * pickup points as carriers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { PacketaAdapter } from '../../../../../../src/verticals/logistics/adapters/packeta'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'

// 32-char API password; the adapter derives the 16-char API key from it.
const credentials = { accessToken: 'abcdef1234567890ZZZZZZZZZZZZZZZZ' }
const API_KEY = 'abcdef1234567890'
const FEED_URL = `https://pickup-point.api.packeta.com/v5/${API_KEY}/carrier/json`

/** The documented "Result JSON" example, verbatim. */
const DOC_FEED = [
  {
    id: '80',
    name: 'AT Rakouská pošta HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    separateHouseNumber: 'false',
    customsDeclarations: 'false',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'false',
    country: 'at',
    currency: 'EUR',
    maxWeight: '30',
    labelRouting: 'C37-118-080',
    labelName: 'AT Rakouská pošta HD',
  },
  {
    id: '106',
    name: 'CZ Zásilkovna domů HD',
    available: 'true',
    pickupPoints: 'false',
    apiAllowed: 'true',
    separateHouseNumber: 'false',
    customsDeclarations: 'false',
    requiresEmail: 'true',
    requiresPhone: 'true',
    requiresSize: 'false',
    disallowsCod: 'false',
    country: 'cz',
    currency: 'CZK',
    maxWeight: '30',
    labelRouting: 'C41-***-106',
    labelName: 'CZ Zásilkovna domů HD',
  },
]

/** A feed of `n` entries shaped like the documented example. */
function feedOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({ ...DOC_FEED[0], id: String(1000 + i) }))
}

/** Fake of the documented feed: answers only its URL, with the whole array. */
function serveFeed(rows: unknown[]) {
  return vi.spyOn(axios, 'get').mockImplementation(async (url: string) => {
    if (url !== FEED_URL) throw new Error(`unexpected request: ${url}`)
    return { data: rows }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PacketaAdapter — listCarriers', () => {
  it('GETs the v5 carrier feed with the API key in the path and no other parameters', async () => {
    const get = serveFeed(DOC_FEED)
    const rows = await new PacketaAdapter().listCarriers(credentials, { page: 1, limit: 10 })

    expect(get).toHaveBeenCalledTimes(1)
    const [url, config] = get.mock.calls[0]!
    expect(url).toBe(FEED_URL)
    expect((config as { params?: unknown } | undefined)?.params).toBeUndefined()
    expect(rows.map((r) => r.id)).toEqual(['80', '106'])
    for (const row of rows) CarrierSchema.parse(row)
  })

  it('maps the carrier list, never pickup points', async () => {
    serveFeed(DOC_FEED)
    const [first] = await new PacketaAdapter().listCarriers(credentials, { page: 1, limit: 10 })
    expect(first).toMatchObject({ id: '80', code: '80', name: 'AT Rakouská pošta HD' })
  })

  it('rejects a response that is not the documented top-level array', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { data: { pickupPoints: [] } } })
    await expect(
      new PacketaAdapter().listCarriers(credentials, { page: 1, limit: 10 }),
    ).rejects.toThrow(/documented JSON array/)
  })

  it('walks 2L+1 carriers in pages of L, every id once, hasMore exact', async () => {
    const L = 3
    const feed = feedOf(2 * L + 1)
    serveFeed(feed)
    const adapter = new PacketaAdapter()

    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listCarriers(credentials, params)
      seen.push(...rows.map((r) => r.id!))
      const meta = readUpstreamPage(params)
      expect(meta?.totalCount).toBe(2 * L + 1)
      expect(meta?.pagedLocally).toBe(true)
      hasMore.push(meta!.hasMore!)
    }

    expect(seen).toEqual(feed.map((r) => r.id))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('PacketaAdapter — getCarrier', () => {
  it('reads one carrier from the same feed by its id', async () => {
    const get = serveFeed(DOC_FEED)
    const carrier = await new PacketaAdapter().getCarrier(credentials, '106')

    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe(FEED_URL)
    expect(CarrierSchema.parse(carrier)).toMatchObject({ id: '106', name: 'CZ Zásilkovna domů HD' })
  })

  it('finds a carrier past the first page of the list', async () => {
    serveFeed(feedOf(50))
    const carrier = await new PacketaAdapter().getCarrier(credentials, '1049')
    expect(carrier.id).toBe('1049')
  })

  it('answers 404 for an id the feed does not carry', async () => {
    serveFeed(DOC_FEED)
    await expect(new PacketaAdapter().getCarrier(credentials, '999')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('matches an id sent as the documented Integer type', async () => {
    // The data spec types id as Integer ("id Integer A unique id of carrier
    // branch."), while the example sends strings; both must be found.
    serveFeed(DOC_FEED.map((row) => ({ ...row, id: Number(row.id) })))
    const carrier = await new PacketaAdapter().getCarrier(credentials, '106')
    expect(CarrierSchema.parse(carrier)).toMatchObject({ id: '106', name: 'CZ Zásilkovna domů HD' })
  })
})
