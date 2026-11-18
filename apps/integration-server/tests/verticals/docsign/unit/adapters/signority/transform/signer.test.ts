import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSignorityInvitation,
} from '../../../../../../../src/verticals/docsign/adapters/signority/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

// Signority status codes: 60=created, 61=sent, 62=delivered, 63=signed, 64=declined
// Signority actionType codes: 15=signer, 16=cc

const ENVELOPE_ID = 'env-55'

describe('signority transformSigner', () => {
  it('uses GUID as id when present', () => {
    const raw: RawSignorityInvitation = {
      id: 101,
      GUID: 'guid-alice',
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice',
      status: 61,
      actionType: 15,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('guid-alice')
    expect(result.externalId).toBe('guid-alice')
  })

  it('falls back to envelopeId:id when GUID absent', () => {
    const raw: RawSignorityInvitation = {
      id: 101,
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice',
      status: 61,
      actionType: 15,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('env-55:101')
  })

  it('maps envelopeId', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-alice',
      recipientEmail: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps recipientEmail and recipientName', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-alice',
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice Doe',
      status: 61,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Doe')
  })

  it('maps actionType 15 to signer role', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-alice',
      recipientEmail: 'alice@example.com',
      actionType: 15,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('signer')
  })

  it('maps actionType 16 to cc role', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-bob',
      recipientEmail: 'bob@example.com',
      actionType: 16,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('cc')
  })

  it('maps status 60 to created', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      status: 60,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('created')
  })

  it('maps status 61 to sent', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      status: 61,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('sent')
  })

  it('maps status 62 to delivered', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      status: 62,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('delivered')
  })

  it('maps status 63 to signed', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      status: 63,
      signedTime: 1708000000000,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
    expect(result.signedAt).toBe(new Date(1708000000000).toISOString())
  })

  it('maps status 64 to declined', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      status: 64,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('declined')
  })

  it('maps sequence to routingOrder', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      sequence: 2,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.routingOrder).toBe(2)
  })

  it('sets platform to signority', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.platform).toBe('signority')
  })

  it('puts actionType and status into metadata', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-a',
      recipientEmail: 'a@example.com',
      actionType: 15,
      status: 63,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.metadata.actionType).toBe('15')
    expect(result.metadata.status).toBe('63')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const raw: RawSignorityInvitation = {
      GUID: 'guid-alice',
      recipientEmail: 'alice@example.com',
      recipientName: 'Alice Doe',
      status: 63,
      actionType: 15,
      sequence: 1,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
