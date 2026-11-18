import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/lumin-sign/transform/signer'
import type { RawLuminSignEmbeddedSigner } from '../../../../../../../src/verticals/docsign/adapters/lumin-sign/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('lumin-sign transformSigner', () => {
  const raw: RawLuminSignEmbeddedSigner = {
    email_address: 'alice@example.com',
    name: 'Alice Smith',
    group: 1,
    is_approved: true,
    status: 'APPROVED',
  }

  it('maps id as envelopeId:email composite', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.id).toBe('sr_lumin_001:alice@example.com')
  })

  it('maps externalId from email_address', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.externalId).toBe('alice@example.com')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.envelopeId).toBe('sr_lumin_001')
  })

  it('maps email from email_address', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name from name field', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.name).toBe('Alice Smith')
  })

  it('maps role to signer', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.role).toBe('signer')
  })

  it('maps status APPROVED → signed', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.status).toBe('signed')
  })

  it('maps status REJECTED → declined', () => {
    const result = transformSigner({ ...raw, status: 'REJECTED' }, 'sr_lumin_001')
    expect(result.status).toBe('declined')
  })

  it('maps status NEED_TO_SIGN → sent', () => {
    const result = transformSigner({ ...raw, status: 'NEED_TO_SIGN' }, 'sr_lumin_001')
    expect(result.status).toBe('sent')
  })

  it('maps status WAITING_FOR_OTHERS → sent', () => {
    const result = transformSigner({ ...raw, status: 'WAITING_FOR_OTHERS' }, 'sr_lumin_001')
    expect(result.status).toBe('sent')
  })

  it('maps unknown status → created', () => {
    const result = transformSigner({ ...raw, status: 'UNKNOWN' }, 'sr_lumin_001')
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from group field (1-indexed)', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when group is 0', () => {
    const result = transformSigner({ ...raw, group: 0 }, 'sr_lumin_001')
    expect(result.routingOrder).toBeUndefined()
  })

  it('omits routingOrder when group is absent', () => {
    const result = transformSigner({ ...raw, group: undefined }, 'sr_lumin_001')
    expect(result.routingOrder).toBeUndefined()
  })

  it('sets platform to lumin-sign', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.platform).toBe('lumin-sign')
  })

  it('includes group and luminStatus in metadata', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(result.metadata.group).toBe('1')
    expect(result.metadata.luminStatus).toBe('APPROVED')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, 'sr_lumin_001')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
