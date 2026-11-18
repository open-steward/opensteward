/**
 * APS / PayFort request + response signature scheme.
 *
 * Every server-to-server request carries a `signature` the merchant computes,
 * and every response (and feedback notification) carries a `signature` APS
 * computes. The algorithm:
 *
 *   1. Drop the `signature` field itself.
 *   2. Sort the remaining parameters ascending by name.
 *   3. Concatenate `name=value` pairs with NO separator.
 *   4. Prepend AND append the SHA phrase
 *      (`request_phrase` for requests, `response_phrase` for responses).
 *   5. Hash the result with the merchant's configured SHA type (sha256/sha512)
 *      and lowercase-hex encode it.
 *
 * Docs: https://docs.payfort.com/docs/in-common/build/index.html
 */
import { createHash, timingSafeEqual } from 'node:crypto'

export type ShaType = 'sha256' | 'sha512'

/** Build the canonical string that gets hashed (phrase + sorted pairs + phrase). */
export function buildSignedString(
  params: Record<string, unknown>,
  phrase: string,
): string {
  const pairs = Object.keys(params)
    .filter((k) => k !== 'signature')
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('')
  return `${phrase}${pairs}${phrase}`
}

/** Compute the lowercase-hex SHA signature for a parameter map. */
export function computeSignature(
  params: Record<string, unknown>,
  phrase: string,
  shaType: ShaType = 'sha256',
): string {
  return createHash(shaType).update(buildSignedString(params, phrase), 'utf8').digest('hex')
}

/**
 * Constant-time comparison of an inbound `signature` against the expected
 * value computed from the (response/feedback) parameters + response phrase.
 */
export function verifySignature(
  params: Record<string, unknown>,
  phrase: string,
  shaType: ShaType = 'sha256',
): boolean {
  try {
    const provided = params['signature']
    if (typeof provided !== 'string' || provided.length === 0) return false
    const expected = computeSignature(params, phrase, shaType)
    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
