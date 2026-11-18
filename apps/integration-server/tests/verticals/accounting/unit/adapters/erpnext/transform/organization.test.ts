import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ErpNextCompany,
} from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/organization'

describe('transformOrganization (ERPNext)', () => {
  const raw: ErpNextCompany = {
    name: 'ACME Corp',
    default_currency: 'INR',
    country: 'India',
  }

  it('maps core fields correctly', () => {
    const result = transformOrganization(raw)
    expect(result.id).toBe('ACME Corp')
    expect(result.name).toBe('ACME Corp')
    expect(result.currency).toBe('INR')
  })

  it('sets metadata to raw object', () => {
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(raw)
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
