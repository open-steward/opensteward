import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawTaigaMe,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('taiga transformWorkspace', () => {
  const raw: RawTaigaMe = {
    id: 5,
    username: 'alice',
    full_name: 'Alice Smith',
    full_name_display: 'Alice Smith (admin)',
    email: 'alice@example.com',
    lang: 'en',
    timezone: 'Europe/London',
    is_active: true,
  }

  it('maps id and externalId from numeric user id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('uses full_name_display as name when present', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Alice Smith (admin)')
  })

  it('falls back to full_name when full_name_display is absent', () => {
    const result = transformWorkspace({ ...raw, full_name_display: undefined })
    expect(result.name).toBe('Alice Smith')
  })

  it('falls back to username when full_name is also absent', () => {
    const result = transformWorkspace({ id: 1, username: 'bob' })
    expect(result.name).toBe('bob')
  })

  it('stores username in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.username).toBe('alice')
  })

  it('stores email in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.email).toBe('alice@example.com')
  })

  it('stores lang in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.lang).toBe('en')
  })

  it('stores timezone in metadata', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.timezone).toBe('Europe/London')
  })

  it('platform is taiga', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
