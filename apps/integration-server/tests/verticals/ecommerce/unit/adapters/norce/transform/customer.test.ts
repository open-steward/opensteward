/**
 * Norce `transformCustomer` — maps Commerce Query's `Customers/Customers`
 * entity to the canonical Customer shape. Field names per the published
 * OpenAPI schema for `...CustomerModel.Customer`:
 * https://docs.norce.io/api-reference/query/querycustomers/openapi
 */
import { describe, it, expect } from 'vitest'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import {
  transformCustomer,
  type RawNorceCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/norce/transform/customer'

describe('Norce transformCustomer', () => {
  it('produces output that satisfies the canonical Customer schema', () => {
    const out = transformCustomer({
      Id: 7,
      EmailAddress: 'jane.doe@acme.example',
      FirstName: 'Jane',
      LastName: 'Doe',
      PhoneNumber: '+14155550123',
      Created: '2026-01-15T09:30:00Z',
      Updated: '2026-02-01T14:20:00Z',
    })
    expect(() => CustomerSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    const out = transformCustomer({ Id: 1 })
    expect(() => CustomerSchema.parse(out)).not.toThrow()
  })

  it('maps id to a string', () => {
    expect(transformCustomer({ Id: 99 }).id).toBe('99')
  })

  it('omits email rather than sending an empty string', () => {
    expect(transformCustomer({ Id: 2, EmailAddress: '' }).email).toBeUndefined()
    expect(transformCustomer({ Id: 3, EmailAddress: '  ' }).email).toBeUndefined()
  })

  it('falls back to CellPhoneNumber when PhoneNumber is absent', () => {
    expect(transformCustomer({ Id: 4, CellPhoneNumber: '+1234' }).phone).toBe('+1234')
  })

  it('converts Created/Updated to ISO 8601', () => {
    const out = transformCustomer({ Id: 5, Created: '2026-01-15T09:30:00Z' })
    expect(out.createdAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawNorceCustomer = { Id: 6 }
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('does not throw on missing optional fields', () => {
    expect(() => transformCustomer({ Id: 0 })).not.toThrow()
  })
})
