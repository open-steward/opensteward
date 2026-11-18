/**
 * GoSign5 `Dossier` → canonical Envelope. Field names and the DossierStatus
 * enum come from the GoSign5 OpenAPI
 * (https://devportal.infocert.digital/gosign/documentation/GoSign5).
 */
import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/infocert/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { DOSSIER_EXAMPLE } from '../dossier.fixture'

describe('infocert transformEnvelope (GoSign5 Dossier)', () => {
  it('maps the documented Dossier fields', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(DOSSIER_EXAMPLE))
    expect(out.id).toBe('2wedtgw43aw4et')
    expect(out.externalId).toBe('2wedtgw43aw4et')
    expect(out.status).toBe('completed')
    expect(out.subject).toBe('Supply contract 2026')
    expect(out.message).toBe('Please sign.')
    expect(out.senderId).toBe('XYZ4242')
    expect(out.senderName).toBe('John Smith')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['tid1672671:XYZ4242', 'tid1672672:ABC1111'])
    expect(out.documentIds).toEqual(['2wedtgw43aw4et', 'doc-annex-2'])
    expect(out.expiresAt).toBe('2017-07-21T17:32:28.000Z')
    expect(out.platform).toBe('infocert')
    expect(out.metadata).toEqual({
      code: 'PDOPQD0SK',
      customId: '1532015',
      type: 'STANDARD',
      useType: 'CORPORATE',
      loadingMethod: 'Web',
      gosignStatus: 'WORKED',
    })
  })

  it.each([
    ['DRAFT', 'draft'],
    ['IN_PROGRESS', 'sent'],
    ['WORKED', 'completed'],
    ['REJECTED', 'declined'],
    ['CANCELLED', 'voided'],
    ['TO_REJECT', 'unknown'],
    ['DELETED', 'unknown'],
    ['STORED', 'unknown'],
    ['TEMPORARY', 'unknown'],
  ] as const)('maps DossierStatus %s → %s', (status, expected) => {
    const out = EnvelopeSchema.parse(transformEnvelope({ ...DOSSIER_EXAMPLE, status }))
    expect(out.status).toBe(expected)
  })

  it('reads parallel when every task shares one order', () => {
    const tasks = DOSSIER_EXAMPLE.process!.tasks!.map((t) => ({ ...t, order: 1 }))
    const out = EnvelopeSchema.parse(transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks } }))
    expect(out.signingOrder).toBe('parallel')
  })

  it('reads parallel for a single task, which has nothing to sequence', () => {
    const tasks = [{ ...DOSSIER_EXAMPLE.process!.tasks![0]!, order: undefined }]
    const out = EnvelopeSchema.parse(transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks } }))
    expect(out.signingOrder).toBe('parallel')
  })

  it('throws rather than guessing the order when several tasks lack Task.order', () => {
    const tasks = DOSSIER_EXAMPLE.process!.tasks!.map((t) => ({ ...t, order: undefined }))
    expect(() => transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks } })).toThrow(/order/)
  })

  it('lists signerIds in Task.order', () => {
    const [a, b] = DOSSIER_EXAMPLE.process!.tasks!
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks: [b!, a!] } }),
    )
    expect(out.signerIds).toEqual(['tid1672671:XYZ4242', 'tid1672672:ABC1111'])
  })

  it('leaves role actors out of signerIds', () => {
    const [a, b] = DOSSIER_EXAMPLE.process!.tasks!
    const tasks = [a!, { ...b!, actors: [{ roleExternalId: 'R1' }] }]
    const out = EnvelopeSchema.parse(transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks } }))
    expect(out.signerIds).toEqual(['tid1672671:XYZ4242'])
  })

  it('throws rather than inventing a document id when one has no externalId', () => {
    const documents = [{ ...DOSSIER_EXAMPLE.documents![0]!, externalId: undefined }]
    expect(() => transformEnvelope({ ...DOSSIER_EXAMPLE, documents })).toThrow(/externalId/)
  })

  it('drops TaskAuthorization.pin from raw', () => {
    const tasks = DOSSIER_EXAMPLE.process!.tasks!.map((t) => ({
      ...t,
      authorization: { pin: '123456', authorizationType: 'PIN' },
    }))
    const out = EnvelopeSchema.parse(transformEnvelope({ ...DOSSIER_EXAMPLE, process: { tasks } }))
    expect(JSON.stringify(out.raw)).not.toContain('123456')
    expect(JSON.stringify(out.raw)).toContain('tid1672672')
  })

  it('throws rather than inventing an id when externalId is absent', () => {
    expect(() => transformEnvelope({ ...DOSSIER_EXAMPLE, externalId: undefined })).toThrow(
      /externalId/,
    )
  })

  it('throws rather than inventing a subject when subject is absent', () => {
    expect(() => transformEnvelope({ ...DOSSIER_EXAMPLE, subject: undefined })).toThrow(/subject/)
  })
})
