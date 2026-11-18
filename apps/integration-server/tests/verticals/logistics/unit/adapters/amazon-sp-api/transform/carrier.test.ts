import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  extractCarriers,
  type SpApiActiveAccount,
} from '../../../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

/**
 * `PUT /shipping/v2/carrierAccounts` with an empty body. The response is the
 * list of carrier accounts linked to the seller — an `accountId` and a
 * `carrierId` per row, nothing else. Fixture is the spec's own example.
 */
function makeAccount(overrides: Partial<SpApiActiveAccount> = {}): SpApiActiveAccount {
  return {
    accountId: '90613e4-dcf6-4c3e-bc57-45005580',
    carrierId: 'FedEx',
    ...overrides,
  }
}

describe('amazon-sp-api transformCarrier', () => {
  it('uses the account id as the id and the carrier id as name and code', () => {
    const c = transformCarrier(makeAccount())
    expect(c.id).toBe('90613e4-dcf6-4c3e-bc57-45005580')
    expect(c.name).toBe('FedEx')
    expect(c.code).toBe('FedEx')
  })

  it('falls back to the carrier id when the account id is missing', () => {
    expect(transformCarrier(makeAccount({ accountId: null })).id).toBe('FedEx')
  })

  it('marks every row active, because the endpoint only lists active accounts', () => {
    expect(transformCarrier(makeAccount()).isActive).toBe(true)
  })

  it('preserves the raw payload by reference', () => {
    const raw = makeAccount()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces output the canonical schema accepts', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeAccount()))).not.toThrow()
  })

  it('parses a sparse row too', () => {
    expect(CarrierSchema.safeParse(transformCarrier({})).success).toBe(true)
  })
})

describe('amazon-sp-api extractCarriers', () => {
  it('unwraps activeAccounts', () => {
    const rows = [makeAccount(), makeAccount({ carrierId: 'UPS' })]
    expect(extractCarriers({ activeAccounts: rows })).toBe(rows)
  })

  it('yields nothing to iterate when the list is absent', () => {
    expect(extractCarriers({})).toEqual([])
    expect(extractCarriers({ activeAccounts: null })).toEqual([])
  })
})
