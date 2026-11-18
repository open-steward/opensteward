/**
 * Deck Commerce stock levels, against the vendor's own published client
 * (github.com/DeckCommerce/magento): the inventory API is api/PimInventoryLookup,
 * a lookup of the SKUs named in `{"Items": [{"InventoryFeedName", "SKU"}]}` with
 * no paging fields. So the collection cannot be listed, and one SKU can be read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { DeckCommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/deck-commerce/index'
import {
  buildToken,
  deckTimestamp,
} from '../../../../../../src/verticals/inventory/adapters/deck-commerce/client'
import { StockLevelSchema } from '../../../../../../src/verticals/inventory/schema/stock-level'

const CREDS = {
  accessToken: 'site-key',
  extra: { siteCode: 'ACME', apiBaseUrl: 'https://acme.example.com' },
}

/** Items as the vendor's InventoryCheck.php reads them: DeckSKU, TotalAvailableQuantity, Details[]. */
const CATALOG: Record<string, unknown> = {
  'SKU-1': {
    DeckSKU: 'SKU-1',
    TotalAvailableQuantity: 70,
    Details: [
      { WarehouseCode: 'WH1', TotalQuantity: 50, InventoryAllocation: 8 },
      { WarehouseCode: 'WH2', TotalQuantity: 30, InventoryAllocation: 2 },
    ],
  },
  'SKU-2': { DeckSKU: 'SKU-2', TotalAvailableQuantity: 12 },
}

/** A fake that honours only the documented request: the SKUs named in Items. */
function fakeLookup() {
  return vi.spyOn(axios, 'post').mockImplementation(async (_url: string, body: unknown) => {
    const items = ((body as { Items?: Array<{ SKU?: string }> }).Items ?? [])
      .map((i) => CATALOG[i.SKU ?? ''])
      .filter((i) => i !== undefined)
    return { data: { Items: items } }
  })
}

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('deck-commerce listStockLevels', () => {
  it.each([{}, { page: 1, limit: 50 }, { page: 2, limit: 1 }])(
    'refuses with 501 NOT_SUPPORTED and sends no request (%o)',
    async (params) => {
      const post = fakeLookup()
      const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
      await expect(adapter.listStockLevels(CREDS, params)).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Deck Commerce cannot list stock levels: /),
      })
      expect(post).not.toHaveBeenCalled()
    },
  )
})

describe('deck-commerce getStockLevel', () => {
  it('posts the vendor request to <Web API Url>/api/piminventorylookup, signed as the vendor signs', async () => {
    const post = fakeLookup()
    const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
    await adapter.getStockLevel(CREDS, 'SKU-1:WH1')
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body, config] = post.mock.calls[0]! as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ]
    expect(url).toBe('https://acme.example.com/api/piminventorylookup')
    expect(body['Items']).toEqual([{ InventoryFeedName: 'FEED', SKU: 'SKU-1' }])
    expect(body['SiteCode']).toBe('ACME')
    const ts = body['TimestampUTC'] as string
    expect(ts).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} (AM|PM)$/)
    const token = buildToken('api/piminventorylookup', ts, 'site-key')
    expect(body['VerificationKey']).toBe(token)
    expect(config.headers['Authorization']).toBe(token)
    expect(config.headers['apiVersion']).toBe('5')
    expect(Object.keys(body).sort()).toEqual([
      'Items',
      'SiteCode',
      'TimestampUTC',
      'VerificationKey',
    ])
  })

  it('signs the lower-cased API name', () => {
    expect(buildToken('api/PimInventoryLookup', '9/5/2026 13:04 PM', 'k')).toBe(
      buildToken('api/piminventorylookup', '9/5/2026 13:04 PM', 'k'),
    )
  })

  it('uses a configured inventory API name, lower-cased in the URL', async () => {
    const post = fakeLookup()
    const adapter = new DeckCommerceAdapter({
      inventoryFeedName: 'FEED',
      inventoryCheckApiName: 'api/CustomLookup',
    })
    await adapter.getStockLevel(CREDS, 'SKU-1')
    expect(post.mock.calls[0]![0]).toBe('https://acme.example.com/api/customlookup')
  })

  it('falls back to the vendor default API name when the setting is blank', async () => {
    const post = fakeLookup()
    const adapter = new DeckCommerceAdapter({
      inventoryFeedName: 'FEED',
      inventoryCheckApiName: ' ',
    })
    await adapter.getStockLevel(CREDS, 'SKU-1')
    expect(post.mock.calls[0]![0]).toBe('https://acme.example.com/api/piminventorylookup')
  })

  it.each([{ inventoryCheckApiName: 'api/Pim Lookup' }, { inventoryCheckApiName: 42 }])(
    'refuses with 501 and sends nothing for an invalid inventory API name (%o)',
    async (config) => {
      const post = fakeLookup()
      const adapter = new DeckCommerceAdapter({
        inventoryFeedName: 'FEED',
        ...(config as { inventoryCheckApiName?: string }),
      })
      await expect(adapter.getStockLevel(CREDS, 'SKU-1')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining('inventoryCheckApiName'),
      })
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('returns the warehouse row named by the id, schema-valid', async () => {
    fakeLookup()
    const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
    const level = StockLevelSchema.parse(await adapter.getStockLevel(CREDS, 'SKU-1:WH2'))
    expect(level).toMatchObject({
      id: 'SKU-1:WH2',
      productId: 'SKU-1',
      locationId: 'WH2',
      quantityOnHand: 30,
      quantityCommitted: 2,
      quantityAvailable: 28,
    })
  })

  it('returns the first warehouse row for a bare SKU with several warehouses', async () => {
    fakeLookup()
    const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
    const level = StockLevelSchema.parse(await adapter.getStockLevel(CREDS, 'SKU-1'))
    expect(level).toMatchObject({ id: 'SKU-1:WH1', locationId: 'WH1', quantityOnHand: 50 })
  })

  it('refuses a SKU without a warehouse breakdown rather than invent quantityOnHand', async () => {
    fakeLookup()
    const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
    await expect(adapter.getStockLevel(CREDS, 'SKU-2')).rejects.toThrow(
      /SKU-2 has no warehouse Details/,
    )
  })

  it('404s an unknown SKU or warehouse', async () => {
    fakeLookup()
    const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })
    await expect(adapter.getStockLevel(CREDS, 'NOPE')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getStockLevel(CREDS, 'SKU-1:WH9')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it.each([{}, { inventoryFeedName: '  ' }])(
    'refuses with 501 and sends nothing without the inventory feed name (%o)',
    async (config) => {
      const post = fakeLookup()
      const adapter = new DeckCommerceAdapter(config)
      await expect(adapter.getStockLevel(CREDS, 'SKU-1')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining('inventoryFeedName'),
      })
      expect(post).not.toHaveBeenCalled()
    },
  )
})

describe('deckTimestamp', () => {
  it("formats as PHP gmdate('n/j/Y H:i A')", () => {
    expect(deckTimestamp(new Date(Date.UTC(2026, 8, 5, 13, 4)))).toBe('9/5/2026 13:04 PM')
    expect(deckTimestamp(new Date(Date.UTC(2026, 11, 25, 0, 7)))).toBe('12/25/2026 00:07 AM')
    expect(deckTimestamp(new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBe('1/1/2026 12:00 PM')
  })

  it('formats in UTC whatever the process time zone', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati') // UTC+14: local date and hour both differ
    expect(deckTimestamp(new Date(Date.UTC(2026, 8, 5, 13, 4)))).toBe('9/5/2026 13:04 PM')
  })
})
