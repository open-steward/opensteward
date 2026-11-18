import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawFpSignWorkflow,
} from '../../../../../../../src/verticals/docsign/adapters/fp-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('fp-sign transformEnvelope', () => {
  const baseRaw: RawFpSignWorkflow = {
    id: 123,
    name: 'Partnership Agreement',
    comment: 'Please review carefully',
    state: 'waiting_for_input',
    workflowType: 'signing',
    workflowDirection: 'ltr',
    owner: {
      id: 55,
      email: 'owner@example.com',
      user: { id: 55, profile: { firstname: 'Jane', lastname: 'Doe' } },
    },
    dateCreated: '2025-05-15T08:00:00.000Z',
    dateModified: '2025-05-16T09:30:00.000Z',
  }

  it('maps id from raw.id', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.id).toBe('123')
    expect(result.externalId).toBe('123')
  })

  it('maps state "waiting_for_input" to status sent', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.status).toBe('sent')
  })

  it('maps state "created" to status draft', () => {
    const result = transformEnvelope({ ...baseRaw, state: 'created' })
    expect(result.status).toBe('draft')
  })

  it('maps state "finished" to status completed', () => {
    const result = transformEnvelope({ ...baseRaw, state: 'finished' })
    expect(result.status).toBe('completed')
  })

  it('maps state "rejected" to status declined', () => {
    const result = transformEnvelope({ ...baseRaw, state: 'rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps state "cancelled" to status voided', () => {
    const result = transformEnvelope({ ...baseRaw, state: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps state "failed" to status expired', () => {
    const result = transformEnvelope({ ...baseRaw, state: 'failed' })
    expect(result.status).toBe('expired')
  })

  it('maps name to subject', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.subject).toBe('Partnership Agreement')
  })

  it('maps comment to message', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.message).toBe('Please review carefully')
  })

  it('maps owner email to senderEmail', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderEmail).toBe('owner@example.com')
  })

  it('maps owner profile names to senderName', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.senderName).toBe('Jane Doe')
  })

  it('always sets signingOrder to sequential (FP Sign design)', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps dateCreated to createdAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.createdAt).toBe('2025-05-15T08:00:00.000Z')
  })

  it('maps dateModified to updatedAt', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.updatedAt).toBe('2025-05-16T09:30:00.000Z')
  })

  it('sets platform to fp-sign', () => {
    const result = transformEnvelope(baseRaw)
    expect(result.platform).toBe('fp-sign')
  })

  it('produces a schema-valid Envelope', () => {
    const result = transformEnvelope(baseRaw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
