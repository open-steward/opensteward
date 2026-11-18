import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Returns false on length mismatch
 * without invoking `timingSafeEqual` (which throws on unequal-length
 * buffers). Use for comparing operator-set secrets (ADMIN_SECRET,
 * BOOTSTRAP_TOKEN, etc.) where length is not attacker-controlled.
 *
 * Do NOT use for comparing user-supplied secrets where the secret
 * length itself could be a side channel — for those, hash both sides
 * first and compare the digests.
 */
export function safeStrEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
