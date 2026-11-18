import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawFactroCompany,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('factro transformWorkspace', () => {
  const raw: RawFactroCompany = {
    id: 'company-acme',
    name: 'Acme Industries',
    description: 'Global widget manufacturer.',
    shortName: 'ACME',
    city: 'Berlin',
    emailAddress: 'info@acme.example',
    website: 'https://acme.example',
    companyNumber: 42,
    customerId: 'cust-001',
  }

  it('maps id and externalId from company id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('company-acme')
    expect(result.externalId).toBe('company-acme')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Industries')
  })

  it('platform is factro', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('factro')
  })

  it('metadata.shortName reflects shortName', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.shortName).toBe('ACME')
  })

  it('metadata.website reflects website', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.website).toBe('https://acme.example')
  })

  it('metadata.emailAddress reflects emailAddress', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.emailAddress).toBe('info@acme.example')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ id: 'c1' })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
