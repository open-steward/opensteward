/**
 * Orderful has no stock-level resource, so listStockLevels and getStockLevel
 * refuse before sending anything.
 *
 * Stock only reaches Orderful inside 846 Inventory Inquiry/Advice documents.
 * The list endpoints return those documents without their content: v3 GET
 * /v3/transactions describes `message` as "Transaction message. Contains an
 * href link to the message content." The content endpoint
 * (https://docs.orderful.com/reference/transactionv4controller_getmessage)
 * says "What downloads depends on how the Transaction is backed: Relationships
 * that trade JSON return the JSON document, while X12 and EDIFACT
 * Relationships return the EDI file." The only 846 content schema Orderful
 * publishes is Mosaic Inventory Advice
 * (https://docs.orderful.com/reference/inventory-advice), whose quantity types
 * are "available unavailable incoming allocated maxOrderQuantity": no on-hand
 * quantity, which the canonical StockLevel requires.
 *
 * The method used to filter on '846_INVENTORY_INQUIRY', which is not an
 * Orderful transaction type (the documented one is
 * 846_INVENTORY_INQUIRY_ADVICE), and read a `message.detail[]` shape that no
 * Orderful response has, so it always returned an empty list, which a sync
 * reads as "the collection is empty".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { OrderfulAdapter } from '../../../../../../src/verticals/inventory/adapters/orderful/index'

const CREDS: Credentials = { accessToken: 'orderful_key' }

describe('orderful stock levels refuse without a request', () => {
  let sent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sent = vi.fn(() => {
      throw new Error('orderful sent a request')
    })
    vi.spyOn(axios, 'create').mockImplementation(sent as never)
    vi.spyOn(axios, 'get').mockImplementation(sent as never)
    vi.spyOn(axios, 'request').mockImplementation(sent as never)
    vi.stubGlobal('fetch', sent)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('listStockLevels throws 501 NOT_SUPPORTED on every page and with updatedAfter', async () => {
    const adapter = new OrderfulAdapter({})
    const calls: QueryParams[] = [
      { page: 1, limit: 50 },
      { page: 3, limit: 7 },
      { page: 1, limit: 100, updatedAfter: new Date('2026-01-01T00:00:00Z') },
    ]
    for (const params of calls) {
      await expect(adapter.listStockLevels(CREDS, params)).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/^Orderful cannot list stock levels: /),
      })
    }
    expect(sent).not.toHaveBeenCalled()
  })

  it('getStockLevel throws 501 NOT_SUPPORTED', async () => {
    const adapter = new OrderfulAdapter({})
    await expect(adapter.getStockLevel(CREDS, 'sku-1:wh-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^Orderful cannot read stock levels: /),
    })
    expect(sent).not.toHaveBeenCalled()
  })
})
