import { describe, it, expect } from 'vitest'
import {
  transformSynderAccount,
  transformSynderCompany,
  type SynderAccount,
  type SynderCompany,
} from '../../../../../../../src/verticals/accounting/adapters/synder/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeAccount(overrides: Partial<SynderAccount> = {}): SynderAccount {
  return {
    id: 'acct-synder-001',
    email: 'owner@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    status: 'ACTIVE',
    companiesAmount: 2,
    successfulImports: 50,
    subscription: { plan: 'PRO', active: true },
    ...overrides,
  }
}

function makeCompany(overrides: Partial<SynderCompany> = {}): SynderCompany {
  return {
    id: 'company-synder-001',
    companyName: 'Acme QuickBooks',
    provider: 'intuit',
    status: 'ACTIVE',
    companyAddress: '123 Main St, Springfield, IL',
    ...overrides,
  }
}

describe('synder transformSynderAccount', () => {
  it('maps id', () => {
    expect(transformSynderAccount(makeAccount()).id).toBe('acct-synder-001')
  })

  it('maps firstName + lastName to name', () => {
    expect(transformSynderAccount(makeAccount()).name).toBe('Jane Doe')
  })

  it('handles missing lastName gracefully', () => {
    expect(transformSynderAccount(makeAccount({ lastName: '' })).name).toBe('Jane')
  })

  it('preserves raw as metadata', () => {
    const raw = makeAccount()
    expect(transformSynderAccount(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformSynderAccount(makeAccount()))).not.toThrow()
  })
})

describe('synder transformSynderCompany', () => {
  it('maps id', () => {
    expect(transformSynderCompany(makeCompany()).id).toBe('company-synder-001')
  })

  it('maps companyName to name', () => {
    expect(transformSynderCompany(makeCompany()).name).toBe('Acme QuickBooks')
  })

  it('preserves raw as metadata', () => {
    const raw = makeCompany()
    expect(transformSynderCompany(raw).metadata).toBe(raw)
  })

  it('passes OrganizationSchema validation', () => {
    expect(() => OrganizationSchema.parse(transformSynderCompany(makeCompany()))).not.toThrow()
  })
})
