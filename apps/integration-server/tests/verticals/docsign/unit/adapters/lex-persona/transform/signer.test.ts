import { describe, it, expect } from 'vitest'
import {
  signersOf,
  transformSigner,
} from '../../../../../../../src/verticals/docsign/adapters/lex-persona/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { workflow } from '../fixtures'

describe('lex-persona transformSigner (Goodflag step recipient)', () => {
  it('maps one recipient to a schema-valid Signer', () => {
    const wf = workflow()
    const step = wf.steps[1]!
    const s = SignerSchema.parse(transformSigner(step.recipients[0]!, step, 1, wf))
    expect(s.id).toBe('stp_B:bob@example.com')
    expect(s.externalId).toBe('stp_B:bob@example.com')
    expect(s.envelopeId).toBe('wfl_1')
    expect(s.email).toBe('bob@example.com')
    expect(s.name).toBe('Bob Durand')
    expect(s.role).toBe('signer')
    expect(s.status).toBe('sent')
    expect(s.routingOrder).toBe(2)
    expect(s.metadata).toMatchObject({
      stepId: 'stp_B',
      consentPageId: 'cop_Default',
      country: 'FR',
    })
    expect(s.platform).toBe('lex-persona')
  })

  it('reads every step, maps approval steps to approvers, and derives only documented status', () => {
    const all = signersOf(workflow()).map((s) => SignerSchema.parse(s))
    expect(all.map((s) => [s.id, s.role, s.status, s.routingOrder])).toEqual([
      // Started step, not a current recipient: its outcome is not documented.
      ['stp_A:alice@example.com', 'approver', 'unknown', 1],
      // In currentRecipientEmails: invited.
      ['stp_B:bob@example.com', 'signer', 'sent', 2],
      ['stp_B:carol@example.com', 'signer', 'unknown', 2],
      // Step not started: nothing sent yet.
      ['stp_C:dave@example.com', 'signer', 'created', 3],
    ])
  })
})
