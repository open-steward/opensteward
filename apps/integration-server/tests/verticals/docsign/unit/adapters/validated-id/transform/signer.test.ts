import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/validated-id/transform/signer'
import type { RawValidatedIdSignerInfo } from '../../../../../../../src/verticals/docsign/adapters/validated-id/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('validated-id transformSigner', () => {
  const raw: RawValidatedIdSignerInfo = {
    SignerGUI: 'signer-gui-001',
    SignerName: 'Jane Doe',
    SignatureStatus: 'Unsigned',
    TypeOfID: 'NationalID',
    NumberID: 'ID-123456',
    OperationTime: '2024-03-15T09:00:00.000Z',
  }

  it('maps id from SignerGUI', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.id).toBe('signer-gui-001')
  })

  it('maps externalId from SignerGUI', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.externalId).toBe('signer-gui-001')
  })

  it('preserves envelopeId', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.envelopeId).toBe('env-001')
  })

  it('sets email to undefined (not available in info DTO)', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.email).toBeUndefined()
  })

  it('maps SignerName to name', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.name).toBe('Jane Doe')
  })

  it('sets role to signer', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.role).toBe('signer')
  })

  it('maps Unsigned SignatureStatus → sent', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.status).toBe('sent')
  })

  it('maps Signed SignatureStatus → signed', () => {
    const result = transformSigner({ ...raw, SignatureStatus: 'Signed' }, 'env-001')
    expect(result.status).toBe('signed')
  })

  it('maps Rejected SignatureStatus → declined', () => {
    const result = transformSigner({ ...raw, SignatureStatus: 'Rejected' }, 'env-001')
    expect(result.status).toBe('declined')
  })

  it('maps unknown SignatureStatus → created', () => {
    const result = transformSigner({ ...raw, SignatureStatus: 'SomethingElse' }, 'env-001')
    expect(result.status).toBe('created')
  })

  it('sets signedAt from OperationTime when signed', () => {
    const result = transformSigner({ ...raw, SignatureStatus: 'Signed' }, 'env-001')
    expect(result.signedAt).toBe('2024-03-15T09:00:00.000Z')
  })

  it('does not set signedAt when not signed', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.signedAt).toBeUndefined()
  })

  it('sets declinedAt from OperationTime when declined', () => {
    const result = transformSigner({ ...raw, SignatureStatus: 'Rejected' }, 'env-001')
    expect(result.declinedAt).toBe('2024-03-15T09:00:00.000Z')
  })

  it('does not set declinedAt when not declined', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.declinedAt).toBeUndefined()
  })

  it('maps RejectionReason to declineReason when declined', () => {
    const rejected: RawValidatedIdSignerInfo = {
      ...raw,
      SignatureStatus: 'Rejected',
      RejectionReason: 'Incorrect document',
    }
    const result = transformSigner(rejected, 'env-001')
    expect(result.declineReason).toBe('Incorrect document')
  })

  it('sets platform to validated-id', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.platform).toBe('validated-id')
  })

  it('surfaces typeOfId, numberId, and signatureStatus in metadata', () => {
    const result = transformSigner(raw, 'env-001')
    expect(result.metadata.typeOfId).toBe('NationalID')
    expect(result.metadata.numberId).toBe('ID-123456')
    expect(result.metadata.signatureStatus).toBe('Unsigned')
  })

  it('id and externalId are empty string when SignerGUI is absent', () => {
    const result = transformSigner({ ...raw, SignerGUI: undefined }, 'env-001')
    expect(result.id).toBe('')
    expect(result.externalId).toBe('')
  })

  it('passes SignerSchema.parse because email is undefined (not available in info DTO)', () => {
    // VIDsigner does not echo the signer email in the info DTO; we emit
    // undefined so the optional email field in SignerSchema is satisfied.
    const result = transformSigner(raw, 'env-001')
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
