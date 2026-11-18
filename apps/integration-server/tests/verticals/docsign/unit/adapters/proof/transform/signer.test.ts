import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/proof/transform/signer'
import type { RawProofSigner } from '../../../../../../../src/verticals/docsign/adapters/proof/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('proof transformSigner', () => {
  const raw: RawProofSigner = {
    signer_id: 'sgn_001',
    external_id: 'ext_signer_1',
    email: 'bob@example.com',
    first_name: 'Bob',
    middle_name: 'J',
    last_name: 'Signer',
    phone_number: '+15550001234',
    signing_status: 'complete',
    order: 1,
    vesting_type: 'individual',
    notary_id: 'notary_99',
    link_expired: false,
  }

  const transactionId = 'txn_001'

  it('constructs id as transactionId:externalId', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.id).toBe('txn_001:sgn_001')
    expect(result.externalId).toBe('sgn_001')
  })

  it('maps email', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.email).toBe('bob@example.com')
  })

  it('builds full name from first/middle/last', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.name).toBe('Bob J Signer')
  })

  it('omits middle name when absent', () => {
    const result = transformSigner({ ...raw, middle_name: undefined }, transactionId)
    expect(result.name).toBe('Bob Signer')
  })

  it('maps complete signing_status to signed', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.status).toBe('signed')
  })

  it('maps declined signing_status to declined', () => {
    const result = transformSigner({ ...raw, signing_status: 'declined' }, transactionId)
    expect(result.status).toBe('declined')
  })

  it('maps viewed signing_status to delivered', () => {
    const result = transformSigner({ ...raw, signing_status: 'viewed' }, transactionId)
    expect(result.status).toBe('delivered')
  })

  it('maps sent signing_status to sent', () => {
    const result = transformSigner({ ...raw, signing_status: 'sent' }, transactionId)
    expect(result.status).toBe('sent')
  })

  it('always maps role to signer', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.role).toBe('signer')
  })

  it('maps routingOrder from order field', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.routingOrder).toBe(1)
  })

  it('sets platform to proof', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.platform).toBe('proof')
  })

  it('includes vestingType and notaryId in metadata', () => {
    const result = transformSigner(raw, transactionId)
    expect(result.metadata.vestingType).toBe('individual')
    expect(result.metadata.notaryId).toBe('notary_99')
  })

  it('falls back to email as externalId when signer_id is absent', () => {
    const result = transformSigner(
      { ...raw, signer_id: undefined, external_id: undefined },
      transactionId,
    )
    expect(result.externalId).toBe('bob@example.com')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, transactionId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
