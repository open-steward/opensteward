/**
 * Xendit read methods rebuilt against the first-party docs.
 *
 * - listCustomers: GET /customers "Retrieves an array with a customer object
 *   that matches the provided reference_id" and its only query parameter,
 *   reference_id, is Required (https://docs.xendit.co/apidocs/get-customers-list).
 *   It is a lookup, not a list, so the adapter refuses before sending anything.
 * - listPaymentMethods / getPaymentMethod: "GET https://api.xendit.co/v2/payment_methods"
 *   and "GET https://api.xendit.co/v2/payment_methods/:id"
 *   (https://archive.developers.xendit.co/api-reference/payments-api/#list-payment-methods).
 *   The unversioned /payment_methods is the legacy Direct Debit endpoint that
 *   requires customer_id and returns a different object.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { XenditAdapter } from '../../../../../../src/verticals/payments/adapters/xendit/index'
import { PaymentMethodSchema } from '../../../../../../src/verticals/payments/schema/payment-method'

const CREDS: Credentials = { accessToken: 'xnd_development_a' }

/** The documented example Payment Method (Get Payment Method by ID Response). */
const DOC_PM = {
  id: 'pm-6ff0b6f2-f5de-457f-b08f-bc98fbae485a',
  card: null,
  type: 'DIRECT_DEBIT',
  status: 'ACTIVE',
  actions: [],
  country: 'ID',
  created: '2022-08-12T13:30:26.579048Z',
  ewallet: null,
  qr_code: null,
  updated: '2022-08-12T13:30:58.908220358Z',
  metadata: null,
  customer_id: 'e2878b4c-d57e-4a2c-922d-c0313c2800a3',
  description: null,
  reusability: 'MULTIPLE_USE',
  direct_debit: {
    type: 'DEBIT_CARD',
    debit_card: {
      mobile_number: '+62818555988',
      card_last_four: '8888',
      card_expiry: '06/24',
      email: 'email@email.com',
    },
    bank_account: null,
    channel_code: 'BRI',
    channel_properties: {
      mobile_number: '+62818555988',
      card_last_four: '8888',
      card_expiry: '06/24',
      email: 'test.email@xendit.co',
    },
  },
  failure_code: null,
  reference_id: '620b9df4-fe69-4bfd-b9d4-5cba6861db8a',
  virtual_account: null,
  over_the_counter: null,
  billing_information: null,
  direct_bank_transfer: null,
  business_id: '5f27a14a9bf05c73dd040bc8',
}

function fakeGet(impl: (path: string, params: Record<string, unknown>) => unknown) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => ({
    data: impl(path, config?.params ?? {}),
  }))
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return get
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Xendit listCustomers', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const get = fakeGet(() => ({ data: [] }))
    const create = vi.mocked(axios.create)
    await expect(
      new XenditAdapter().listCustomers(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('getCustomer still reads the documented GET /customers/{id}', async () => {
    const get = fakeGet((path) => ({ id: path.split('/').pop(), type: 'INDIVIDUAL' }))
    const c = await new XenditAdapter().getCustomer(CREDS, 'cust-1')
    expect(get.mock.calls[0]![0]).toBe('/customers/cust-1')
    expect(c.id).toBe('cust-1')
  })
})

describe('Xendit payment methods (v2)', () => {
  it('listPaymentMethods reads GET /v2/payment_methods with only limit, and maps the documented example', async () => {
    const get = fakeGet((path, params) => {
      if (path !== '/v2/payment_methods') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params)) if (k !== 'limit' && k !== 'after_id') throw new Error(k)
      return { data: [DOC_PM], has_more: false }
    })
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    const rows = await new XenditAdapter().listPaymentMethods(CREDS, params)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]).toEqual({ params: { limit: 10 } })
    expect(rows).toHaveLength(1)
    const pm = PaymentMethodSchema.parse(rows[0])
    expect(pm.id).toBe('pm-6ff0b6f2-f5de-457f-b08f-bc98fbae485a')
    expect(pm.type).toBe('bank_account')
    expect(pm.last4).toBe('8888')
    expect(pm.bankName).toBe('BRI')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('getPaymentMethod reads GET /v2/payment_methods/{id}', async () => {
    const get = fakeGet((path) => {
      if (path !== `/v2/payment_methods/${DOC_PM.id}`) throw new Error(`unexpected path ${path}`)
      return DOC_PM
    })
    const pm = await new XenditAdapter().getPaymentMethod(CREDS, DOC_PM.id)
    expect(get).toHaveBeenCalledTimes(1)
    expect(PaymentMethodSchema.parse(pm).id).toBe(DOC_PM.id)
  })

  it('getPaymentMethod percent-encodes the id into the path', async () => {
    const get = fakeGet(() => DOC_PM)
    await new XenditAdapter().getPaymentMethod(CREDS, 'pm/../x?y')
    expect(get.mock.calls[0]![0]).toBe('/v2/payment_methods/pm%2F..%2Fx%3Fy')
  })
})
