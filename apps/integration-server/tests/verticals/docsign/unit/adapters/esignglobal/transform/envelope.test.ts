import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawEsignglobalEnvelope,
} from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('esignglobal transformEnvelope', () => {
  it('maps a completed envelope with sequential signers and documents', () => {
    // eSignGlobal uses epoch milliseconds for timestamps
    const raw: RawEsignglobalEnvelope = {
      envelopeId: 'env-001',
      envelopeStatus: 2, // 2 = Completed
      subject: 'Master Services Agreement',
      remark: 'Please sign ASAP',
      envelopeCreateTime: 1693974363460,
      envelopeEndTime: 1694060763460,
      initiatorInfo: { userName: 'Olivia Admin' },
      signerInfos: [
        {
          businessId: 'biz-1',
          userEmail: 'alice@example.com',
          userName: 'Alice',
          signOrder: 1,
          signerStatus: 2, // Signed
          signDate: 1694060763000,
        },
        {
          businessId: 'biz-2',
          userEmail: 'bob@example.com',
          userName: 'Bob',
          signOrder: 2,
          signerStatus: 0, // Pending
        },
      ],
      signFiles: [{ fileKey: 'fk-abc', fileName: 'contract.pdf' }],
      attachments: [],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('env-001')
    expect(result.externalId).toBe('env-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Master Services Agreement')
    expect(result.message).toBe('Please sign ASAP')
    expect(result.senderName).toBe('Olivia Admin')
    // different signOrders → sequential
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['env-001:1:biz-1', 'env-001:2:biz-2'])
    expect(result.documentIds).toEqual(['env-001:fk-abc'])
    // completedAt set because status=completed
    expect(result.completedAt).toBeDefined()
    expect(result.voidedAt).toBeUndefined()
    expect(result.platform).toBe('esignglobal')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status=0 → draft', () => {
    const raw: RawEsignglobalEnvelope = {
      envelopeId: 'env-002',
      envelopeStatus: 0,
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('draft')
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status=5 → voided with voidedAt set', () => {
    const raw: RawEsignglobalEnvelope = {
      envelopeId: 'env-003',
      envelopeStatus: 5, // Revoked
      envelopeEndTime: 1694060763460,
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBeDefined()
    expect(result.completedAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status=4 → declined with declinedAt set', () => {
    const raw: RawEsignglobalEnvelope = {
      envelopeId: 'env-004',
      envelopeStatus: 4, // Rejected
      envelopeEndTime: 1694060763460,
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBeDefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('detects parallel when all signers share the same signOrder', () => {
    const raw: RawEsignglobalEnvelope = {
      envelopeId: 'env-005',
      envelopeStatus: 1,
      signerInfos: [
        { userEmail: 'a@example.com', signOrder: 1 },
        { userEmail: 'b@example.com', signOrder: 1 },
      ],
    }
    const result = transformEnvelope(raw)

    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
