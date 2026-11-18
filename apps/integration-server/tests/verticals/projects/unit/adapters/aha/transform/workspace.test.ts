import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawAhaProduct,
} from '../../../../../../../src/verticals/projects/adapters/aha/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('aha transformWorkspace', () => {
  const raw: RawAhaProduct = {
    id: 'prod-10',
    reference_prefix: 'APP',
    name: 'My Product',
    product_line: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('prod-10')
    expect(result.externalId).toBe('prod-10')
  })

  it('maps name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('My Product')
  })

  it('platform is aha', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('aha')
  })

  it('metadata.referencePrefix is set', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.referencePrefix).toBe('APP')
  })

  it('metadata.productLine reflects product_line boolean', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.productLine).toBe('false')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ id: 'p1' })
    expect(result.name).toBe('')
  })

  it('memberCount is undefined (Aha! product has no memberCount field)', () => {
    const result = transformWorkspace(raw)
    expect(result.memberCount).toBeUndefined()
  })
})
