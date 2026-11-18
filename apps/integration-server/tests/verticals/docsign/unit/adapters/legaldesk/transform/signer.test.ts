import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawLegaldeskSignerDetail,
} from '../../../../../../../src/verticals/docsign/adapters/legaldesk/transform/signer'
import type { RawLegaldeskTransaction } from '../../../../../../../src/verticals/docsign/adapters/legaldesk/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('legaldesk transformSigner', () => {
  const transaction: RawLegaldeskTransaction = {
    transaction_id: 'txn_001',
    status: 'in_progress',
  }

  const raw: RawLegaldeskSignerDetail = {
    signer_id: 'sig_1',
    signer_email: 'bob@example.com',
    signer_name: 'Bob Smith',
    status: 'signed',
    sign_order: 1,
    auth_mode: 'aadhaar',
    signed_at: '2025-03-05T12:00:00.000Z',
    sent_at: '2025-03-01T09:00:00.000Z',
  }

  it('maps signer_id to externalId', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.externalId).toBe('sig_1')
  })

  it('builds composite id from txnId:externalId', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.id).toBe('txn_001:sig_1')
  })

  it('maps signer_email to email', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.email).toBe('bob@example.com')
  })

  it('maps signer_name to name', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.name).toBe('Bob Smith')
  })

  it('maps signed status correctly', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.status).toBe('signed')
  })

  it('maps sign_order to routingOrder when > 0', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.routingOrder).toBe(1)
  })

  it('maps signedAt as ISO datetime', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.signedAt).toBe('2025-03-05T12:00:00.000Z')
  })

  it('maps sentAt as ISO datetime', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.sentAt).toBe('2025-03-01T09:00:00.000Z')
  })

  it('sets role to signer', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.role).toBe('signer')
  })

  it('sets platform to legaldesk', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(result.platform).toBe('legaldesk')
  })

  it('passes SignerSchema validation', () => {
    const result = transformSigner(raw, transaction, 0)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps declined status from rejected string', () => {
    const result = transformSigner({ ...raw, status: 'rejected' }, transaction, 0)
    expect(result.status).toBe('declined')
  })

  it('maps delivered status from viewed string', () => {
    const result = transformSigner({ ...raw, status: 'viewed' }, transaction, 0)
    expect(result.status).toBe('delivered')
  })

  it('falls back positional id when signer_id is absent', () => {
    const { signer_id: _, ...rest } = raw
    const result = transformSigner(rest, transaction, 2)
    expect(result.externalId).toBe('txn_001:2')
  })
})
