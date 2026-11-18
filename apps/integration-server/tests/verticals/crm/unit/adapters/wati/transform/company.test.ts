import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  type RawWatiCompany,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

describe('wati transformCompany (stub)', () => {
  it('maps id to string', () => {
    const raw: RawWatiCompany = { id: 'co_001', name: 'Acme' }
    expect(transformCompany(raw).id).toBe('co_001')
  })

  it('converts numeric id to string', () => {
    const raw: RawWatiCompany = { id: 42 }
    expect(transformCompany(raw).id).toBe('42')
  })

  it('maps name', () => {
    const raw: RawWatiCompany = { id: 'co_001', name: 'Acme Industries' }
    expect(transformCompany(raw).name).toBe('Acme Industries')
  })

  it('name defaults to empty string when absent', () => {
    const raw: RawWatiCompany = { id: 'co_001' }
    expect(transformCompany(raw).name).toBe('')
  })

  it('preserves raw as metadata by reference', () => {
    const raw: RawWatiCompany = { id: 'co_001', name: 'Acme' }
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawWatiCompany = { id: 'co_001', name: 'Acme' }
    expect(() => CompanySchema.parse(transformCompany(raw))).not.toThrow()
  })
})
