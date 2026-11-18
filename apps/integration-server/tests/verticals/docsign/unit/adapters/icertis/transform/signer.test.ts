import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawIcertisSignatory,
} from '../../../../../../../src/verticals/docsign/adapters/icertis/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const baseSig: RawIcertisSignatory = {
  ICMId: 'sig-001',
  Name: 'Jane Doe',
  Email: 'jane@example.com',
  SequenceNumber: 1,
  Status: 'Signed',
  SignedOn: '2025-02-01T00:00:00.000Z',
  IsExternal: true,
}

describe('icertis transformSigner', () => {
  it('maps id and externalId from ICMId', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.id).toBe('sig-001')
    expect(result.externalId).toBe('sig-001')
  })

  it('maps envelopeId from second argument', () => {
    const result = transformSigner(baseSig, 'env-42')
    expect(result.envelopeId).toBe('env-42')
  })

  it('maps email and name', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
  })

  it('sets role to signer', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.role).toBe('signer')
  })

  it('maps Status=Signed to signed', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.status).toBe('signed')
  })

  it('maps Status=Declined to declined', () => {
    const result = transformSigner({ ...baseSig, Status: 'Declined' }, 'env-1')
    expect(result.status).toBe('declined')
  })

  it('maps Status=Pending to sent', () => {
    const result = transformSigner({ ...baseSig, Status: 'Pending' }, 'env-1')
    expect(result.status).toBe('sent')
  })

  it('maps Status=Delivered to delivered', () => {
    const result = transformSigner({ ...baseSig, Status: 'Delivered' }, 'env-1')
    expect(result.status).toBe('delivered')
  })

  it('maps unknown status to created', () => {
    const result = transformSigner({ ...baseSig, Status: 'unknown_state' }, 'env-1')
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from SequenceNumber', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.routingOrder).toBe(1)
  })

  it('maps signedAt timestamp to ISO string', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.signedAt).toBe('2025-02-01T00:00:00.000Z')
  })

  it('maps declinedAt when DeclinedOn is set', () => {
    const result = transformSigner(
      { ...baseSig, Status: 'Declined', DeclinedOn: '2025-03-01T00:00:00.000Z' },
      'env-1',
    )
    expect(result.declinedAt).toBe('2025-03-01T00:00:00.000Z')
  })

  it('stores isExternal in metadata', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.metadata['isExternal']).toBe('true')
  })

  it('sets platform to icertis', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(result.platform).toBe('icertis')
  })

  it('passes SignerSchema validation', () => {
    const result = transformSigner(baseSig, 'env-1')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to Email as id when ICMId is absent', () => {
    const { ICMId, ...noId } = baseSig
    const result = transformSigner(noId, 'env-1')
    expect(result.id).toBe('jane@example.com')
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: RawIcertisSignatory = {}
    const result = transformSigner(minimal, 'env-1')
    expect(result.id).toBe('')
    expect(result.status).toBe('created')
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
