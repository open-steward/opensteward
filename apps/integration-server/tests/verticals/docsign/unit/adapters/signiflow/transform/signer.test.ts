import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/signer'
import type { RawSigniFlowWorkStep } from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signiflow transformSigner', () => {
  it('maps a signed workstep to canonical Signer', () => {
    const raw: RawSigniFlowWorkStep = {
      WorkStepID: 10,
      WorkStepNumber: 1,
      EmailAddress: 'jane@example.com',
      FullName: 'Jane Doe',
      WorkStepStatus: 'signed',
      DateSigned: '2025-07-10T09:00:00.000Z',
      DateSent: '2025-07-08T08:00:00.000Z',
      DateViewed: '2025-07-09T11:00:00.000Z',
      Action: 'SignDocument',
    }
    const result = transformSigner(raw, 'doc-101', 0)

    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
    expect(result.envelopeId).toBe('doc-101')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2025-07-10T09:00:00.000Z')
    expect(result.sentAt).toBe('2025-07-08T08:00:00.000Z')
    expect(result.deliveredAt).toBe('2025-07-09T11:00:00.000Z')
    expect(result.platform).toBe('signiflow')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an approver workstep to role=approver', () => {
    const raw: RawSigniFlowWorkStep = {
      WorkStepID: 20,
      WorkStepNumber: 2,
      EmailAddress: 'approver@example.com',
      FullName: 'Bob Approver',
      WorkStepStatus: 'completed',
      Action: 'ApproveDocument',
    }
    const result = transformSigner(raw, 'doc-101', 1)

    expect(result.role).toBe('approver')
    expect(result.status).toBe('signed')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined workstep with decline reason', () => {
    const raw: RawSigniFlowWorkStep = {
      WorkStepID: 30,
      WorkStepNumber: 1,
      EmailAddress: 'decliner@example.com',
      FullName: 'Carol Decliner',
      WorkStepStatus: 'declined',
      DeclineReason: 'Not authorized',
    }
    const result = transformSigner(raw, 'doc-202', 0)

    expect(result.status).toBe('declined')
    expect(result.declineReason).toBe('Not authorized')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('constructs name from FirstName+LastName when FullName is absent', () => {
    const raw: RawSigniFlowWorkStep = {
      WorkStepID: 40,
      WorkStepNumber: 1,
      Email: 'first@example.com',
      FirstName: 'Alice',
      LastName: 'Wonder',
      WorkStepStatus: 'pending',
    }
    const result = transformSigner(raw, 'doc-303', 0)

    expect(result.name).toBe('Alice Wonder')
    expect(result.email).toBe('first@example.com')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
