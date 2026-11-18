import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawTilakaSignature,
} from '../../../../../../../src/verticals/docsign/adapters/tilaka/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('tilaka transformSigner', () => {
  const raw: RawTilakaSignature = {
    tilaka_name: 'john_doe',
    signing_id: 'sid-001',
    email: 'john.doe@example.com',
    name: 'John Doe',
    status: 'signed',
    sequence: 1,
    signed_date: '2024-03-10T12:00:00.000Z',
    pages: 3,
  }

  it('sets externalId to tilaka_name', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.externalId).toBe('john_doe')
  })

  it('composes id from envelopeId and tilaka_name', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.id).toBe('req-001:john_doe')
  })

  it('preserves envelopeId', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.envelopeId).toBe('req-001')
  })

  it('maps email from raw.email', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.email).toBe('john.doe@example.com')
  })

  it('maps name from raw.name', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.name).toBe('John Doe')
  })

  it('sets role to signer', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.role).toBe('signer')
  })

  it('maps signed status → signed', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.status).toBe('signed')
  })

  it('maps done status → signed', () => {
    const result = transformSigner({ ...raw, status: 'done' }, 'req-001')
    expect(result.status).toBe('signed')
  })

  it('maps denied status → declined', () => {
    const result = transformSigner({ ...raw, status: 'denied' }, 'req-001')
    expect(result.status).toBe('declined')
  })

  it('maps delivered status → delivered', () => {
    const result = transformSigner({ ...raw, status: 'delivered' }, 'req-001')
    expect(result.status).toBe('delivered')
  })

  it('maps pending status → sent', () => {
    const result = transformSigner({ ...raw, status: 'pending' }, 'req-001')
    expect(result.status).toBe('sent')
  })

  it('maps unknown status → created', () => {
    const result = transformSigner({ ...raw, status: 'unknown_state' }, 'req-001')
    expect(result.status).toBe('created')
  })

  it('maps signed_date to signedAt when signed', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.signedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('does not set signedAt when not signed', () => {
    const result = transformSigner({ ...raw, status: 'pending' }, 'req-001')
    expect(result.signedAt).toBeUndefined()
  })

  it('falls back to sign_date when signed_date is absent', () => {
    const altDates: RawTilakaSignature = {
      ...raw,
      signed_date: undefined,
      sign_date: '2024-03-11T08:00:00.000Z',
    }
    const result = transformSigner(altDates, 'req-001')
    expect(result.signedAt).toBe('2024-03-11T08:00:00.000Z')
  })

  it('maps sequence to routingOrder', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.routingOrder).toBe(1)
  })

  it('sets deny_reason as declineReason when declined', () => {
    const declined: RawTilakaSignature = {
      ...raw,
      status: 'denied',
      deny_reason: 'Terms too vague',
    }
    const result = transformSigner(declined, 'req-001')
    expect(result.declineReason).toBe('Terms too vague')
  })

  it('falls back to reason when deny_reason is absent and declined', () => {
    const declined: RawTilakaSignature = {
      ...raw,
      status: 'denied',
      deny_reason: undefined,
      reason: 'No capacity',
    }
    const result = transformSigner(declined, 'req-001')
    expect(result.declineReason).toBe('No capacity')
  })

  it('sets platform to tilaka', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.platform).toBe('tilaka')
  })

  it('surfaces tilaka_name, signing_id, status, and pages in metadata', () => {
    const result = transformSigner(raw, 'req-001')
    expect(result.metadata.tilaka_name).toBe('john_doe')
    expect(result.metadata.signing_id).toBe('sid-001')
    expect(result.metadata.status).toBe('signed')
    expect(result.metadata.pages).toBe('3')
  })

  it('falls back to user_identifier for externalId when tilaka_name is absent', () => {
    const noName: RawTilakaSignature = { ...raw, tilaka_name: undefined, user_identifier: 'uid-x' }
    const result = transformSigner(noName, 'req-001')
    expect(result.externalId).toBe('uid-x')
  })

  it('falls back to signing_id for externalId when tilaka_name and user_identifier absent', () => {
    const noUser: RawTilakaSignature = {
      ...raw,
      tilaka_name: undefined,
      user_identifier: undefined,
    }
    const result = transformSigner(noUser, 'req-001')
    expect(result.externalId).toBe('sid-001')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, 'req-001')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
