/**
 * A failed sync told an operator nothing they could act on.
 *
 * The worker recorded `String(err)`, which for an axios rejection is
 * "AxiosError: Request failed with status code 400" — the upstream status is in
 * there by accident, and the platform's actual explanation is discarded. A real
 * job showed exactly that:
 *
 *   purchaseorders  failed  "AxiosError: Request failed with status code 400"
 *
 * The platform had in fact answered
 * `{"message":"No such route.(method: GET, path: 3/purchaseorders)"}` — the
 * whole diagnosis, thrown away before it reached the admin UI. Finding it
 * needed a hand-rolled curl against the REST surface.
 *
 * Reuses the same redaction as the HTTP error handler, because an upstream body
 * can echo the request's Authorization header and a sync job's progress is
 * rendered in the admin UI and returned by the API.
 */
import { describe, it, expect } from 'vitest'
import { describeSyncError } from '../../src/data-store/sync-error'

function axiosish(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
    config: { url: 'https://api.fortnox.se/3/purchaseorders' },
  })
}

describe('describeSyncError', () => {
  it('keeps the platform’s own explanation, which is the actual diagnosis', () => {
    const err = axiosish(400, { message: 'No such route.(method: GET, path: 3/purchaseorders)' })
    expect(describeSyncError(err)).toContain('No such route')
  })

  it('names the upstream status explicitly rather than burying it in prose', () => {
    expect(describeSyncError(axiosish(400, { message: 'nope' }))).toContain('400')
  })

  it('redacts a credential the platform echoed back', () => {
    const err = axiosish(401, { authorization: 'Bearer sk-live-abcdef123456' })
    const out = describeSyncError(err)
    expect(out).not.toContain('sk-live-abcdef123456')
    expect(out).toContain('[redacted]')
  })

  it('marks an unreachable platform distinctly from one that answered', () => {
    const err = Object.assign(new Error('ECONNREFUSED'), {
      isAxiosError: true,
      config: { url: 'https://api.fortnox.se/3/orders' },
    })
    expect(describeSyncError(err)).toMatch(/unreachable/i)
  })

  it('falls back to the plain message for a non-upstream error', () => {
    expect(describeSyncError(new TypeError('boom'))).toContain('boom')
  })

  it('stays bounded, so one failure cannot bloat the job record', () => {
    const err = axiosish(400, { message: 'x'.repeat(5000) })
    expect(describeSyncError(err).length).toBeLessThan(700)
  })
})
