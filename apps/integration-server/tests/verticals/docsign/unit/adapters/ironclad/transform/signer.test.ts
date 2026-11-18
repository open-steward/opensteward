import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawIroncladSigner,
} from '../../../../../../../src/verticals/docsign/adapters/ironclad/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const baseSigner: RawIroncladSigner = {
  name: 'Alice Example',
  email: 'alice@example.com',
  roleName: 'Counterparty',
  status: 'sent',
  type: 'external',
  routingOrder: 1,
  isWetSigned: false,
  userId: 'u-alice',
}

describe('ironclad transformSigner', () => {
  it('maps id and externalId from userId', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.id).toBe('u-alice')
    expect(result.externalId).toBe('u-alice')
  })

  it('falls back to email as externalId when userId absent', () => {
    const { userId, ...noId } = baseSigner
    const result = transformSigner(noId, 'wf-1')
    expect(result.externalId).toBe('alice@example.com')
  })

  it('maps envelopeId from second argument', () => {
    const result = transformSigner(baseSigner, 'wf-42')
    expect(result.envelopeId).toBe('wf-42')
  })

  it('maps email from email field', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.name).toBe('Alice Example')
  })

  it('sets role to signer', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.role).toBe('signer')
  })

  it('maps status=sent to sent', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.status).toBe('sent')
  })

  it('maps status=signed to signed', () => {
    const result = transformSigner({ ...baseSigner, status: 'signed' }, 'wf-1')
    expect(result.status).toBe('signed')
  })

  it('maps status=declined to declined', () => {
    const result = transformSigner({ ...baseSigner, status: 'declined' }, 'wf-1')
    expect(result.status).toBe('declined')
  })

  it('maps status=viewed to delivered', () => {
    const result = transformSigner({ ...baseSigner, status: 'viewed' }, 'wf-1')
    expect(result.status).toBe('delivered')
  })

  it('maps status=pending to created', () => {
    const result = transformSigner({ ...baseSigner, status: 'pending' }, 'wf-1')
    expect(result.status).toBe('created')
  })

  it('maps unknown status to created', () => {
    const result = transformSigner({ ...baseSigner, status: 'something_else' }, 'wf-1')
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from routingOrder (1-indexed, ≥1 required)', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.routingOrder).toBe(1)
  })

  it('omits routingOrder when value is 0 (wet signature sentinel)', () => {
    const result = transformSigner({ ...baseSigner, routingOrder: 0 }, 'wf-1')
    expect(result.routingOrder).toBeUndefined()
  })

  it('omits routingOrder when value is -1 (wet signature)', () => {
    const result = transformSigner({ ...baseSigner, routingOrder: -1 }, 'wf-1')
    expect(result.routingOrder).toBeUndefined()
  })

  it('sets platform to ironclad', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.platform).toBe('ironclad')
  })

  it('stores roleName and type in metadata', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.metadata['roleName']).toBe('Counterparty')
    expect(result.metadata['type']).toBe('external')
  })

  it('stores isWetSigned in metadata', () => {
    const result = transformSigner({ ...baseSigner, isWetSigned: true }, 'wf-1')
    expect(result.metadata['isWetSigned']).toBe('true')
  })

  it('stores userId in metadata', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(result.metadata['userId']).toBe('u-alice')
  })

  it('passes SignerSchema validation', () => {
    const result = transformSigner(baseSigner, 'wf-1')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('passes SignerSchema validation when email is absent (email becomes undefined)', () => {
    const result = transformSigner({ ...baseSigner, email: undefined }, 'wf-1')
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
