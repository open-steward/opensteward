/**
 * Worldline Direct listPayouts.
 *
 * Worldline's public OpenAPI (v2.507.0,
 * https://payment.preprod.direct.worldline-solutions.com/v1/public-contract-definition.yaml)
 * defines only `post` ("summary: Create payout", operationId CreatePayoutApi)
 * at `/v2/{merchantId}/payouts`, and only a by-id read ("summary: Get payout",
 * operationId GetPayoutApi) at `/v2/{merchantId}/payouts/{payoutId}`. There is
 * no list-payouts operation, so the adapter used to send a GET to a POST-only
 * resource and parse an invented `{ payouts: [] }` envelope. It now refuses
 * before sending anything; getPayout keeps the documented by-id read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { WorldlineAdapter } from '../../../../../../src/verticals/payments/adapters/worldline'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/worldline/client', () => ({
  WorldlineClient: class {
    get = getMock
    post = postMock
  },
}))

const adapter = new WorldlineAdapter()
const CREDS: Credentials = {
  accessToken: 'key_id',
  extra: { apiSecret: 'secret', merchantId: 'PSPID1', environment: 'sandbox' },
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('WorldlineAdapter.listPayouts', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    getMock.mockResolvedValue({ payouts: [] })
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(adapter.listPayouts(CREDS, params)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('names the missing list operation in the error', async () => {
    await expect(adapter.listPayouts(CREDS, { page: 2, limit: 5 })).rejects.toThrow(
      /Worldline cannot list payouts/,
    )
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('WorldlineAdapter.getPayout', () => {
  it('reads one payout from the documented GET /payouts/{payoutId}', async () => {
    getMock.mockResolvedValue({
      id: 'po_1',
      status: 'ACCOUNT_CREDITED',
      payoutOutput: { amountOfMoney: { amount: 1000, currencyCode: 'EUR' } },
    })
    const payout = await adapter.getPayout(CREDS, 'po_1')
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/payouts/po_1')
    expect(payout.id).toBe('po_1')
  })
})
