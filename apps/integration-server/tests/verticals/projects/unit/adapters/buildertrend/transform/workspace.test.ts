import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawBuildertrendBuilder,
} from '../../../../../../../src/verticals/projects/adapters/buildertrend/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('buildertrend transformWorkspace', () => {
  const raw: RawBuildertrendBuilder = {
    id: 10,
    name: 'Sunset Builders',
    companyName: 'Sunset Builders LLC',
    userCount: 15,
  }

  it('maps id from id field', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
  })

  it('prefers companyName over name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Sunset Builders LLC')
  })

  it('falls back to builderName then name when companyName absent', () => {
    const result = transformWorkspace({
      ...raw,
      companyName: undefined,
      builderName: 'Builder Name',
    })
    expect(result.name).toBe('Builder Name')
  })

  it('falls back to name when both company/builderName absent', () => {
    const result = transformWorkspace({ ...raw, companyName: undefined })
    expect(result.name).toBe('Sunset Builders')
  })

  it('memberCount from userCount', () => {
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBe(15)
  })

  it('platform is buildertrend', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('buildertrend')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
