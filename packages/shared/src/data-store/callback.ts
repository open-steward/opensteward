/**
 * Sync completion callback — POSTs job status to a user-provided URL.
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 *
 * The URL is re-validated here, immediately before the request, even though the
 * route already checked it at enqueue time. The request leaves from inside the
 * deployment, where instance metadata and sibling services are reachable, and
 * the name could resolve somewhere different now than it did when the job was
 * created. Validating only at enqueue would leave that gap open.
 */

import type { SyncJob } from './sync-schema'
import { assertResolvesToPublicAddress, validateCallbackUrl } from './callback-url'
import { safeFetch } from '../net/safe-fetch'

const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function sendCallback(
  url: string,
  job: SyncJob,
  logger?: { warn: (msg: string) => void },
  opts?: { allowInsecure?: boolean },
): Promise<boolean> {
  const validated = validateCallbackUrl(url, { allowInsecure: opts?.allowInsecure })
  if (!validated.ok) {
    logger?.warn(`Sync callback to ${url} refused: ${validated.reason}`)
    return false
  }
  const resolved = await assertResolvesToPublicAddress(validated.url)
  if (!resolved.ok) {
    logger?.warn(`Sync callback to ${url} refused: ${resolved.reason}`)
    return false
  }

  const body = JSON.stringify({ event: `sync.${job.status}`, job })

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // safeFetch, NOT bare fetch: the pre-checks above only vet the ORIGINAL
      // host, but a bare fetch follows 3xx redirects by default (undici) with
      // no re-validation, so a callback host that 302s to 169.254.169.254 or a
      // sibling service defeats the check. safeFetch pins redirect:'manual' and
      // re-runs the public-address check on every hop.
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return true
      logger?.warn(`Sync callback to ${url} returned ${res.status} (attempt ${attempt + 1})`)
    } catch (err) {
      logger?.warn(`Sync callback to ${url} failed (attempt ${attempt + 1}): ${err}`)
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BACKOFF_BASE_MS * 2 ** attempt)
    }
  }

  return false
}
