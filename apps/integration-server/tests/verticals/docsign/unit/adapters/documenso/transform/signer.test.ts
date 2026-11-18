import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawDocumensoRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('documenso transformSigner', () => {
  it('maps a SIGNED recipient', () => {
    const raw: RawDocumensoRecipient = {
      id: 1,
      documentId: 42,
      email: 'alice@example.com',
      name: 'Alice',
      role: 'SIGNER',
      signingOrder: 1,
      signingStatus: 'SIGNED',
      signedAt: '2025-01-05T00:00:00.000Z',
      readStatus: 'OPENED',
      sendStatus: 'SENT',
    }
    const result = transformSigner(raw, '42')

    expect(result.id).toBe('1')
    expect(result.externalId).toBe('1')
    expect(result.envelopeId).toBe('42')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    // signingOrder 1 → routingOrder 1
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2025-01-05T00:00:00.000Z')
    expect(result.platform).toBe('documenso')
    expect(result.metadata.signingStatus).toBe('SIGNED')
    expect(result.metadata.readStatus).toBe('OPENED')
    expect(result.metadata.sendStatus).toBe('SENT')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED (declined) recipient', () => {
    const raw: RawDocumensoRecipient = {
      id: 2,
      email: 'bob@example.com',
      name: 'Bob',
      role: 'SIGNER',
      signingStatus: 'REJECTED',
      // signedAt is reused as declinedAt for REJECTED
      signedAt: '2025-01-06T00:00:00.000Z',
      readStatus: 'OPENED',
      sendStatus: 'SENT',
    }
    const result = transformSigner(raw, '42')

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-01-06T00:00:00.000Z')
    // signedAt should be undefined when REJECTED
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a CC role', () => {
    const raw: RawDocumensoRecipient = {
      id: 3,
      email: 'cc@example.com',
      name: 'Charlie CC',
      role: 'CC',
      signingStatus: 'NOT_SIGNED',
      readStatus: 'NOT_OPENED',
      sendStatus: 'SENT',
    }
    const result = transformSigner(raw, '42')

    expect(result.role).toBe('cc')
    // SENT sendStatus → 'sent'
    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a VIEWER role to cc', () => {
    const raw: RawDocumensoRecipient = {
      id: 4,
      email: 'viewer@example.com',
      name: 'Dave Viewer',
      role: 'VIEWER',
      signingStatus: 'NOT_SIGNED',
      readStatus: 'OPENED',
      sendStatus: 'SENT',
    }
    const result = transformSigner(raw, '42')

    expect(result.role).toBe('cc')
    // OPENED readStatus → 'delivered'
    expect(result.status).toBe('delivered')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an APPROVER role', () => {
    const raw: RawDocumensoRecipient = {
      id: 5,
      email: 'approver@example.com',
      name: 'Eve Approver',
      role: 'APPROVER',
      signingStatus: 'NOT_SIGNED',
      readStatus: 'NOT_OPENED',
      sendStatus: 'NOT_SENT',
    }
    const result = transformSigner(raw, '42')

    expect(result.role).toBe('approver')
    expect(result.status).toBe('created')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps ASSISTANT role to editor', () => {
    const raw: RawDocumensoRecipient = {
      id: 6,
      email: 'asst@example.com',
      name: 'Frank Asst',
      role: 'ASSISTANT',
      signingStatus: 'NOT_SIGNED',
      readStatus: 'NOT_OPENED',
      sendStatus: 'NOT_SENT',
    }
    const result = transformSigner(raw, '55')

    expect(result.role).toBe('editor')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('does not set routingOrder when signingOrder is 0 or absent', () => {
    const raw: RawDocumensoRecipient = {
      id: 7,
      email: 'g@example.com',
      name: 'Grace',
      role: 'SIGNER',
      signingOrder: 0,
      signingStatus: 'NOT_SIGNED',
      readStatus: 'NOT_OPENED',
      sendStatus: 'NOT_SENT',
    }
    const result = transformSigner(raw, '60')

    // signingOrder 0 is < 1 so routingOrder should be undefined
    expect(result.routingOrder).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
