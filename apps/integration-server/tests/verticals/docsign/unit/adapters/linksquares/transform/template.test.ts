import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawLinksquaresTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/linksquares/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('linksquares transformTemplate', () => {
  const raw: RawLinksquaresTemplate = {
    id: 200,
    name: 'Standard MSA',
    description: 'Master Services Agreement template.',
    roles: ['Customer', 'Provider'],
    document_count: 2,
    created_at: '2025-01-05T08:00:00.000Z',
    updated_at: '2025-03-20T12:00:00.000Z',
  }

  it('maps id to string id and externalId', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps name to name', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('Standard MSA')
  })

  it('maps description to description', () => {
    const result = transformTemplate(raw)
    expect(result.description).toBe('Master Services Agreement template.')
  })

  it('maps roles to signerRoles', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['Customer', 'Provider'])
  })

  it('maps document_count to documentCount', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(2)
  })

  it('maps created_at to createdAt', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2025-01-05T08:00:00.000Z')
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformTemplate(raw)
    expect(result.updatedAt).toBe('2025-03-20T12:00:00.000Z')
  })

  it('sets platform to linksquares', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('linksquares')
  })

  it('falls back to party_roles when roles is absent', () => {
    const { roles: _, ...rest } = raw
    const result = transformTemplate({ ...rest, party_roles: ['Buyer', 'Seller'] })
    expect(result.signerRoles).toEqual(['Buyer', 'Seller'])
  })

  it('returns empty signerRoles when both roles and party_roles are absent', () => {
    const { roles: _, ...rest } = raw
    const result = transformTemplate(rest as RawLinksquaresTemplate)
    expect(result.signerRoles).toEqual([])
  })

  it('defaults documentCount to 1 when document_count is absent', () => {
    const { document_count: _, ...rest } = raw
    const result = transformTemplate(rest as RawLinksquaresTemplate)
    expect(result.documentCount).toBe(1)
  })

  it('passes TemplateSchema validation', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
