/**
 * Decode flash messages off a response, so tests assert on what the operator
 * actually sees rather than on a query string.
 *
 * One shared decoder rather than a base64 block copied into every test.
 */
import type { FastifyInstance } from 'fastify'
import type { LightMyRequestResponse } from 'light-my-request'
import type { FlashMessage } from '../../src/core/flash'
import { FLASH_COOKIE } from '../../src/core/flash'

function setCookieHeaders(res: LightMyRequestResponse): string[] {
  const raw = res.headers['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? raw : [String(raw)]
}

/** The raw signed cookie value a response queued, or null. */
export function flashCookieOf(res: LightMyRequestResponse): string | null {
  for (const header of setCookieHeaders(res)) {
    const match = new RegExp(`^${FLASH_COOKIE}=([^;]*)`).exec(header)
    if (!match) continue
    const value = decodeURIComponent(match[1])
    // A clear is `os_flash=; Expires=...` — an empty value, not a message.
    return value === '' ? null : value
  }
  return null
}

/** Messages a response queued for the next page. */
export function flashOf(fastify: FastifyInstance, res: LightMyRequestResponse): FlashMessage[] {
  const raw = flashCookieOf(res)
  if (!raw) return []
  const unsigned = fastify.unsignCookie(raw)
  if (!unsigned.valid || !unsigned.value) return []
  return JSON.parse(Buffer.from(unsigned.value, 'base64url').toString('utf8')) as FlashMessage[]
}

/** True when the response asked the browser to drop the flash cookie. */
export function clearsFlash(res: LightMyRequestResponse): boolean {
  return setCookieHeaders(res).some(
    (h) => h.startsWith(`${FLASH_COOKIE}=;`) || h.startsWith(`${FLASH_COOKIE}=;`),
  )
}

/** Build a request cookie carrying `messages`, for the render side. */
export function withFlash(fastify: FastifyInstance, messages: FlashMessage[]): string {
  const encoded = Buffer.from(JSON.stringify(messages), 'utf8').toString('base64url')
  return fastify.signCookie(encoded)
}
