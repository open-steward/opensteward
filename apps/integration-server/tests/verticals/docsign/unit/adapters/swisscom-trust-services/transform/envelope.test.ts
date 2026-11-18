import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSwisscomSignResponse,
} from '../../../../../../../src/verticals/docsign/adapters/swisscom-trust-services/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const RESULT_MAJOR_SUCCESS = 'urn:oasis:names:tc:dss:1.0:resultmajor:Success'
const RESULT_MAJOR_PENDING =
  'urn:oasis:names:tc:dss:1.0:profiles:asynchronousprocessing:resultmajor:Pending'
const RESULT_MINOR_STEPUP_CANCEL = 'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/cancel'
const RESULT_MINOR_STEPUP_TIMEOUT =
  'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/timeout'

describe('swisscom-trust-services transformEnvelope', () => {
  const raw: RawSwisscomSignResponse = {
    '@RequestID': 'req-001',
    '@Profile': 'http://ais.swisscom.ch/1.1',
    Result: {
      ResultMajor: RESULT_MAJOR_SUCCESS,
    },
    OptionalOutputs: {
      'async.ResponseID': 'resp-abc',
      'sc.APTransID': 'ap-trans-001',
    },
    claimedIdentity: 'MyCustomer:myKey',
    requestedAt: '2024-03-10T12:00:00.000Z',
    SignatureObject: {
      Other: {
        'sc.SignatureObjects': {
          'sc.ExtendedSignatureObject': [
            { '@WhichDocument': 'doc-hash-001' },
            { '@WhichDocument': 'doc-hash-002' },
          ],
        },
      },
    },
  }

  it('prefers async.ResponseID over @RequestID for id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('resp-abc')
    expect(result.externalId).toBe('resp-abc')
  })

  it('falls back to @RequestID when ResponseID is absent', () => {
    const noResp: RawSwisscomSignResponse = {
      ...raw,
      OptionalOutputs: { 'sc.APTransID': 'ap-trans-001' },
    }
    const result = transformEnvelope(noResp)
    expect(result.id).toBe('req-001')
  })

  it('maps RESULT_MAJOR_SUCCESS → completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps RESULT_MAJOR_PENDING → sent', () => {
    const result = transformEnvelope({
      ...raw,
      Result: { ResultMajor: RESULT_MAJOR_PENDING },
    })
    expect(result.status).toBe('sent')
  })

  it('maps RESULT_MINOR_STEPUP_CANCEL → declined', () => {
    const result = transformEnvelope({
      ...raw,
      Result: {
        ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError',
        ResultMinor: RESULT_MINOR_STEPUP_CANCEL,
      },
    })
    expect(result.status).toBe('declined')
  })

  it('maps RESULT_MINOR_STEPUP_TIMEOUT → expired', () => {
    const result = transformEnvelope({
      ...raw,
      Result: {
        ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError',
        ResultMinor: RESULT_MINOR_STEPUP_TIMEOUT,
      },
    })
    expect(result.status).toBe('expired')
  })

  it('maps non-pending non-minor error major → voided', () => {
    const result = transformEnvelope({
      ...raw,
      Result: { ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:ResponderError' },
    })
    expect(result.status).toBe('voided')
  })

  it('maps missing Result → draft', () => {
    const result = transformEnvelope({ ...raw, Result: undefined })
    expect(result.status).toBe('draft')
  })

  it('builds subject from claimedIdentity customerName', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('AIS signing transaction — MyCustomer')
  })

  it('uses generic subject when claimedIdentity is absent', () => {
    const result = transformEnvelope({ ...raw, claimedIdentity: undefined })
    expect(result.subject).toBe('AIS signing transaction')
  })

  it('sets senderName to customerName part of claimedIdentity', () => {
    const result = transformEnvelope(raw)
    expect(result.senderName).toBe('MyCustomer')
  })

  it('sets signerIds to keyEntity from claimedIdentity', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['myKey'])
  })

  it('sets signingOrder to parallel', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('extracts documentIds from sc.ExtendedSignatureObject entries', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc-hash-001', 'doc-hash-002'])
  })

  it('sets documentIds to empty array when no SignatureObjects', () => {
    const result = transformEnvelope({ ...raw, SignatureObject: undefined })
    expect(result.documentIds).toEqual([])
  })

  it('maps requestedAt to createdAt, sentAt, and updatedAt', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-03-10T12:00:00.000Z')
    expect(result.sentAt).toBe('2024-03-10T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('sets completedAt when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({
      ...raw,
      Result: { ResultMajor: RESULT_MAJOR_PENDING },
    })
    expect(result.completedAt).toBeUndefined()
  })

  it('sets platform to swisscom-trust-services', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('swisscom-trust-services')
  })

  it('surfaces requestId, responseId, and apTransactionId in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.requestId).toBe('req-001')
    expect(result.metadata.responseId).toBe('resp-abc')
    expect(result.metadata.apTransactionId).toBe('ap-trans-001')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
