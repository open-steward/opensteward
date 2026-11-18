import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawSphereonSignatureConfig,
} from '../../../../../../../src/verticals/docsign/adapters/blueink-bypass/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('blueink-bypass transformTemplate', () => {
  const raw: RawSphereonSignatureConfig = {
    configId: 'cfg_abc123',
    name: 'EU Advanced Signature',
    description: 'EIDAS advanced level config',
    config: {
      signatureLevel: 'ADVANCED',
      digestAlgorithm: 'SHA256',
      accessRestrictions: {
        roles: ['admin', 'notary'],
      },
    },
    createdDate: '2025-03-10T08:00:00Z',
    modifiedDate: '2025-04-01T12:00:00Z',
  }

  it('maps configId to id and externalId', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('cfg_abc123')
    expect(result.externalId).toBe('cfg_abc123')
  })

  it('maps name from raw.name', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('EU Advanced Signature')
  })

  it('maps description', () => {
    const result = transformTemplate(raw)
    expect(result.description).toBe('EIDAS advanced level config')
  })

  it('maps signerRoles from config.accessRestrictions.roles', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual(['admin', 'notary'])
  })

  it('always sets documentCount to 0', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(0)
  })

  it('sets platform to blueink-bypass', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('blueink-bypass')
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2025-03-10T08:00:00.000Z')
    expect(result.updatedAt).toBe('2025-04-01T12:00:00.000Z')
  })

  it('puts signatureLevel and digestAlgorithm in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata['signatureLevel']).toBe('ADVANCED')
    expect(result.metadata['digestAlgorithm']).toBe('SHA256')
  })

  it('passes TemplateSchema validation', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })

  it('falls back to id field when configId is absent', () => {
    const noConfigId: RawSphereonSignatureConfig = {
      id: 'fallback_id',
      name: 'Fallback Config',
    }
    const result = transformTemplate(noConfigId)
    expect(result.id).toBe('fallback_id')
    expect(result.externalId).toBe('fallback_id')
  })

  it('falls back name to signatureLevel when name is absent', () => {
    const noName: RawSphereonSignatureConfig = {
      configId: 'cfg_xyz',
      config: { signatureLevel: 'QUALIFIED' },
    }
    const result = transformTemplate(noName)
    expect(result.name).toBe('QUALIFIED')
  })

  it('falls back name to id when both name and signatureLevel are absent', () => {
    const minimal: RawSphereonSignatureConfig = {
      configId: 'cfg_min',
    }
    const result = transformTemplate(minimal)
    expect(result.name).toBe('cfg_min')
  })

  it('filters non-string values out of signerRoles', () => {
    const withMixedRoles: RawSphereonSignatureConfig = {
      configId: 'cfg_roles',
      config: {
        accessRestrictions: {
          // Cast to test runtime filtering of non-string values
          roles: ['signer', 123 as unknown as string, null as unknown as string, 'reviewer'],
        },
      },
    }
    const result = transformTemplate(withMixedRoles)
    expect(result.signerRoles).toEqual(['signer', 'reviewer'])
  })

  it('returns empty signerRoles when accessRestrictions is absent', () => {
    const noRestrictions: RawSphereonSignatureConfig = {
      configId: 'cfg_norestrict',
      name: 'No Restrictions Config',
    }
    const result = transformTemplate(noRestrictions)
    expect(result.signerRoles).toEqual([])
  })

  it('passes TemplateSchema validation for minimal input', () => {
    const minimal: RawSphereonSignatureConfig = {}
    const result = transformTemplate(minimal)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})
