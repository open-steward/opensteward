/**
 * Paytm checksum (a.k.a. `signature` / `CHECKSUMHASH`).
 *
 * Paytm does NOT use a standard HMAC. Its checksum is a Paytm-specific scheme,
 * faithfully re-implemented here from the official `Paytm_Node_Checksum`
 * reference so we never have to ship the dependency:
 *
 *   sign(params, key):
 *     1. salt   = 4 random chars
 *     2. base   = Object.values(params).sort-by-key.join('|')   // string params
 *     3. hash   = sha256(base + '|' + salt) hex + salt
 *     4. return AES-128-CBC(hash, key, iv='@@@@&&&&####$$$$') base64
 *
 *   verify(params, key, checksum):
 *     1. plain  = AES-128-CBC-decrypt(checksum, key, iv)
 *     2. salt   = last 4 chars of plain
 *     3. return plain === sha256(base + '|' + salt) hex + salt   // constant-time
 *
 * The "params" for body signing are the values of the JSON `body` object; for
 * callback/webhook verification they are the POSTed form fields minus
 * `CHECKSUMHASH`. Only string-valued params participate (nested objects are
 * skipped) — matching the reference `getStringByParams`.
 *
 * Docs: https://business.paytm.com/docs/checksum/
 * Reference: https://github.com/paytm/Paytm_Node_Checksum
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'aes-128-cbc'
const IV = '@@@@&&&&####$$$$'
const SALT_LENGTH = 4

/** Build the `|`-joined base string from string-valued params, keys sorted. */
function getStringByParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => {
      const v = params[k]
      if (v === null || v === undefined) return ''
      // The reference only signs scalar params; skip nested objects/arrays.
      if (typeof v === 'object') return ''
      return String(v)
    })
    .join('|')
}

function calculateHash(base: string, salt: string): string {
  const finalString = `${base}|${salt}`
  return createHash('sha256').update(finalString).digest('hex') + salt
}

function encrypt(input: string, key: string): string {
  const cipher = createCipheriv(ALGORITHM, key, IV)
  return Buffer.concat([cipher.update(input, 'utf8'), cipher.final()]).toString('base64')
}

function decrypt(encrypted: string, key: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, IV)
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

function randomSalt(): string {
  // base64 of 3 bytes → 4 chars, matching the reference's 4-char salt length.
  return randomBytes(3).toString('base64').slice(0, SALT_LENGTH)
}

/** Generate a Paytm checksum/signature over `params` with the merchant `key`. */
export function generateSignature(params: Record<string, unknown>, key: string): string {
  const base = getStringByParams(params)
  const salt = randomSalt()
  return encrypt(calculateHash(base, salt), key)
}

/**
 * Verify a Paytm checksum/signature. Returns false on any error (bad key,
 * malformed checksum) rather than throwing. The hash comparison is
 * constant-time.
 */
export function verifySignature(
  params: Record<string, unknown>,
  key: string,
  checksum: string,
): boolean {
  try {
    if (!checksum) return false
    const plain = decrypt(checksum, key)
    const salt = plain.slice(plain.length - SALT_LENGTH)
    const expected = calculateHash(getStringByParams(params), salt)
    const a = Buffer.from(plain, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
