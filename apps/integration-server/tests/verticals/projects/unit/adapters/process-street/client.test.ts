/**
 * ProcessStreetClient retry behaviour, per the spec's info.description
 * (https://public-api.process.st/api/v1.1/docs/openapi.json):
 *   "If you receive a `429` response, wait for the duration specified in the
 *   `Retry-After` header before retrying."
 *   GET requests "are safe to retry on any error".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { ProcessStreetClient } from '../../../../../../src/verticals/projects/adapters/process-street/client'

vi.mock('axios')

function httpError(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } })
}

function fakeGet(responses: Array<Error | unknown>): ReturnType<typeof vi.fn> {
  const get = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return { data: next }
  })
  vi.mocked(axios.create).mockImplementation((() => ({ get })) as unknown as typeof axios.create)
  return get
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ProcessStreetClient retries', () => {
  it('a 429 waits exactly the Retry-After seconds, then retries', async () => {
    const get = fakeGet([httpError(429, { 'retry-after': '3' }), { ok: true }])
    const p = new ProcessStreetClient({ accessToken: 'k' }).get<{ ok: boolean }>('/users')
    await vi.advanceTimersByTimeAsync(2999)
    expect(get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(get).toHaveBeenCalledTimes(2)
    await expect(p).resolves.toEqual({ ok: true })
  })

  it('a 5xx on a GET is retried', async () => {
    const get = fakeGet([httpError(503), { ok: true }])
    const p = new ProcessStreetClient({ accessToken: 'k' }).get<{ ok: boolean }>('/users')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toEqual({ ok: true })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a 404 is not retried', async () => {
    const get = fakeGet([httpError(404), { ok: true }])
    await expect(new ProcessStreetClient({ accessToken: 'k' }).get('/users')).rejects.toThrow(
      'HTTP 404',
    )
    expect(get).toHaveBeenCalledTimes(1)
  })
})
