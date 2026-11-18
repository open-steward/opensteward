/**
 * MyFatoorah documents no list endpoint for customers, charges, refunds,
 * invoices or saved payment methods, so those list methods refuse with 501
 * before any request is sent. The docs index
 * (https://docs.myfatoorah.com/llms.txt) lists only single-record lookups:
 *   GET /v3/customers/{Reference}: "Retrieves the details of a customer including
 *     the cards saved with his reference."
 *   GET /v3/payments/{paymentId}: "Get the details of a payment by its paymentId."
 *   GET /v3/refunds/{refundId}: "Retrieves the details of a previously created
 *     refund using the refundId."
 *   POST /v2/GetPaymentStatus: "Checks the status of an invoice ... using
 *     InvoiceId, PaymentId, or CustomerReference."
 * getCustomer and getCharge called the undocumented '/customers/{id}' and
 * '/charges/{id}' paths, so they refuse the same way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { MyfatoorahAdapter } from '../../../../../../src/verticals/payments/adapters/myfatoorah/index'

const creds = { accessToken: 'mf-token' }
let sent: string[] = []
let bodies: unknown[] = []

beforeEach(() => {
  sent = []
  bodies = []
  const record = (method: string) =>
    vi.fn(async (url: string, body?: unknown) => {
      sent.push(`${method} ${url}`)
      bodies.push(body)
      return { data: {} }
    })
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: record('GET'),
    post: record('POST'),
    delete: record('DELETE'),
  })) as unknown as typeof axios.create)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new MyfatoorahAdapter()
const cases: [string, () => Promise<unknown>][] = [
  ['listCustomers', () => adapter.listCustomers(creds, { page: 1, limit: 10 })],
  ['listCharges', () => adapter.listCharges(creds, { page: 1, limit: 10 })],
  ['listRefunds', () => adapter.listRefunds(creds, { page: 1, limit: 10 })],
  ['listInvoices', () => adapter.listInvoices(creds, { page: 1, limit: 10 })],
  ['listPaymentMethods', () => adapter.listPaymentMethods(creds, { page: 1, limit: 10 })],
  ['getCustomer', () => adapter.getCustomer(creds, 'CUST-1')],
  ['getCharge', () => adapter.getCharge(creds, '07071234567890')],
]

describe('myfatoorah unsupported reads', () => {
  it.each(cases)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(sent).toEqual([])
  })

  it('getInvoice still reads one invoice through the documented POST /v2/GetPaymentStatus', async () => {
    await adapter.getInvoice(creds, '12345').catch(() => undefined)
    // Path casing and body per the OpenAPI embedded in
    // https://docs.myfatoorah.com/reference/get-payment-status: "/v2/GetPaymentStatus",
    // required ["Key","KeyType"], KeyType enum ["InvoiceId","PaymentId","CustomerReference"].
    expect(sent).toEqual(['POST /v2/GetPaymentStatus'])
    expect(bodies).toEqual([{ Key: '12345', KeyType: 'InvoiceId' }])
  })
})
