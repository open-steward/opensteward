import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLegalesignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/legalesign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('legalesign transformEnvelope', () => {
  const raw: RawLegalesignDocument = {
    uuid: 'abc-123',
    name: 'Partnership Agreement',
    status: 30,
    created: '2025-04-01T08:00:00.000Z',
    modified: '2025-04-10T14:00:00.000Z',
    sign_time: '2025-04-10T14:00:00.000Z',
    signers_in_order: true,
    user: '/api/v1/user/usr-99/',
    signer_objects: [
      { uuid: 'signer-a', status: 40, order: 0 },
      { uuid: 'signer-b', status: 40, order: 1 },
    ],
  }

  it('maps uuid to id and externalId', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('abc-123')
    expect(result.externalId).toBe('abc-123')
  })

  it('maps status 30 to completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps name to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Partnership Agreement')
  })

  it('extracts senderId from user resource URI', () => {
    const result = transformEnvelope(raw)
    expect(result.senderId).toBe('usr-99')
  })

  it('maps signerIds sorted by order from signer_objects', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['signer-a', 'signer-b'])
  })

  it('sets documentIds to [uuid] (single composed PDF)', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['abc-123'])
  })

  it('maps signers_in_order=true to sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps signers_in_order=false to parallel', () => {
    const result = transformEnvelope({ ...raw, signers_in_order: false })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps createdAt from created field', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2025-04-01T08:00:00.000Z')
  })

  it('sets completedAt from sign_time when status is 30', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2025-04-10T14:00:00.000Z')
  })

  it('does not set completedAt when status is not 30', () => {
    const result = transformEnvelope({ ...raw, status: 10 })
    expect(result.completedAt).toBeUndefined()
  })

  it('sets platform to legalesign', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('legalesign')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status 40 to voided and sets voidedAt', () => {
    const result = transformEnvelope({ ...raw, status: 40 })
    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2025-04-10T14:00:00.000Z')
  })

  it('maps status 50 to declined and sets declinedAt', () => {
    const result = transformEnvelope({ ...raw, status: 50 })
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-04-10T14:00:00.000Z')
  })

  it('maps status 10 with unsent signers to draft', () => {
    const result = transformEnvelope({
      ...raw,
      status: 10,
      signer_objects: [{ uuid: 'signer-x', status: 4, order: 0 }],
    })
    expect(result.status).toBe('draft')
  })

  it('maps status 10 with sent signers to sent', () => {
    const result = transformEnvelope({
      ...raw,
      status: 10,
      signer_objects: [{ uuid: 'signer-x', status: 10, order: 0 }],
    })
    expect(result.status).toBe('sent')
  })
})
