import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawPaymoCompany,
} from '../../../../../../../src/verticals/projects/adapters/paymo/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

const baseRaw: RawPaymoCompany = {
  id: 7,
  name: 'Acme Industries',
  current_users: 15,
  country: 'US',
  timezone: 'America/Chicago',
  default_currency: 'USD',
  created_on: '2024-01-15T12:00:00.000Z',
  updated_on: '2024-06-01T08:00:00.000Z',
}

describe('transformWorkspace', () => {
  it('maps id and externalId as stringified numeric id', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from name field', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.name).toBe('Acme Industries')
  })

  it('maps memberCount from current_users', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.memberCount).toBe(15)
  })

  it('leaves memberCount undefined when current_users is absent', () => {
    const raw: RawPaymoCompany = { ...baseRaw, current_users: undefined }
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBeUndefined()
  })

  it('leaves memberCount undefined when current_users is not a number', () => {
    const raw = { ...baseRaw, current_users: 'lots' } as any
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBeUndefined()
  })

  it('sets platform to paymo', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.platform).toBe('paymo')
  })

  it('surfaces country and timezone in metadata', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.metadata).toMatchObject({ country: 'US', timezone: 'America/Chicago' })
  })

  it('surfaces default_currency in metadata as currency key', () => {
    const result = transformWorkspace(baseRaw)
    expect(result.metadata).toMatchObject({ currency: 'USD' })
  })

  it('defaults name to empty string when name is absent', () => {
    const raw: RawPaymoCompany = { ...baseRaw, name: undefined }
    const result = transformWorkspace(raw)
    expect(result.name).toBe('')
  })

  it('produces output that passes WorkspaceSchema validation', () => {
    const result = transformWorkspace(baseRaw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
