/**
 * Pepperi Account → canonical Customer.
 *
 * Field names (`InternalID`, `ExternalID`, `Name`, `Email`, `Phone`,
 * `CreationDate`) are confirmed against Pepperi's own bundled
 * `post_accounts_schema` at
 * https://storage.pepperi.com/Developer/developer_body.js.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawPepperiAccount,
} from '../../../../../../../src/verticals/ecommerce/adapters/pepperi/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeAccount(overrides: Partial<RawPepperiAccount> = {}): RawPepperiAccount {
  return {
    InternalID: 7001,
    ExternalID: 'ACME-DIST',
    Name: 'Acme Distribution LLC',
    Email: 'buyer@acme.example',
    Phone: '+14155550123',
    CreationDate: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('pepperi transformCustomer', () => {
  it('maps ExternalID to the canonical id', () => {
    expect(transformCustomer(makeAccount()).id).toBe('ACME-DIST')
  })

  it('throws when ExternalID is absent rather than falling back to InternalID', () => {
    expect(() => transformCustomer(makeAccount({ ExternalID: null }))).toThrow(/ExternalID/)
  })

  it('maps the confirmed Name field to lastName — Customer has no company-name field', () => {
    const result = transformCustomer(makeAccount())
    expect(result.lastName).toBe('Acme Distribution LLC')
    expect(result.firstName).toBeUndefined()
  })

  it('maps email and phone', () => {
    const result = transformCustomer(makeAccount())
    expect(result.email).toBe('buyer@acme.example')
    expect(result.phone).toBe('+14155550123')
  })

  it('maps CreationDate to createdAt and never sets updatedAt — no modification-date field is confirmed for Accounts', () => {
    const result = transformCustomer(makeAccount())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeAccount()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    expect(() => CustomerSchema.parse(transformCustomer(makeAccount()))).not.toThrow()
  })

  it('round-trips via untransformCustomer for the POST /accounts upsert body', () => {
    const canonical = transformCustomer(makeAccount())
    expect(untransformCustomer(canonical)).toEqual({
      ExternalID: 'ACME-DIST',
      Name: 'Acme Distribution LLC',
      Email: 'buyer@acme.example',
      Phone: '+14155550123',
    })
  })
})
