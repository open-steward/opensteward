import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/swisscom-trust-services/transform/signer'
import type { RawSwisscomSignResponse } from '../../../../../../../src/verticals/docsign/adapters/swisscom-trust-services/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const RESULT_MAJOR_SUCCESS = 'urn:oasis:names:tc:dss:1.0:resultmajor:Success'
const RESULT_MAJOR_PENDING =
  'urn:oasis:names:tc:dss:1.0:profiles:asynchronousprocessing:resultmajor:Pending'
const RESULT_MINOR_STEPUP_CANCEL = 'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/cancel'
const RESULT_MINOR_STEPUP_TIMEOUT =
  'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/timeout'

describe('swisscom-trust-services transformSigner', () => {
  const raw: RawSwisscomSignResponse = {
    '@RequestID': 'req-001',
    Result: {
      ResultMajor: RESULT_MAJOR_SUCCESS,
    },
    OptionalOutputs: {
      'async.ResponseID': 'resp-abc',
      'sc.StepUpAuthorisationInfo': {
        'sc.Result': {
          'sc.SerialNumber': 'SN-12345',
          'sc.ConsentURL': 'https://consent.example.com',
        },
      },
    },
    claimedIdentity: 'Acme:AcmeKey',
    requestedAt: '2024-03-10T12:00:00.000Z',
  }

  it('composes id from envelopeId and externalId (keyEntity)', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.id).toBe('resp-abc:AcmeKey')
  })

  it('sets externalId to keyEntity when present', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.externalId).toBe('AcmeKey')
  })

  it('preserves envelopeId', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.envelopeId).toBe('resp-abc')
  })

  it('synthesises placeholder email from serial number', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.email).toBe('SN-12345@swisscom-trust-services.invalid')
  })

  it('sets name to customerName from claimedIdentity', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.name).toBe('Acme')
  })

  it('sets role to signer', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.role).toBe('signer')
  })

  it('maps RESULT_MAJOR_SUCCESS → signed', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.status).toBe('signed')
  })

  it('maps RESULT_MINOR_STEPUP_CANCEL → declined', () => {
    const declined: RawSwisscomSignResponse = {
      ...raw,
      Result: {
        ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError',
        ResultMinor: RESULT_MINOR_STEPUP_CANCEL,
      },
    }
    const result = transformSigner(declined, 'resp-abc')
    expect(result.status).toBe('declined')
  })

  it('maps RESULT_MINOR_STEPUP_TIMEOUT → auto_responded', () => {
    const timedOut: RawSwisscomSignResponse = {
      ...raw,
      Result: {
        ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError',
        ResultMinor: RESULT_MINOR_STEPUP_TIMEOUT,
      },
    }
    const result = transformSigner(timedOut, 'resp-abc')
    expect(result.status).toBe('auto_responded')
  })

  it('maps RESULT_MAJOR_PENDING → sent', () => {
    const pending: RawSwisscomSignResponse = {
      ...raw,
      Result: { ResultMajor: RESULT_MAJOR_PENDING },
    }
    const result = transformSigner(pending, 'resp-abc')
    expect(result.status).toBe('sent')
  })

  it('maps missing Result → created', () => {
    const result = transformSigner({ ...raw, Result: undefined }, 'resp-abc')
    expect(result.status).toBe('created')
  })

  it('sets signedAt when status is signed', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.signedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('does not set signedAt when not signed', () => {
    const result = transformSigner(
      { ...raw, Result: { ResultMajor: RESULT_MAJOR_PENDING } },
      'resp-abc',
    )
    expect(result.signedAt).toBeUndefined()
  })

  it('sets declinedAt when status is declined', () => {
    const declined: RawSwisscomSignResponse = {
      ...raw,
      Result: {
        ResultMajor: 'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError',
        ResultMinor: RESULT_MINOR_STEPUP_CANCEL,
      },
    }
    const result = transformSigner(declined, 'resp-abc')
    expect(result.declinedAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('sets sentAt from requestedAt', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.sentAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('sets platform to swisscom-trust-services', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.platform).toBe('swisscom-trust-services')
  })

  it('surfaces claimedIdentity and keyEntity in metadata', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.metadata.claimedIdentity).toBe('Acme:AcmeKey')
    expect(result.metadata.keyEntity).toBe('AcmeKey')
  })

  it('surfaces mobileIdSerialNumber in metadata', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(result.metadata.mobileIdSerialNumber).toBe('SN-12345')
  })

  it('falls back to customerName for externalId when keyEntity is absent', () => {
    const noKey: RawSwisscomSignResponse = { ...raw, claimedIdentity: 'OnlyCustomer' }
    const result = transformSigner(noKey, 'resp-abc')
    expect(result.externalId).toBe('OnlyCustomer')
  })

  it('falls back to envelopeId for externalId when claimedIdentity is absent', () => {
    const noIdentity: RawSwisscomSignResponse = { ...raw, claimedIdentity: undefined }
    const result = transformSigner(noIdentity, 'env-fallback')
    expect(result.externalId).toBe('env-fallback')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(raw, 'resp-abc')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
