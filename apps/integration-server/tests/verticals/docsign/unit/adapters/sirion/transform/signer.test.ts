import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSirionSignatory,
} from '../../../../../../../src/verticals/docsign/adapters/sirion/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const ENVELOPE_ID = 'ctr-sirion-1'

describe('sirion transformSigner', () => {
  it('uses signatoryId as id', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      displayName: 'Alice Doe',
      status: 'SENT',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('sig-alice')
    expect(result.externalId).toBe('sig-alice')
  })

  it('falls back to emailId when signatoryId absent', () => {
    const raw: RawSirionSignatory = {
      emailId: 'alice@example.com',
      status: 'SENT',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.id).toBe('alice@example.com')
  })

  it('maps envelopeId', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps emailId to email', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBe('alice@example.com')
  })

  it('falls back to email field when emailId absent', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      email: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps displayName to name', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      displayName: 'Alice Doe',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('falls back to name field when displayName absent', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      name: 'Alice Doe',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.name).toBe('Alice Doe')
  })

  it('maps CC role', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-cc',
      emailId: 'cc@example.com',
      role: 'CC',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('cc')
  })

  it('maps WITNESS role', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-w',
      emailId: 'w@example.com',
      role: 'WITNESS',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('witness')
  })

  it('maps APPROVER role', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-a',
      emailId: 'a@example.com',
      role: 'APPROVER',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('approver')
  })

  it('maps EDITOR role', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-e',
      emailId: 'e@example.com',
      role: 'EDITOR',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('editor')
  })

  it('defaults to signer role for unknown role', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.role).toBe('signer')
  })

  it('maps SIGNED status to signed', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'SIGNED',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('signed')
  })

  it('maps DECLINED status to declined', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'DECLINED',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('declined')
  })

  it('maps VIEWED status to delivered', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'VIEWED',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('delivered')
  })

  it('maps SENT status to sent', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'SENT',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('sent')
  })

  it('maps AUTO_RESPONDED status to auto_responded', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'AUTO_RESPONDED',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('auto_responded')
  })

  it('defaults status to created for unknown status', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'UNKNOWN_XYZ',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.status).toBe('created')
  })

  it('maps signingOrder > 0 to routingOrder', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      signingOrder: 2,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.routingOrder).toBe(2)
  })

  it('leaves routingOrder undefined when signingOrder is 0', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      signingOrder: 0,
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps signedOn to signedAt', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'SIGNED',
      signedOn: '2024-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.signedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('maps declinedOn and declineReason', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-bob',
      emailId: 'bob@example.com',
      status: 'DECLINED',
      declinedOn: '2024-01-20T09:00:00.000Z',
      declineReason: 'Awaiting legal review',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.declinedAt).toBe('2024-01-20T09:00:00.000Z')
    expect(result.declineReason).toBe('Awaiting legal review')
  })

  it('maps deliveredOn to deliveredAt', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      status: 'DELIVERED',
      deliveredOn: '2024-01-16T10:00:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.deliveredAt).toBe('2024-01-16T10:00:00.000Z')
  })

  it('sets platform to sirion', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.platform).toBe('sirion')
  })

  it('puts partyType into metadata', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      partyType: 'COUNTERPARTY',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(result.metadata.partyType).toBe('COUNTERPARTY')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const raw: RawSirionSignatory = {
      signatoryId: 'sig-alice',
      emailId: 'alice@example.com',
      displayName: 'Alice Doe',
      status: 'SIGNED',
      signingOrder: 1,
      signedOn: '2024-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, ENVELOPE_ID)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
