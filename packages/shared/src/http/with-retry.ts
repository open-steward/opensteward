/**
 * Shared HTTP-retry helper used by adapter `client.ts` files.
 *
 * Behaviour:
 *
 *   - Retries only on HTTP 429 (too-many-requests). 4xx other than 429 and
 *     non-HTTP errors throw immediately.
 *   - Exponential backoff: 2^i seconds between attempts (1s, 2s, 4s, 8s, …).
 *   - `retries` is the number of additional attempts after the first call,
 *     so `retries = 4` ⇒ up to 5 attempts total.
 *
 * The 429-detection duck-types the error shape (`err.response.status`) so
 * this module has zero runtime dependencies — axios stays out of the
 * open-shared dep graph.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}
