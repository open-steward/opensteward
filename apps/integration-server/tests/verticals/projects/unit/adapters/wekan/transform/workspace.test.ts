import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  buildVirtualWorkspace,
  type RawWekanVirtualWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'
import { VIRTUAL_WORKSPACE_ID } from '../../../../../../../src/verticals/projects/adapters/wekan/constants'

describe('wekan transformWorkspace', () => {
  const raw: RawWekanVirtualWorkspace = {
    _id: VIRTUAL_WORKSPACE_ID,
    name: 'https://wekan.example.com',
    serverUrl: 'https://wekan.example.com',
  }

  it('maps id and externalId from _id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe(VIRTUAL_WORKSPACE_ID)
    expect(result.externalId).toBe(VIRTUAL_WORKSPACE_ID)
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('https://wekan.example.com')
  })

  it('platform is wekan', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('wekan')
  })

  it('metadata contains serverUrl', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.serverUrl).toBe('https://wekan.example.com')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})

describe('wekan buildVirtualWorkspace', () => {
  it('sets _id to VIRTUAL_WORKSPACE_ID', () => {
    const result = buildVirtualWorkspace('https://wekan.example.com')
    expect(result._id).toBe(VIRTUAL_WORKSPACE_ID)
  })

  it('uses serverUrl as name', () => {
    const result = buildVirtualWorkspace('https://wekan.example.com')
    expect(result.name).toBe('https://wekan.example.com')
  })

  it('falls back to "Wekan" when serverUrl is empty string', () => {
    const result = buildVirtualWorkspace('')
    expect(result.name).toBe('Wekan')
  })

  it('stores serverUrl on the record', () => {
    const result = buildVirtualWorkspace('https://wekan.example.com')
    expect(result.serverUrl).toBe('https://wekan.example.com')
  })
})
