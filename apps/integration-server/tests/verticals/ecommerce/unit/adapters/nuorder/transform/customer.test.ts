// NuORDER Company/Buyer fields verified against
// https://assets.nuorder.com/api-docs/index.html
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawNuorderCompany,
} from '../../../../../../../src/verticals/ecommerce/adapters/nuorder/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeRaw(overrides: Partial<RawNuorderCompany> = {}): RawNuorderCompany {
  return {
    id: 7001,
    code: 'ACME-01',
    buyers: [
      { name: 'Jane Buyer', email: 'jane@acme.example', title: 'Owner', phone_office: '+14155550100' },
    ],
    ...overrides,
  }
}

describe('transformCustomer (NuORDER Company/Buyer)', () => {
  it('passes the canonical schema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeRaw()))).not.toThrow()
  })

  it('maps id to string canonical id', () => {
    expect(transformCustomer(makeRaw()).id).toBe('7001')
  })

  it('falls back to code when id is absent', () => {
    expect(transformCustomer(makeRaw({ id: undefined })).id).toBe('ACME-01')
  })

  it('throws rather than inventing an id when neither id nor code is present', () => {
    expect(() => transformCustomer(makeRaw({ id: undefined, code: undefined }))).toThrow(/id/i)
  })

  it('takes email/phone from the first buyer', () => {
    const result = transformCustomer(makeRaw())
    expect(result.email).toBe('jane@acme.example')
    expect(result.phone).toBe('+14155550100')
  })

  it('falls back to phone_cell when phone_office is absent', () => {
    const result = transformCustomer(
      makeRaw({ buyers: [{ name: 'Jane', phone_cell: '+14155550199' }] }),
    )
    expect(result.phone).toBe('+14155550199')
  })

  it('puts the whole buyer name in firstName rather than guessing a first/last split', () => {
    expect(transformCustomer(makeRaw()).firstName).toBe('Jane Buyer')
    expect(transformCustomer(makeRaw()).lastName).toBeUndefined()
  })

  it('handles a company with no buyers', () => {
    const result = transformCustomer(makeRaw({ buyers: [] }))
    expect(result.email).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('preserves the raw record as metadata', () => {
    const raw = makeRaw()
    expect(transformCustomer(raw).metadata).toEqual(raw)
  })
})

describe('untransformCustomer (NuORDER)', () => {
  it('emits only code', () => {
    expect(untransformCustomer({ id: 'ACME-02' })).toEqual({ code: 'ACME-02' })
  })
})
