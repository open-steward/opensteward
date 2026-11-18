import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawNextcloudDeckServer,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('nextcloud-deck transformWorkspace', () => {
  const raw: RawNextcloudDeckServer = {
    serverUrl: 'https://nextcloud.example.com',
    version: '27.0.2',
  }

  it('id is the serverUrl', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('https://nextcloud.example.com')
    expect(result.externalId).toBe('https://nextcloud.example.com')
  })

  it('name is the serverUrl', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('https://nextcloud.example.com')
  })

  it('falls back id and name to "nextcloud-server" when serverUrl is absent', () => {
    const result = transformWorkspace({})
    expect(result.id).toBe('nextcloud-server')
    expect(result.name).toBe('Nextcloud Server')
  })

  it('platform is nextcloud-deck', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
