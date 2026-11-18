import { describe, it, expect } from 'vitest'
import {
  mapAgreementStatus,
  transformAgreement,
  transformEnvelope,
  type RawConcordAgreement,
  type RawConcordAgreementListItem,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  AGREEMENT_LIST_ITEM_EXAMPLE,
  GET_AGREEMENT_EXAMPLE,
  GROUP_SLOT_EXAMPLE,
  OPEN_SLOT_EXAMPLE,
  SIGNED_SLOT_EXAMPLE,
} from './fixtures'

const item = AGREEMENT_LIST_ITEM_EXAMPLE as RawConcordAgreementListItem
const agreement = GET_AGREEMENT_EXAMPLE as unknown as RawConcordAgreement
/** SignatureMetadataGet: enforceOrder false, one signed, one open and one group slot. */
const PARALLEL = {
  enforceOrder: false,
  autoRequest: false,
  signatureProvider: 'CONCORD',
  slots: [SIGNED_SLOT_EXAMPLE, OPEN_SLOT_EXAMPLE, GROUP_SLOT_EXAMPLE],
}
const SEQUENTIAL = { ...PARALLEL, enforceOrder: true }

describe('concord transformEnvelope (AgreementListItemDto)', () => {
  it('maps the documented list item onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(item, PARALLEL))
    expect(out.id).toBe('01sp9L4YEZNcLHaSV8447N')
    expect(out.externalId).toBe('01sp9L4YEZNcLHaSV8447N')
    expect(out.subject).toBe('Non')
    expect(out.status).toBe('completed')
    expect(out.senderId).toBe('123')
    expect(out.senderName).toBe('John doe')
    expect(out.senderEmail).toBeUndefined()
    expect(out.createdAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.updatedAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.signingOrder).toBe('parallel')
    expect(out.signerIds).toEqual(['33', '34'])
    expect(out.documentIds).toEqual([])
    expect(out.completedAt).toBeUndefined()
    expect(out.metadata).toEqual({
      concordStatus: 'UNKNOWN_CONTRACT',
      description: 'NDA',
      organizationId: '1',
      folderId: '123',
      signatureDate: '2019-02-01T00:00:00.000Z',
      endDate: '2019-02-01T00:00:00.000Z',
      signatureProvider: 'CONCORD',
    })
    expect(out.platform).toBe('concord')
  })

  it('throws instead of inventing a title or id', () => {
    expect(() => transformEnvelope({ ...item, title: '' }, PARALLEL)).toThrow(/title/)
    expect(() => transformEnvelope({ ...item, uuid: '' }, PARALLEL)).toThrow(/uuid/)
  })

  it('reads signingOrder from SignatureMetadataGet.enforceOrder, never a default', () => {
    expect(transformEnvelope(item, SEQUENTIAL).signingOrder).toBe('sequential')
    expect(transformEnvelope(item, PARALLEL).signingOrder).toBe('parallel')
    expect(() => transformEnvelope(item, { slots: PARALLEL.slots } as typeof PARALLEL)).toThrow(
      /enforceOrder/,
    )
  })

  it('an agreement whose SignatureMetadataGet omits slots has no signers', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(item, { enforceOrder: false }))
    expect(out.signerIds).toEqual([])
  })
})

describe('concord transformAgreement (GetAgreementresponse)', () => {
  it('maps the documented GetAgreement reply onto the canonical schema', () => {
    const out = EnvelopeSchema.parse(transformAgreement(agreement, SEQUENTIAL))
    expect(out.id).toBe('01sp9L4YEZNcLHaSV8447N')
    expect(out.subject).toBe('Non-Disclosure Agreement')
    expect(out.status).toBe('draft')
    expect(out.senderId).toBe('14')
    expect(out.senderName).toBe('John Doe')
    expect(out.senderEmail).toBe('john.doe@awesome-corp.com')
    expect(out.createdAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['33', '34'])
    expect(out.metadata).toEqual({
      concordStatus: 'DRAFT',
      description: 'This NDA covers the company for 10 years.',
      organizationId: '1',
      folderId: '123',
      trashed: 'false',
    })
  })
})

describe('concord mapAgreementStatus', () => {
  it('maps each documented ContractLibraryStatusEnum stage', () => {
    expect(mapAgreementStatus('DRAFT')).toBe('draft')
    expect(mapAgreementStatus('VALIDATION')).toBe('draft')
    expect(mapAgreementStatus('NEGOTIATION')).toBe('draft')
    expect(mapAgreementStatus('SIGNING')).toBe('sent')
    for (const s of [
      'UNKNOWN_CONTRACT',
      'FUTURE_CONTRACT',
      'CURRENT_CONTRACT',
      'COMPLETED_CONTRACT',
      'COMPLETED_CANCEL_CONTRACT',
      'COMPLETED_CONTRACT_RENEWABLE',
    ]) {
      expect(mapAgreementStatus(s)).toBe('completed')
    }
    expect(mapAgreementStatus('BROKEN')).toBe('voided')
    expect(mapAgreementStatus('TRASHED')).toBe('unknown')
    expect(mapAgreementStatus('TEMPLATE')).toBe('unknown')
  })
})
