/**
 * `sendCallback` must refuse a URL that points inside the deployment, and must
 * decide that immediately before the request rather than trusting the check the
 * route did when the job was enqueued — the name can resolve somewhere else by
 * the time a job runs.
 *
 * A refusal is not a retry: no fetch is attempted at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendCallback } from '../../src/data-store/callback'
import type { SyncJob } from '../../src/data-store/sync-schema'

const JOB = {
  id: 'job_1',
  status: 'succeeded',
  vertical: 'accounting',
} as unknown as SyncJob

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendCallback', () => {
  it('never fetches a link-local address', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const warn = vi.fn()
    const ok = await sendCallback('http://169.254.169.254/latest/meta-data/', JOB, { warn })
    expect(ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/refused/))
  })

  it('never fetches a sibling service on the deployment network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ok = await sendCallback('https://10.1.2.3/internal', JOB, { warn: vi.fn() })
    expect(ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts to a legitimate https endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))
    const ok = await sendCallback('https://example.com/sync-done', JOB, { warn: vi.fn() })
    expect(ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('delivers through safeFetch — the wire fetch is pinned to redirect:"manual"', async () => {
    // A bare fetch follows 3xx by default, so a callback host that 302s to
    // 169.254.169.254 would be chased blindly. safeFetch forces
    // redirect:'manual' and re-validates each hop, so the delivery fetch
    // must carry that option.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))
    await sendCallback('https://example.com/sync-done', JOB, { warn: vi.fn() })
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.redirect).toBe('manual')
  })
})
