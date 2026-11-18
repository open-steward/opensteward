import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signzy/transform/signer'
import type { RawSignzySigner } from '../../../../../../../src/verticals/docsign/adapters/signzy/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const ENVELOPE_ID = 'ctr-xyz-123'

describe('signzy transformSigner', () => {
  it('uses signerid as id and externalId', () => {
    const raw: RawSignzySigner = {
      signerid: 'signer-001',
      signername: 'Alice Doe',
      status: 'pending',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('signer-001')
    expect(result.externalId).toBe('signer-001')
  })

  it('falls back to envelopeId:unknown when signerid absent', () => {
    const raw: RawSignzySigner = { signername: 'Alice Doe', status: 'pending' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('ctr-xyz-123:unknown')
  })

  it('maps envelopeId', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('emits undefined for email (not surfaced by Signzy pull-contract response)', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', signername: 'Alice Doe' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBeUndefined()
  })

  it('maps signername to name', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', signername: 'Alice Doe' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('always emits signer role', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('signer')
  })

  it('maps status success to signed', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'success' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
  })

  it('maps status signed to signed', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'signed' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
  })

  it('maps status completed to signed', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'completed' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
  })

  it('maps status fail to declined', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'fail' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('declined')
  })

  it('maps status pending to sent', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'pending' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('sent')
  })

  it('maps unknown status to created', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'unknown_state' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('created')
  })

  it('maps contractlastsigntime to signedAt ISO', () => {
    const raw: RawSignzySigner = {
      signerid: 'signer-002',
      status: 'success',
      contractlastsigntime: '2024-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.signedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('maps errormessage to declineReason', () => {
    const raw: RawSignzySigner = {
      signerid: 'signer-001',
      status: 'fail',
      errormessage: 'Aadhaar verification failed',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.declineReason).toBe('Aadhaar verification failed')
  })

  it('puts signaturetype and aadhaarstatus into metadata', () => {
    const raw: RawSignzySigner = {
      signerid: 'signer-001',
      status: 'success',
      signaturetype: 'aadhaar',
      aadhaarstatus: 'verified',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.metadata.signaturetype).toBe('aadhaar')
    expect(result.metadata.aadhaarstatus).toBe('verified')
  })

  it('sets platform to signzy', () => {
    const raw: RawSignzySigner = { signerid: 'signer-001', status: 'pending' }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.platform).toBe('signzy')
  })

  it('emits undefined for email and passes SignerSchema.parse', () => {
    // Signzy pull-contract response does not echo back signer email; we emit
    // undefined so the optional email field in SignerSchema is satisfied.
    const raw: RawSignzySigner = {
      signerid: 'signer-001',
      signername: 'Alice Doe',
      status: 'pending',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
