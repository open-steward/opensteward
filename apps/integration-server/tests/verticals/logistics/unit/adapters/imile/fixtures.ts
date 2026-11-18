/**
 * iMile fixtures, built from iMile's own published examples.
 *
 * Every value below is copied from a document in iMile's public Open API
 * catalog (https://developer.imile.com), fetched 2026-09-25 through the
 * portal's JSON endpoint /third/web/api/doc/detail?id=<id> with `lang: en_US`.
 */
import type { IMileTrackOne } from '../../../../../../src/verticals/logistics/adapters/imile/transform/tracking'

/**
 * "Order Track Query (Single)", POST /client/track/getOne
 * https://developer.imile.com/apis/details/1826891449751908354
 *
 * The `data` object, assembled from the example value the document gives for
 * each response field.
 */
export const TRACK_GET_ONE_DATA: IMileTrackOne = {
  billNo: '6063024371258',
  orderType: '100',
  orderNo: '8238892418162461569',
  oldOrderNo: '',
  latestStatus: 'ReturnArrive',
  latestStatusTime: '2024-08-06 22:08:39',
  latestSite: 'Mexico Return Center',
  locusType: 'scan',
  locus: [
    {
      latestStatus: 'ReturnArrive',
      latestStatusTime: '2024-08-06 22:08:39',
      latestSite: 'Mexico Return Center',
      locusDetailed: '【Mexico Return Center】Shipment received.',
      locusType: 'scan',
      timeZone: 'GMT+08:00',
      pods: [
        'https://s3-eu-imile.s3-accelerate.amazonaws.com/s3/lms/app/re_driver/img/delivery/ios/20250815/1755216819535420.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20250815T004334Z&X-Amz-SignedHeaders=host&X-Amz-Credential=AKIAVRUVUBXSAYZ4H5V3%2F20250815%2Feu-central-1%2Fs3%2Faws4_request&X-Amz-Expires=604800&X-Amz-Signature=3f7b71e95b28f0fee',
      ],
      longitude: '8.15478914',
      latitude: '49.9871668',
    },
  ],
  latestLocus: '【Mexico Return Center】Shipment received.',
  timeZone: 'GMT+08:00',
}

/** The full response envelope for TRACK_GET_ONE_DATA, same document. */
export const TRACK_GET_ONE_RESPONSE = {
  code: '200',
  message: 'success',
  traceId: '',
  data: TRACK_GET_ONE_DATA,
  timeZone: '+8',
}

/**
 * "Signature rules and request message concatenation example"
 * https://developer.imile.com/apis/details/1826162720868216833
 *
 * The response message of its worked example, a POST /client/track/getOne
 * call (`reassignmentTime` omitted: it is not a field of the getOne document).
 */
export const SIGNATURE_EXAMPLE_TRACK_DATA: IMileTrackOne = {
  billNo: '6082824250179',
  orderType: '100',
  orderNo: 'test202408270002',
  oldOrderNo: '',
  latestStatus: 'SubmitOrder',
  latestStatusTime: '2024-08-27 16:27:57',
  latestSite: null,
  locusType: 'submitted',
  locus: [
    {
      latestStatus: 'SubmitOrder',
      latestStatusTime: '2024-08-27 16:27:57',
      latestSite: null,
      locusDetailed: 'Order Submited.',
      locusType: 'submitted',
      timeZone: 'GMT-06:00',
    },
  ],
  latestLocus: 'Order Submitted.',
  timeZone: 'GMT-06:00',
}

/**
 * The worked signature example from the same document: its request fields,
 * its assumed secretKey, and the sign it arrives at.
 */
export const SIGNATURE_EXAMPLE = {
  secretKey: 'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAMfSz+7WGuw8nwu9',
  publicParams: {
    customerId: 'C21018141',
    signMethod: 'MD5',
    format: 'json',
    version: '1.0.0',
    timeZone: '+8',
    timestamp: '1655438036695',
    accessToken: '9d269815-e928-41a0-8653-608ff0d9ee6c',
  },
  param: { orderType: '1', orderNo: '6082824250179', language: '2' },
  sign: '45858AABA92082D9AF784E05EBE6368C',
}

/**
 * "Access Token", POST /auth/accessToken/grant
 * https://developer.imile.com/apis/details/1825742952067575809
 * Its documented response example.
 */
export const ACCESS_TOKEN_RESPONSE = {
  code: '200',
  message: 'success',
  traceId: 'f3a0c4dce96442a9bf0cfdd9f11bd864.521.16864342554794309',
  timeZone: '+4',
  data: {
    accessToken: '31ecbd50-1ef8-4ce1-97e1-4a518e0785f9',
    expiresIn: 7200,
  },
}
