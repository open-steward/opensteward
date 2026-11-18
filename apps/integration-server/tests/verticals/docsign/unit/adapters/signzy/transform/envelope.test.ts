import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignzyContract,
  type RawSignzySigner,
} from '../../../../../../../src/verticals/docsign/adapters/signzy/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const signerA: RawSignzySigner = {
  signerid: 'signer-001',
  signername: 'Alice Doe',
  status: 'pending',
}

const signerB: RawSignzySigner = {
  signerid: 'signer-002',
  signername: 'Bob Smith',
  status: 'success',
  contractlastsigntime: '2024-02-01T14:20:00.000Z',
}

const rawContract: RawSignzyContract = {
  contractid: 'ctr-xyz-123',
  contractname: 'Loan Agreement',
  contractexecutername: 'Olivia Admin',
  contractstatus: 'inprogress',
  iscompleted: false,
  initialsignercount: 2,
  signedsignercount: 1,
  deletedsignercount: 0,
  callbackstatus: 'success',
  estamp: {
    transactionid: 'estamp-tx-1',
    estampstatus: 'pending',
  },
  signerdetail: [signerA, signerB],
}

describe('signzy transformEnvelope', () => {
  it('maps contractid to id and externalId', () => {
    const result = transformEnvelope(rawContract)
    expect(result.id).toBe('ctr-xyz-123')
    expect(result.externalId).toBe('ctr-xyz-123')
  })

  it('maps contractstatus inprogress to sent', () => {
    const result = transformEnvelope(rawContract)
    expect(result.status).toBe('sent')
  })

  it('maps iscompleted:true to completed regardless of contractstatus', () => {
    const result = transformEnvelope({
      ...rawContract,
      iscompleted: true,
      contractstatus: 'inprogress',
    })
    expect(result.status).toBe('completed')
  })

  it('maps contractstatus rejected to declined', () => {
    const result = transformEnvelope({ ...rawContract, contractstatus: 'rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps contractstatus cancelled to voided', () => {
    const result = transformEnvelope({ ...rawContract, contractstatus: 'cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps contractstatus expired to expired', () => {
    const result = transformEnvelope({ ...rawContract, contractstatus: 'expired' })
    expect(result.status).toBe('expired')
  })

  it('maps contractstatus draft to draft', () => {
    const result = transformEnvelope({ ...rawContract, contractstatus: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps contractname to subject', () => {
    const result = transformEnvelope(rawContract)
    expect(result.subject).toBe('Loan Agreement')
  })

  it('maps contractexecutername to senderName', () => {
    const result = transformEnvelope(rawContract)
    expect(result.senderName).toBe('Olivia Admin')
  })

  it('always returns parallel signingOrder', () => {
    const result = transformEnvelope(rawContract)
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerdetail signerids to signerIds', () => {
    const result = transformEnvelope(rawContract)
    expect(result.signerIds).toEqual(['signer-001', 'signer-002'])
  })

  it('returns empty documentIds (Signzy exposes no document metadata listing)', () => {
    const result = transformEnvelope(rawContract)
    expect(result.documentIds).toEqual([])
  })

  it('sets completedAt from contractcompletiontime when iscompleted', () => {
    const result = transformEnvelope({
      ...rawContract,
      iscompleted: true,
      contractcompletiontime: '2024-02-01T14:20:00.000Z',
    })
    expect(result.completedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('leaves completedAt undefined when not completed', () => {
    const result = transformEnvelope(rawContract)
    expect(result.completedAt).toBeUndefined()
  })

  it('sets platform to signzy', () => {
    const result = transformEnvelope(rawContract)
    expect(result.platform).toBe('signzy')
  })

  it('puts contractstatus and signer counts into metadata', () => {
    const result = transformEnvelope(rawContract)
    expect(result.metadata.contractstatus).toBe('inprogress')
    expect(result.metadata.initialsignercount).toBe('2')
    expect(result.metadata.signedsignercount).toBe('1')
  })

  it('puts estamp fields into metadata', () => {
    const result = transformEnvelope(rawContract)
    expect(result.metadata.estampstatus).toBe('pending')
    expect(result.metadata.estamptransactionid).toBe('estamp-tx-1')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(rawContract)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('returns empty signerIds when signerdetail absent', () => {
    const result = transformEnvelope({ ...rawContract, signerdetail: undefined })
    expect(result.signerIds).toEqual([])
  })
})
