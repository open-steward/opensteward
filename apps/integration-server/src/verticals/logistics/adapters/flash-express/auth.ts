import { createHash, randomBytes } from 'node:crypto'
import type { Credentials } from '../../adapter/interface'
import { FLASH_EXPRESS_DOCS_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return FLASH_EXPRESS_DOCS_URL
}

/**
 * Every Flash Express request carries `mchId` ("merchant No.") and is signed
 * with the merchant's secret key (https://open-docs.flashexpress.com/, "The
 * Security Reference": "About The security key:Please contact the official
 * support staff to obtain or reset."). The secret key is stored as
 * `accessToken`, the merchant number on `extra.mchId`.
 */
export async function exchangeApiCredentials(
  mchId: string,
  secretKey: string,
): Promise<Credentials> {
  return { accessToken: secretKey, extra: { mchId } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * The merchant number stored beside the secret key. Connections made before
 * the two-field form hold only the old single key, and no request can be
 * signed without both.
 */
export function mchIdOf(credentials: Credentials): string {
  const value = credentials.extra?.['mchId']
  if (typeof value !== 'string' || value.trim() === '') {
    throw Object.assign(
      new Error(
        'Flash Express needs the merchant number (mchId) and the secret key; reconnect this ' +
          'connection with both.',
      ),
      { statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' },
    )
  }
  return value
}

/**
 * "Blank value means that a string consisting entirely of whitespace
 * characters" (\t \n \v \f \r and U+001C..U+001F, plus the space shown in the
 * docs' example `body = " \t\n"`). Blank and empty values are sent but never
 * signed.
 */
// eslint-disable-next-line no-control-regex
const BLANK = /^[ \u0009\u000A\u000B\u000C\u000D\u001C\u001D\u001E\u001F]*$/

/**
 * The documented signature (https://open-docs.flashexpress.com/, "Signature
 * Algorithm"): "sort the parameters of non-empty parameter values in set M
 * according to the ASCII code of the parameter name from small to large
 * (dictionary order), using the URL key-value pair format (i.e. key1
 * =value1&key2=value2…) is spliced into a string stringA", then
 * `stringSignTemp=stringA+"&key=..."` and
 * `sign=sha256(stringSignTemp).toUpperCase()`. `sign` itself is never signed,
 * and values are signed before they are urlencoded.
 */
export function flashExpressSign(fields: Record<string, string>, secretKey: string): string {
  const stringA = Object.keys(fields)
    .filter((k) => k !== 'sign' && !BLANK.test(fields[k]!))
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&')
  const stringSignTemp = `${stringA}&key=${secretKey}`
  return createHash('sha256').update(stringSignTemp, 'utf8').digest('hex').toUpperCase()
}

/**
 * `nonceStr` is "string(32)": "call random number generating function, convert
 * the resulting value to string." 16 random bytes in hex are 32 characters.
 */
export function makeNonceStr(): string {
  return randomBytes(16).toString('hex')
}
