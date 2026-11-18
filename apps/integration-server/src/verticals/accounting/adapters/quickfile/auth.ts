/**
 * QuickFile API authentication.
 *
 * QuickFile uses MD5-signed requests rather than OAuth2. Each request body
 * carries a Header with:
 *   - AccNumber   – account identifier
 *   - MD5Value    – MD5( AccNumber + ApiKey + SubmissionNumber ) in lowercase hex
 *   - SubmissionNumber – unique alphanumeric reference per request
 *   - ApplicationID   – registered application identifier
 *
 * The accessToken field on Credentials stores the ApiKey; extra stores the
 * other required values: { accNumber, applicationId }.
 */
import { createHash } from 'node:crypto'
import type { Credentials } from '../../adapter/interface'

export function getAuthUrl(_state: string): string {
  // QuickFile does not use OAuth2 — credentials are entered directly
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is expected to be "accNumber:apiKey:applicationId" (colon-separated)
  const parts = code.split(':')
  if (parts.length < 3) {
    throw new Error('QuickFile credentials must be supplied as "accNumber:apiKey:applicationId"')
  }
  const [accNumber, apiKey, ...rest] = parts
  const applicationId = rest.join(':')
  return {
    accessToken: apiKey,
    extra: { accNumber, applicationId },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API key credentials do not expire
  return credentials
}

/** The documented request Header (https://api.quickfile.co.uk/d/v1_2/Invoice_Search). */
export interface QuickFileRequestHeader {
  MessageType: 'Request'
  SubmissionNumber: string
  Authentication: {
    AccNumber: string
    MD5Value: string
    ApplicationID: string
  }
}

/**
 * Builds the Header block included in every QuickFile request.
 * submissionNumber must be unique per request; pass a UUID or similar.
 *
 * Every method page documents the same Header: MessageType ('Request'),
 * SubmissionNumber, and an Authentication block holding AccNumber, MD5Value
 * (MD5 of "Account number, API Key and Submission Number") and ApplicationID
 * (https://api.quickfile.co.uk/d/v1_2/Invoice_Search, and the request sample
 * at https://api.quickfile.co.uk/GetJsonSample/Invoice_Search/1_2). The three
 * credentials go INSIDE Authentication, not beside MessageType.
 */
export function buildAuthHeader(
  credentials: Credentials,
  submissionNumber: string,
): QuickFileRequestHeader {
  const apiKey = credentials.accessToken
  const accNumber = String(credentials.extra?.['accNumber'] ?? '')
  const applicationId = String(credentials.extra?.['applicationId'] ?? '')

  const md5Value = createHash('md5')
    .update(accNumber + apiKey + submissionNumber)
    .digest('hex')

  return {
    MessageType: 'Request',
    SubmissionNumber: submissionNumber,
    Authentication: {
      AccNumber: accNumber,
      MD5Value: md5Value,
      ApplicationID: applicationId,
    },
  }
}
