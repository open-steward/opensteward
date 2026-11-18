import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawProjectManagerWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('projectmanager transformWorkspace', () => {
  const raw: RawProjectManagerWorkspace = {
    workSpaceId: 'ws-uuid-abc',
    workSpaceName: 'Acme Corp',
    workSpaceStatus: 'Active',
    workSpaceIsActive: true,
    workSpaceCountry: 'United States',
    workSpaceCountryCode: 'US',
  }

  it('maps id and externalId from workSpaceId', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-uuid-abc')
    expect(result.externalId).toBe('ws-uuid-abc')
  })

  it('maps name from workSpaceName', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('platform is projectmanager', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('metadata includes workSpaceStatus and workSpaceIsActive', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.workSpaceStatus).toBe('Active')
    expect(result.metadata.workSpaceIsActive).toBe('true')
  })

  it('metadata includes workSpaceCountry and workSpaceCountryCode', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.workSpaceCountry).toBe('United States')
    expect(result.metadata.workSpaceCountryCode).toBe('US')
  })

  it('name is empty string when workSpaceName is null', () => {
    const result = transformWorkspace({ workSpaceId: 'ws-2', workSpaceName: null })
    expect(result.name).toBe('')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
