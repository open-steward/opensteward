import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawScoroCompanyAccount,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('scoro transformWorkspace', () => {
  const raw: RawScoroCompanyAccount = {
    entity_id: 5,
    entity_name: 'Acme Corp',
    company_name: 'Acme Corporation Ltd',
    site_plan: { name: 'Business' },
    base_currency: 'USD',
  }

  it('maps id and externalId from entity_id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('name prefers entity_name over company_name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('name falls back to company_name when entity_name is absent', () => {
    const result = transformWorkspace({ entity_id: 5, company_name: 'Acme Corporation Ltd' })
    expect(result.name).toBe('Acme Corporation Ltd')
  })

  it('stores sitePlan and baseCurrency in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.sitePlan).toBe('Business')
    expect(result.metadata.baseCurrency).toBe('USD')
  })

  it('platform is scoro', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('scoro')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
