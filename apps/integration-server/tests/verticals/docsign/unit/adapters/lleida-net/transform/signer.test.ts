import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawLleidaNetSignatory,
} from '../../../../../../../src/verticals/docsign/adapters/lleida-net/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('lleida-net transformSigner', () => {
  const raw: RawLleidaNetSignatory = {
    signatory_id: 10,
    level: 1,
    name: 'Alice',
    surname: 'Smith',
    email: 'alice@example.com',
    phone: '+34600000001',
    id_number: 'ID123',
    signatory_status: 'signed',
    signatory_status_date: 1700001000,
    signatory_landing_date: 1700000500,
    signatory_evidence_generated: 'yes',
    ip: '203.0.113.1',
    signature_method: ['otp', 'click'],
  }

  it('maps id as envelopeId:signatory_id composite', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.id).toBe('env_42:10')
  })

  it('maps externalId from signatory_id', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.externalId).toBe('10')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.envelopeId).toBe('env_42')
  })

  it('maps email from email field', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.email).toBe('alice@example.com')
  })

  it('falls back to signatory_email when email is absent', () => {
    const result = transformSigner(
      { ...raw, email: undefined, signatory_email: 'alice2@example.com' },
      'env_42',
    )
    expect(result.email).toBe('alice2@example.com')
  })

  it('maps name joined from name + surname', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.name).toBe('Alice Smith')
  })

  it('accepts signatory_name + signatory_surname alternate fields', () => {
    const result = transformSigner(
      {
        ...raw,
        name: undefined,
        surname: undefined,
        signatory_name: 'Bob',
        signatory_surname: 'Jones',
      },
      'env_42',
    )
    expect(result.name).toBe('Bob Jones')
  })

  it('maps role to signer', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.role).toBe('signer')
  })

  it('maps status signed → signed', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.status).toBe('signed')
  })

  it('maps status rejected → declined', () => {
    const result = transformSigner({ ...raw, signatory_status: 'rejected' }, 'env_42')
    expect(result.status).toBe('declined')
  })

  it('maps status opened → delivered', () => {
    const result = transformSigner({ ...raw, signatory_status: 'opened' }, 'env_42')
    expect(result.status).toBe('delivered')
  })

  it('maps status sent → sent', () => {
    const result = transformSigner({ ...raw, signatory_status: 'sent' }, 'env_42')
    expect(result.status).toBe('sent')
  })

  it('maps status expired → auto_responded', () => {
    const result = transformSigner({ ...raw, signatory_status: 'expired' }, 'env_42')
    expect(result.status).toBe('auto_responded')
  })

  it('maps routingOrder from level (positive int ≥ 1)', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when level is 0', () => {
    const result = transformSigner({ ...raw, level: 0 }, 'env_42')
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps deliveredAt from signatory_landing_date (epoch seconds)', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.deliveredAt).toBe(new Date(1700000500 * 1000).toISOString())
  })

  it('maps signedAt from signatory_status_date when signed', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.signedAt).toBe(new Date(1700001000 * 1000).toISOString())
  })

  it('does not set signedAt when not signed', () => {
    const result = transformSigner({ ...raw, signatory_status: 'sent' }, 'env_42')
    expect(result.signedAt).toBeUndefined()
  })

  it('includes phone and ip in metadata', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.metadata.phone).toBe('+34600000001')
    expect(result.metadata.ip).toBe('203.0.113.1')
  })

  it('includes signature_method joined as comma string in metadata', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.metadata.signature_method).toBe('otp,click')
  })

  it('sets platform to lleida-net', () => {
    const result = transformSigner(raw, 'env_42')
    expect(result.platform).toBe('lleida-net')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, 'env_42')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
