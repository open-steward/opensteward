import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawProductboardProduct,
} from '../../../../../../../src/verticals/projects/adapters/productboard/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('productboard transformProject', () => {
  const raw: RawProductboardProduct = {
    id: 'prod-42',
    name: 'Mobile App',
    description: 'The flagship mobile application.',
    owner: { email: 'pm@example.com' },
    parent: {
      product: {
        id: 'prod-1',
        name: 'Parent Product',
        links: { self: 'https://api.productboard.com/products/prod-1' },
      },
    },
    links: {
      self: 'https://api.productboard.com/products/prod-42',
      html: 'https://app.productboard.com/p/prod-42',
    },
    archived: false,
    createdAt: '2024-06-01T12:00:00.000Z',
    updatedAt: '2025-01-10T09:15:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw, 'product')
    expect(result.id).toBe('prod-42')
    expect(result.externalId).toBe('prod-42')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw, 'product')
    expect(result.name).toBe('Mobile App')
  })

  it('maps description correctly', () => {
    const result = transformProject(raw, 'product')
    expect(result.description).toBe('The flagship mobile application.')
  })

  it('status is active when not archived', () => {
    const result = transformProject(raw, 'product')
    expect(result.status).toBe('active')
  })

  it('status is archived when archived=true', () => {
    const result = transformProject({ ...raw, archived: true }, 'product')
    expect(result.status).toBe('archived')
  })

  it('ownerId is the owner email', () => {
    const result = transformProject(raw, 'product')
    expect(result.ownerId).toBe('pm@example.com')
  })

  it('workspaceId is empty string (single-workspace token)', () => {
    const result = transformProject(raw, 'product')
    expect(result.workspaceId).toBe('')
  })

  it('createdAt and updatedAt are ISO 8601', () => {
    const result = transformProject(raw, 'product')
    expect(result.createdAt).toBe('2024-06-01T12:00:00.000Z')
    expect(result.updatedAt).toBe('2025-01-10T09:15:00.000Z')
  })

  it('platform is productboard', () => {
    const result = transformProject(raw, 'product')
    expect(result.platform).toBe('productboard')
  })

  it('metadata entityType reflects the argument', () => {
    const prodResult = transformProject(raw, 'product')
    expect(prodResult.metadata.entityType).toBe('product')
    const compResult = transformProject(raw, 'component')
    expect(compResult.metadata.entityType).toBe('component')
  })

  it('metadata includes parentProductId and htmlUrl', () => {
    const result = transformProject(raw, 'component')
    expect(result.metadata.parentProductId).toBe('prod-1')
    expect(result.metadata.htmlUrl).toBe('https://app.productboard.com/p/prod-42')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'product')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
