import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawSmarttaskOrganization,
} from '../../../../../../../src/verticals/projects/adapters/smarttask/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('smarttask transformWorkspace', () => {
  const raw: RawSmarttaskOrganization = {
    organization_id: 7,
    name: 'Acme Labs',
  }

  it('maps id and externalId from organization_id as string', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from raw.name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Labs')
  })

  it('name is empty string when name is absent', () => {
    const result = transformWorkspace({ organization_id: 7 })
    expect(result.name).toBe('')
  })

  it('metadata is empty', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata).toEqual({})
  })

  it('platform is smarttask', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('smarttask')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
