import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSwisscomSignatureObject,
} from '../../../../../../../src/verticals/docsign/adapters/swisscom-trust-services/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('swisscom-trust-services transformDocument', () => {
  const raw: RawSwisscomSignatureObject = {
    '@WhichDocument': 'doc-hash-001',
    Base64Signature: {
      '@Type': 'urn:ietf:rfc:3369',
      $: 'AAAA==',
    },
  }

  it('composes id from envelopeId and WhichDocument', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.id).toBe('env-abc:doc-hash-001')
  })

  it('sets externalId to WhichDocument value', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.externalId).toBe('doc-hash-001')
  })

  it('sets name to WhichDocument value', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.name).toBe('doc-hash-001')
  })

  it('preserves envelopeId', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.envelopeId).toBe('env-abc')
  })

  it('preserves order', () => {
    const result = transformDocument(raw, 'env-abc', 2)
    expect(result.order).toBe(2)
  })

  it('sets platform to swisscom-trust-services', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.platform).toBe('swisscom-trust-services')
  })

  it('surfaces whichDocument and signatureType in metadata', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(result.metadata.whichDocument).toBe('doc-hash-001')
    expect(result.metadata.signatureType).toBe('urn:ietf:rfc:3369')
  })

  it('falls back to String(order) when @WhichDocument is absent', () => {
    const noId: RawSwisscomSignatureObject = {}
    const result = transformDocument(noId, 'env-abc', 3)
    expect(result.externalId).toBe('3')
    expect(result.id).toBe('env-abc:3')
  })

  it('omits signatureType from metadata when Base64Signature is absent', () => {
    const noSig: RawSwisscomSignatureObject = { '@WhichDocument': 'doc-x' }
    const result = transformDocument(noSig, 'env-abc', 0)
    expect(result.metadata.signatureType).toBeUndefined()
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, 'env-abc', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})
