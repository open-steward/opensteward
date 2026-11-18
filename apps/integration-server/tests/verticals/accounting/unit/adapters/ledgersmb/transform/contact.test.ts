import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type LedgerSMBECA,
} from '../../../../../../../src/verticals/accounting/adapters/ledgersmb/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeECA(overrides: Partial<LedgerSMBECA> = {}): LedgerSMBECA {
  return {
    id: 7,
    number: 'CUST-007',
    type: 'customer',
    description: 'Acme Corp',
    entity: {
      name: 'Acme Corporation',
      control_code: 'ACME',
    },
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id as string', () => {
    expect(transformContact(makeECA()).id).toBe('7')
  })

  it('prefers entity.name for name', () => {
    expect(transformContact(makeECA()).name).toBe('Acme Corporation')
  })

  it('falls back to description when entity.name absent', () => {
    const result = transformContact(makeECA({ entity: undefined }))
    expect(result.name).toBe('Acme Corp')
  })

  it('maps description to companyName', () => {
    expect(transformContact(makeECA()).companyName).toBe('Acme Corp')
  })

  it('maps number to identification', () => {
    expect(transformContact(makeECA()).identification).toBe('CUST-007')
  })

  it('maps type customer to isCustomer=true, isSupplier=false', () => {
    const result = transformContact(makeECA({ type: 'customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps type vendor to isSupplier=true, isCustomer=false', () => {
    const result = transformContact(makeECA({ type: 'vendor' }))
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => ContactSchema.parse(transformContact(makeECA()))).not.toThrow()
  })
})
