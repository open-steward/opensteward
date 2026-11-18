import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawESignatureEuSigner,
} from '../../../../../../../src/verticals/docsign/adapters/e-signature-eu/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('e-signature-eu transformSigner', () => {
  it('maps a signed signer with name, email, and routing order', () => {
    const raw: RawESignatureEuSigner = {
      firstname: 'Alice',
      lastname: 'Smith',
      email: 'alice@example.com',
      status: 'signed',
      signing_time: '2026-01-15 14:22:00',
      signing_method: 'email',
      sign_first: true,
    }
    const result = transformSigner(raw, 'env-42', '1')

    // id = envelopeId:position
    expect(result.id).toBe('env-42:1')
    expect(result.externalId).toBe('env-42:1')
    expect(result.envelopeId).toBe('env-42')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.role).toBe('signer')
    // signed status maps correctly
    expect(result.status).toBe('signed')
    // position 1 → routingOrder 1
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2026-01-15T14:22:00.000Z')
    expect(result.platform).toBe('e-signature-eu')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a pending signer to status=sent', () => {
    const raw: RawESignatureEuSigner = {
      firstname: 'Bob',
      email: 'bob@example.com',
      status: 'pending',
    }
    const result = transformSigner(raw, 'env-42', '2')

    expect(result.status).toBe('sent')
    // routingOrder=2 from position "2"
    expect(result.routingOrder).toBe(2)
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a skipped signer to status=auto_responded', () => {
    const raw: RawESignatureEuSigner = { email: 'c@example.com', status: 'skipped' }
    const result = transformSigner(raw, 'env-1', '3')

    expect(result.status).toBe('auto_responded')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined signer to status=declined', () => {
    const raw: RawESignatureEuSigner = { email: 'd@example.com', status: 'declined' }
    const result = transformSigner(raw, 'env-1', '1')

    expect(result.status).toBe('declined')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('handles missing firstname/lastname gracefully', () => {
    const raw: RawESignatureEuSigner = { email: 'e@example.com' }
    const result = transformSigner(raw, 'env-1', '1')

    expect(result.name).toBe('')
    expect(result.status).toBe('created')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
