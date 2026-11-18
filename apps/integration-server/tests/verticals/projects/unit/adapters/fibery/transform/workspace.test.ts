import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawFiberyWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/fibery/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('fibery transformWorkspace', () => {
  const raw: RawFiberyWorkspace = {
    'fibery/id': 'ws-uuid-9999',
    'fibery/meta': { version: '2.4.1' },
    typeCount: 17,
    account: 'acme-corp',
  }

  it('maps id and externalId from fibery/id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('ws-uuid-9999')
    expect(result.externalId).toBe('ws-uuid-9999')
  })

  it('constructs name as <account>.fibery.io', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('acme-corp.fibery.io')
  })

  it('falls back to "Fibery Workspace" when account is absent', () => {
    const result = transformWorkspace({ 'fibery/id': 'ws-uuid-9999' })
    expect(result.name).toBe('Fibery Workspace')
  })

  it('platform is fibery', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('fibery')
  })

  it('metadata.account reflects the injected account field', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.account).toBe('acme-corp')
  })

  it('metadata.typeCount reflects the typeCount field', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.typeCount).toBe('17')
  })

  it('metadata.version reflects fibery/meta.version', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.version).toBe('2.4.1')
  })

  it('metadata.version is absent when fibery/meta is missing', () => {
    const result = transformWorkspace({ 'fibery/id': 'ws-uuid-9999', account: 'acme-corp' })
    expect(result.metadata.version).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
