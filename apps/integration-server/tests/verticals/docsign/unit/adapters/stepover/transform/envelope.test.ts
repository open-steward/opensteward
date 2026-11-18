import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawStepoverDocument,
} from '../../../../../../../src/verticals/docsign/adapters/stepover/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('stepover transformEnvelope', () => {
  const raw: RawStepoverDocument = {
    documentId: 42,
    statusId: 1, // STATUS_NEW → 'sent'
  }

  it('maps id and externalId from documentId as string', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps STATUS_NEW (1) → sent', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
  })

  it('maps STATUS_PARTIAL_SIGNED (2) → delivered', () => {
    const result = transformEnvelope({ ...raw, statusId: 2 })
    expect(result.status).toBe('delivered')
  })

  it('maps STATUS_FINISHED (3) → completed', () => {
    const result = transformEnvelope({ ...raw, statusId: 3 })
    expect(result.status).toBe('completed')
  })

  it('maps STATUS_FAILED (4) → voided', () => {
    const result = transformEnvelope({ ...raw, statusId: 4 })
    expect(result.status).toBe('voided')
  })

  it('maps unknown status → draft', () => {
    const result = transformEnvelope({ ...raw, statusId: 99 })
    expect(result.status).toBe('draft')
  })

  it('sets subject to webSignatureOffice document <id>', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('webSignatureOffice document 42')
  })

  it('sets signingOrder to parallel', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('sets signerIds to empty array', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual([])
  })

  it('sets documentIds to [id]', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['42'])
  })

  it('sets platform to stepover', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('stepover')
  })

  it('surfaces statusId and statusLabel under metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.statusId).toBe('1')
    expect(result.metadata.statusLabel).toBe('new')
  })

  it('metadata statusLabel is partial_signed for statusId 2', () => {
    const result = transformEnvelope({ ...raw, statusId: 2 })
    expect(result.metadata.statusLabel).toBe('partial_signed')
  })

  it('metadata statusLabel is finished for statusId 3', () => {
    const result = transformEnvelope({ ...raw, statusId: 3 })
    expect(result.metadata.statusLabel).toBe('finished')
  })

  it('metadata statusLabel is failed for statusId 4', () => {
    const result = transformEnvelope({ ...raw, statusId: 4 })
    expect(result.metadata.statusLabel).toBe('failed')
  })

  it('metadata statusLabel is unknown for unrecognised statusId', () => {
    const result = transformEnvelope({ ...raw, statusId: 99 })
    expect(result.metadata.statusLabel).toBe('unknown')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
