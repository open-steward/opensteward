import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLleidaNetSignature,
} from '../../../../../../../src/verticals/docsign/adapters/lleida-net/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('lleida-net transformEnvelope', () => {
  const raw: RawLleidaNetSignature = {
    signature_id: 42,
    contract_id: 'ct_001',
    config_id: 7,
    config_name: 'Service Agreement',
    signature_type: 'click',
    signature_status: 'signed',
    // Click & Sign timestamps are Unix seconds
    signature_start_date: 1700000000,
    signature_status_date: 1700001000,
    signature_evidence_generated: 'yes',
    signatory: [
      { signatory_id: 10, level: 1, email: 'alice@example.com' },
      { signatory_id: 20, level: 2, email: 'bob@example.com' },
    ],
  }

  it('maps id and externalId from signature_id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps status signed → completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps status sent → sent', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'sent' })
    expect(result.status).toBe('sent')
  })

  it('maps status new → draft', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'new' })
    expect(result.status).toBe('draft')
  })

  it('maps status cancelled → voided', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps status expired → expired', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps status rejected → declined', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps subject from config_name', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('falls back to contract_id when config_name is absent', () => {
    const result = transformEnvelope({ ...raw, config_name: undefined })
    expect(result.subject).toBe('ct_001')
  })

  it('detects sequential order when signatories have distinct levels', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel order when signatories share the same level', () => {
    const result = transformEnvelope({
      ...raw,
      signatory: [
        { signatory_id: 10, level: 1, email: 'alice@example.com' },
        { signatory_id: 20, level: 1, email: 'bob@example.com' },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds sorted by level', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['10', '20'])
  })

  it('maps documentIds as empty array (no per-doc ids in Click & Sign)', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual([])
  })

  it('maps createdAt from signature_start_date (epoch seconds)', () => {
    const result = transformEnvelope(raw)
    // 1700000000 seconds → ISO string
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('maps completedAt from signature_status_date when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe(new Date(1700001000 * 1000).toISOString())
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'sent' })
    expect(result.completedAt).toBeUndefined()
  })

  it('sets sentAt for non-draft statuses', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'sent' })
    expect(result.sentAt).toBeDefined()
  })

  it('does not set sentAt for draft status', () => {
    const result = transformEnvelope({ ...raw, signature_status: 'new' })
    expect(result.sentAt).toBeUndefined()
  })

  it('sets platform to lleida-net', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('lleida-net')
  })

  it('includes metadata fields from raw', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.contract_id).toBe('ct_001')
    expect(result.metadata.config_name).toBe('Service Agreement')
    expect(result.metadata.signature_type).toBe('click')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
