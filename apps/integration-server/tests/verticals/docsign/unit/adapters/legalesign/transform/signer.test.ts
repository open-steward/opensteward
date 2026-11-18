import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawLegalesignSigner,
} from '../../../../../../../src/verticals/docsign/adapters/legalesign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('legalesign transformSigner', () => {
  const raw: RawLegalesignSigner = {
    uuid: 'signer-uuid-1',
    email: 'jane@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    order: 0,
    role: 'signer',
    status: 40,
    has_fields: true,
  }

  it('maps uuid to id and externalId', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.id).toBe('signer-uuid-1')
    expect(result.externalId).toBe('signer-uuid-1')
  })

  it('maps email to email', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.email).toBe('jane@example.com')
  })

  it('combines firstname and lastname to name', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps status 40 to signed', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.status).toBe('signed')
  })

  it('maps order 0 to routingOrder 1 (0-indexed → 1-indexed)', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.routingOrder).toBe(1)
  })

  it('sets envelopeId to the passed envelopeId', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.envelopeId).toBe('env-001')
  })

  it('sets platform to legalesign', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.platform).toBe('legalesign')
  })

  it('maps signer role', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(result.role).toBe('signer')
  })

  it('maps approver role', () => {
    const result = transformSigner({ ...raw, role: 'approver' }, 'env-001', 0)
    expect(result.role).toBe('approver')
  })

  it('maps witness role', () => {
    const result = transformSigner({ ...raw, role: 'witness' }, 'env-001', 0)
    expect(result.role).toBe('witness')
  })

  it('maps status 60 to declined', () => {
    const result = transformSigner({ ...raw, status: 60 }, 'env-001', 0)
    expect(result.status).toBe('declined')
  })

  it('maps status 4 (unsent) to created', () => {
    const result = transformSigner({ ...raw, status: 4 }, 'env-001', 0)
    expect(result.status).toBe('created')
  })

  it('maps status 10 (sent) to sent', () => {
    const result = transformSigner({ ...raw, status: 10 }, 'env-001', 0)
    expect(result.status).toBe('sent')
  })

  it('maps status 20 (visited) to delivered', () => {
    const result = transformSigner({ ...raw, status: 20 }, 'env-001', 0)
    expect(result.status).toBe('delivered')
  })

  it('uses first_name / last_name aliases', () => {
    const { firstname: _, lastname: __, ...rest } = raw
    const result = transformSigner(
      { ...rest, first_name: 'John', last_name: 'Smith' },
      'env-001',
      0,
    )
    expect(result.name).toBe('John Smith')
  })

  it('falls back to positional id when no uuid', () => {
    const { uuid: _, ...rest } = raw
    const result = transformSigner({ ...rest, resource_uri: undefined }, 'env-001', 2)
    expect(result.id).toBe('env-001:2')
  })

  it('passes SignerSchema validation', () => {
    const result = transformSigner(raw, 'env-001', 0)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
