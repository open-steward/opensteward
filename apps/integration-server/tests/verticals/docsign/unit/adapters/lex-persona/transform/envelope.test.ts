import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/lex-persona/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { workflow } from '../fixtures'

describe('lex-persona transformEnvelope (Goodflag Workflow)', () => {
  it('maps a documented Workflow to a schema-valid Envelope', () => {
    const env = EnvelopeSchema.parse(transformEnvelope(workflow()))
    expect(env.id).toBe('wfl_1')
    expect(env.externalId).toBe('wfl_1')
    expect(env.status).toBe('sent')
    expect(env.subject).toBe('Contrat de prestation')
    expect(env.message).toBe('Merci de signer')
    expect(env.senderId).toBe('usr_1')
    expect(env.senderEmail).toBe('owner@example.com')
    expect(env.senderName).toBe('Olivia Admin')
    expect(env.signingOrder).toBe('sequential')
    expect(env.signerIds).toEqual([
      'stp_A:alice@example.com',
      'stp_B:bob@example.com',
      'stp_B:carol@example.com',
      'stp_C:dave@example.com',
    ])
    expect(env.documentIds).toEqual([])
    expect(env.templateId).toBe('wtm_1')
    // Timestamps are milliseconds since the epoch.
    expect(env.createdAt).toBe(new Date(1783777360803).toISOString())
    expect(env.updatedAt).toBe(new Date(1783777460803).toISOString())
    expect(env.sentAt).toBe(new Date(1783777400000).toISOString())
    expect(env.completedAt).toBeUndefined()
    expect(env.platform).toBe('lex-persona')
    expect(env.metadata.workflowMode).toBe('FULL')
  })

  it('maps each documented workflowStatus', () => {
    const cases: Array<[Parameters<typeof workflow>[0], string]> = [
      [{ workflowStatus: 'draft' }, 'draft'],
      [{ workflowStatus: 'started' }, 'sent'],
      [{ workflowStatus: 'finished' }, 'completed'],
      [{ workflowStatus: 'archived' }, 'completed'],
      [{ workflowStatus: 'stopped' }, 'unknown'],
    ]
    for (const [o, want] of cases) {
      expect(EnvelopeSchema.parse(transformEnvelope(workflow(o))).status).toBe(want)
    }
  })

  it('a single step is parallel', () => {
    const one = workflow()
    const env = EnvelopeSchema.parse(transformEnvelope({ ...one, steps: [one.steps[1]!] }))
    expect(env.signingOrder).toBe('parallel')
  })

  it('reads finished as completedAt', () => {
    const env = EnvelopeSchema.parse(
      transformEnvelope(workflow({ workflowStatus: 'finished', finished: 1783777500000 })),
    )
    expect(env.completedAt).toBe(new Date(1783777500000).toISOString())
  })
})
