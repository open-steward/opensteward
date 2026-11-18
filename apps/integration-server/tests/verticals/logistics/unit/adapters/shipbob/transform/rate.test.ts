import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  transformRate,
  type ShipBobEstimate,
} from '../../../../../../../src/verticals/logistics/adapters/shipbob/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'
import { ShipBobAdapter } from '../../../../../../../src/verticals/logistics/adapters/shipbob/index'
import { ShipBobClient } from '../../../../../../../src/verticals/logistics/adapters/shipbob/client'
import type {
  Credentials,
  RateRequestParams,
} from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * The adapter declared `rate` unavailable because the only estimate endpoint
 * lived on the deprecated 1.0 API. The 2026-01 spec carries it as
 * `POST /2026-01/order:estimate` ("Estimate Fulfillment Cost For Order"), so
 * the reason was stale.
 *
 * What it returns is not a carrier rate shop — one all-in fulfilment price
 * per shipping method — and it prices an ORDER, so it needs the products
 * that order would contain. `RateRequestParams` has no field for those; they
 * ride the index signature as `products`.
 */

/** The shape the 2026-01 spec documents for one estimate. */
function makeEstimate(overrides: Partial<ShipBobEstimate> = {}): ShipBobEstimate {
  return {
    shipping_method: 'Standard',
    estimated_price: 8.42,
    estimated_currency_code: 'USD',
    fulfillment_center: { id: 8, name: 'Cicero (IL)' },
    total_weight_oz: 12.5,
    ...overrides,
  }
}

describe('shipbob transformRate', () => {
  it('keys the row on the shipping method', () => {
    // The method name is what a caller passes back as `requestedServiceCode`
    // on createOrder, and ShipBob names no carrier before a label exists.
    const r = transformRate(makeEstimate())
    expect(r.carrierId).toBe('Standard')
    expect(r.serviceCode).toBe('Standard')
    expect(r.serviceName).toBe('Standard')
  })

  it('converts the decimal price to integer minor units', () => {
    // 8.42 * 100 is 842.0000000000001 in floating point; Amount is `.int()`.
    expect(transformRate(makeEstimate()).totalAmount).toBe(842)
  })

  it('keeps a zero price as zero, not absent', () => {
    expect(transformRate(makeEstimate({ estimated_price: 0 })).totalAmount).toBe(0)
  })

  it('leaves totalAmount undefined when no price is reported', () => {
    expect(transformRate(makeEstimate({ estimated_price: null })).totalAmount).toBeUndefined()
  })

  it('takes currency from the response', () => {
    expect(transformRate(makeEstimate({ estimated_currency_code: 'CAD' })).currency).toBe('CAD')
  })

  it('does not invent a currency when the response omits one', () => {
    // `estimated_currency_code` is nullable upstream and ShipBob fulfils from
    // CA, AU, UK and EU centres — "dollars" in the spec is not an ISO code.
    expect(transformRate(makeEstimate({ estimated_currency_code: null })).currency).toBeUndefined()
  })

  it('leaves the method-keyed fields undefined when the method is null', () => {
    const r = transformRate(makeEstimate({ shipping_method: null }))
    expect(r.carrierId).toBeUndefined()
    expect(r.serviceCode).toBeUndefined()
  })

  it('preserves the raw payload by reference', () => {
    // The fulfilment centre and packed weight have no canonical field; a
    // caller reaches them here.
    const raw = makeEstimate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => RateSchema.parse(transformRate(makeEstimate()))).not.toThrow()
  })

  it('parses a sparse estimate too', () => {
    expect(RateSchema.safeParse(transformRate({} as ShipBobEstimate)).success).toBe(true)
  })
})

describe('shipbob getRates', () => {
  afterEach(() => vi.restoreAllMocks())

  const creds: Credentials = { accessToken: 't', extra: { channelId: '12345' } }
  const base: RateRequestParams = {
    originAddress: { city: 'Cicero', state: 'IL', country: 'US' },
    destinationAddress: {
      name: 'Bruce Wayne',
      company: 'Wayne Enterprises',
      street1: '100 Nowhere Blvd',
      street2: 'Suite 100',
      city: 'Gotham City',
      state: 'NJ',
      postalCode: '07093',
      country: 'US',
      phone: '+12015550100',
      email: 'bruce@wayne.example',
    },
    packages: [],
  }

  function stubPost(estimates: ShipBobEstimate[] | null) {
    return vi.spyOn(ShipBobClient.prototype, 'post').mockResolvedValue({ estimates } as never)
  }

  it('throws naming `products` when the request carries none', async () => {
    // Nothing is sent: the guard runs before a client exists.
    const post = stubPost([])
    await expect(new ShipBobAdapter().getRates(creds, base)).rejects.toThrow(/`products`/)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects an empty products list and an item with neither id nor reference_id', async () => {
    const adapter = new ShipBobAdapter()
    await expect(adapter.getRates(creds, { ...base, products: [] })).rejects.toThrow(/`products`/)
    await expect(adapter.getRates(creds, { ...base, products: [{ quantity: 1 }] })).rejects.toThrow(
      /`products`/,
    )
  })

  it('posts order:estimate with the products, the destination and the requested methods', async () => {
    const post = stubPost([makeEstimate()])
    const products = [
      { id: 1234567, quantity: 2 },
      { reference_id: 'TShirtBlueM', quantity: 1 },
    ]
    await new ShipBobAdapter().getRates(creds, { ...base, products, serviceCodes: ['Standard'] })

    expect(post).toHaveBeenCalledTimes(1)
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('order:estimate')
    expect(body).toEqual({
      // `EstimationAddressViewModel` is additionalProperties:false — the
      // recipient name, phone and email must NOT be forwarded.
      address: {
        address1: '100 Nowhere Blvd',
        address2: 'Suite 100',
        city: 'Gotham City',
        state: 'NJ',
        zip_code: '07093',
        country: 'US',
        company_name: 'Wayne Enterprises',
      },
      products,
      shipping_methods: ['Standard'],
    })
  })

  it('omits shipping_methods when no serviceCodes are given, so ShipBob quotes every method', async () => {
    const post = stubPost([makeEstimate()])
    await new ShipBobAdapter().getRates(creds, { ...base, products: [{ id: 1, quantity: 1 }] })
    const body = post.mock.calls[0]![1] as Record<string, unknown>
    expect(body.shipping_methods).toBeUndefined()
  })

  it('maps each estimate to a Rate and tolerates a null estimates envelope', async () => {
    stubPost([
      makeEstimate(),
      makeEstimate({ shipping_method: 'Expedited', estimated_price: 14.1 }),
    ])
    const rates = await new ShipBobAdapter().getRates(creds, {
      ...base,
      products: [{ id: 1, quantity: 1 }],
    })
    expect(rates.map((r) => [r.serviceCode, r.totalAmount])).toEqual([
      ['Standard', 842],
      ['Expedited', 1410],
    ])
    for (const r of rates) expect(() => RateSchema.parse(r)).not.toThrow()

    vi.restoreAllMocks()
    stubPost(null)
    await expect(
      new ShipBobAdapter().getRates(creds, { ...base, products: [{ id: 1, quantity: 1 }] }),
    ).resolves.toEqual([])
  })
})
