/**
 * CCAvenue request/response cipher.
 *
 * CCAvenue does not use bearer tokens or HMAC signatures. Instead every
 * DoWebTrans request body and response is AES-128-CBC encrypted with the
 * merchant's Working/Encryption Key:
 *
 *   - key:  MD5(workingKey) → 16 raw bytes (the working key is an ASCII hex
 *           string in the dashboard; MD5 collapses it to a 128-bit key)
 *   - iv:   the fixed 16-byte vector 0x00..0x0f (CCAvenue's published IV)
 *   - text: PKCS#7 padded plaintext, ciphertext hex-encoded lowercase
 *
 * The hex ciphertext is what travels in the `enc_request` POST field and the
 * `enc_response` field of the reply.
 */
import { createHash, createCipheriv, createDecipheriv } from 'node:crypto'

/** CCAvenue's published fixed IV: bytes 0x00 through 0x0f. */
const INIT_VECTOR = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
])

/** Derive the 16-byte AES key from the working key (MD5 → raw bytes). */
function deriveKey(workingKey: string): Buffer {
  return createHash('md5').update(workingKey, 'utf8').digest()
}

/** AES-128-CBC encrypt a plaintext payload → lowercase hex `enc_request`. */
export function encrypt(plainText: string, workingKey: string): string {
  const cipher = createCipheriv('aes-128-cbc', deriveKey(workingKey), INIT_VECTOR)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  return encrypted.toString('hex')
}

/** AES-128-CBC decrypt a hex `enc_response` → plaintext. */
export function decrypt(encHex: string, workingKey: string): string {
  const decipher = createDecipheriv('aes-128-cbc', deriveKey(workingKey), INIT_VECTOR)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
