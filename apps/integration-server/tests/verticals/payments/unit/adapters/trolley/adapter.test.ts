/**
 * Trolley read methods: documented paths and envelopes, and the refusals for
 * resources Trolley's API does not have (https://developers.trolley.com/openapi.yml
 * has no charge or refund path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { TrolleyAdapter } from '../../../../../../src/verticals/payments/adapters/trolley'

const { getMock, postMock, ctorMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  ctorMock: vi.fn(),
}))

vi.mock('../../../../../../src/verticals/payments/adapters/trolley/client', () => ({
  TrolleyClient: class {
    constructor(c: unknown) {
      ctorMock(c)
    }
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const adapter = new TrolleyAdapter()
const CREDS: Credentials = { accessToken: 'A', extra: { secretKey: 'S' } }

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  ctorMock.mockReset()
})

describe('TrolleyAdapter refusals', () => {
  it.each([
    ['listCharges', () => adapter.listCharges(CREDS, { page: 1, limit: 10 })],
    ['getCharge', () => adapter.getCharge(CREDS, 'x')],
    ['listRefunds', () => adapter.listRefunds(CREDS, { page: 1, limit: 10 })],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(ctorMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('TrolleyAdapter get methods', () => {
  it('getCustomer reads GET /recipients/:id → { recipient }', async () => {
    getMock.mockResolvedValue({ ok: true, recipient: { id: 'R-1', email: 'a@example.com' } })
    const c = await adapter.getCustomer(CREDS, 'R-1')
    expect(getMock).toHaveBeenCalledWith('/recipients/R-1')
    expect(c.id).toBe('R-1')
  })

  it('getPayout reads GET /payments/:payment-id → { payment }', async () => {
    getMock.mockResolvedValue({
      ok: true,
      payment: { id: 'P-1', status: 'pending', sourceAmount: '5.00', sourceCurrency: 'EUR' },
    })
    const p = await adapter.getPayout(CREDS, 'P-1')
    expect(getMock).toHaveBeenCalledWith('/payments/P-1')
    expect(p).toMatchObject({ id: 'P-1', amount: 500, currency: 'EUR', status: 'pending' })
  })

  it('getInvoice posts { invoiceId } to /invoices/get → { invoice }', async () => {
    postMock.mockResolvedValue({
      ok: true,
      invoice: { id: 'I-1', status: 'paid', totalAmount: { value: '1.00', currency: 'USD' } },
    })
    const inv = await adapter.getInvoice(CREDS, 'I-1')
    expect(postMock).toHaveBeenCalledWith('/invoices/get', { invoiceId: 'I-1' })
    expect(inv).toMatchObject({ id: 'I-1', total: 100, currency: 'USD', status: 'paid' })
  })

  it('a get whose envelope lacks the documented key throws instead of inventing a record', async () => {
    getMock.mockResolvedValue({ ok: true, data: { id: 'R-1' } })
    await expect(adapter.getCustomer(CREDS, 'R-1')).rejects.toThrow(/no recipient/)
  })

  it('getPayout throws when the response has no payment key', async () => {
    getMock.mockResolvedValue({ ok: true, data: { id: 'P-1' } })
    await expect(adapter.getPayout(CREDS, 'P-1')).rejects.toThrow(/no payment/)
  })

  it('getInvoice throws when the response has no invoice key', async () => {
    postMock.mockResolvedValue({ ok: true, data: { id: 'I-1' } })
    await expect(adapter.getInvoice(CREDS, 'I-1')).rejects.toThrow(/no invoice/)
  })
})
