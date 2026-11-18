import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawInsignSession,
} from '../../../../../../../src/verticals/docsign/adapters/insign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const base: RawInsignSession = {
  sessionid: 'sess-001',
  displayname: 'Contract Signing',
  displaycustomer: 'Acme Corp',
  tan: 'ABC123',
  userid: 'user-7',
  fullName: 'Bob Builder',
  modifiedTimestamp: 1735689600000, // epoch-millis → 2025-01-01T00:00:00.000Z
  completed: true,
  status: 'completed',
  processStep: 'completed',
  extern: false,
  numberOfSignaturesNeeded: 2,
  numberOfSignaturesNeededDone: 2,
  documentData: [
    { docid: 'doc-1', displayname: 'NDA.pdf' },
    { docid: 'doc-2', displayname: 'Addendum.pdf' },
  ],
  signaturFieldsStatusList: [{ fieldID: 'f1', role: 'signer1', signed: true, mandatory: true }],
}

describe('insign transformEnvelope', () => {
  it('maps id and externalId from sessionid', () => {
    const result = transformEnvelope(base, 'fallback-id')
    expect(result.id).toBe('sess-001')
    expect(result.externalId).toBe('sess-001')
  })

  it('falls back to provided sessionId when sessionid is absent', () => {
    const result = transformEnvelope({ ...base, sessionid: null }, 'fallback-99')
    expect(result.id).toBe('fallback-99')
  })

  it('maps subject from displayname', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.subject).toBe('Contract Signing')
  })

  it('maps senderId and senderName', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.senderId).toBe('user-7')
    expect(result.senderName).toBe('Bob Builder')
  })

  it('maps completed=true to status completed', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.status).toBe('completed')
  })

  it('maps gdprDeclined=true to status declined', () => {
    const result = transformEnvelope({ ...base, completed: false, gdprDeclined: true }, 'sess-001')
    expect(result.status).toBe('declined')
  })

  it('maps dsgvoDeclined=true to status declined', () => {
    const result = transformEnvelope({ ...base, completed: false, dsgvoDeclined: true }, 'sess-001')
    expect(result.status).toBe('declined')
  })

  it('maps extern=true to status sent', () => {
    const result = transformEnvelope(
      {
        ...base,
        completed: false,
        sucessfullyCompleted: false,
        gdprDeclined: false,
        dsgvoDeclined: false,
        // 'active' does not include any short-circuit substrings
        status: 'active',
        processStep: 'signing',
        extern: true,
      },
      'sess-001',
    )
    expect(result.status).toBe('sent')
  })

  it('maps processStep=configured to draft', () => {
    const result = transformEnvelope(
      {
        ...base,
        completed: false,
        sucessfullyCompleted: false,
        gdprDeclined: false,
        dsgvoDeclined: false,
        // 'active' does not include any short-circuit substrings
        status: 'active',
        processStep: 'configured',
        extern: false,
      },
      'sess-001',
    )
    expect(result.status).toBe('draft')
  })

  it('maps status string including "abort" to voided', () => {
    const result = transformEnvelope(
      {
        ...base,
        completed: false,
        status: 'aborted',
      },
      'sess-001',
    )
    expect(result.status).toBe('voided')
  })

  it('sets signingOrder to parallel (always)', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.signingOrder).toBe('parallel')
  })

  it('collects documentIds from documentData', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
  })

  it('builds signerIds from signaturFieldsStatusList roles', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.signerIds).toEqual(['sess-001:signer1'])
  })

  it('maps updatedAt from modifiedTimestamp epoch-millis', () => {
    const result = transformEnvelope(base, 'sess-001')
    // toIsoDatetime treats >9_999_999_999 as epoch-millis
    expect(result.updatedAt).toBeDefined()
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('maps completedAt from modifiedTimestamp when completed=true', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.completedAt).toBeDefined()
  })

  it('does not set completedAt when completed=false', () => {
    const result = transformEnvelope({ ...base, completed: false }, 'sess-001')
    expect(result.completedAt).toBeUndefined()
  })

  it('sets platform to insign', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.platform).toBe('insign')
  })

  it('stores tan and processStep in metadata', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.metadata['tan']).toBe('ABC123')
    expect(result.metadata['processStep']).toBe('completed')
  })

  it('stores customer in metadata', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(result.metadata['customer']).toBe('Acme Corp')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(base, 'sess-001')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input gracefully', () => {
    const result = transformEnvelope({}, 'fallback-min')
    expect(result.id).toBe('fallback-min')
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
