import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSigniFlowDocument,
} from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signiflow transformEnvelope', () => {
  it('maps a completed document with sequential worksteps to canonical Envelope', () => {
    const raw: RawSigniFlowDocument = {
      DocID: 101,
      DocName: 'Lease Agreement',
      Subject: 'Please review and sign',
      Message: 'Hello, please sign.',
      WorkflowStatus: 'completed',
      OwnerEmail: 'owner@example.com',
      OwnerName: 'Company Owner',
      OwnerUserID: 'u-1',
      TemplateID: 'tmpl-1',
      DateCreated: '2025-06-01T08:00:00.000Z',
      DateCompleted: '2025-06-10T14:00:00.000Z',
      DateModified: '2025-06-10T14:00:00.000Z',
      WorkSteps: [
        { WorkStepID: 1, WorkStepNumber: 1, EmailAddress: 'signer1@example.com' },
        { WorkStepID: 2, WorkStepNumber: 2, EmailAddress: 'signer2@example.com' },
      ],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('101')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Please review and sign')
    expect(result.message).toBe('Hello, please sign.')
    expect(result.senderEmail).toBe('owner@example.com')
    expect(result.senderName).toBe('Company Owner')
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['1', '2'])
    expect(result.documentIds).toEqual(['101'])
    expect(result.completedAt).toBe('2025-06-10T14:00:00.000Z')
    expect(result.templateId).toBe('tmpl-1')
    expect(result.platform).toBe('signiflow')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending document with parallel worksteps (same order)', () => {
    const raw: RawSigniFlowDocument = {
      DocID: 202,
      WorkflowStatus: 'pending',
      WorkSteps: [
        { WorkStepID: 10, WorkStepNumber: 1 },
        { WorkStepID: 11, WorkStepNumber: 1 },
      ],
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled status to voided via DateCancelled', () => {
    const raw: RawSigniFlowDocument = {
      DocID: 303,
      DocStatus: 'cancelled',
      DateCancelled: '2025-06-05T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2025-06-05T10:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses Workflow array when WorkSteps is absent', () => {
    const raw: RawSigniFlowDocument = {
      DocID: 404,
      WorkflowStatus: 'action_required',
      Workflow: [{ WorkStepID: 50, WorkStepNumber: 1 }],
    }
    const result = transformEnvelope(raw)

    expect(result.signerIds).toEqual(['50'])
    expect(result.status).toBe('sent')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
