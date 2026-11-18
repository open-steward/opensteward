/**
 * The Connect Link form's customer-email autocomplete must debounce and
 * cancel. Fetching on every keystroke would issue ~18 requests for a
 * 20-character address, each proxied admin -> admin-api -> integration-server,
 * and without cancellation the suggestions displayed are whichever reply lands
 * last — a slow response for "ma" could overwrite the results for "matthew@".
 *
 * These tests drive the extracted controller directly (it holds no DOM
 * references) and pin both properties: one request per typing pause, and the
 * previous request aborted rather than raced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Controller = { onInput: (value: string) => void; cancel: () => void }
type Factory = (opts: {
  delay?: number
  fetchImpl: (q: string, signal: unknown) => Promise<unknown>
  render: (body: unknown) => void
}) => Controller

/**
 * Evaluate the browser script in a sandbox with no `document`, so only the
 * controller is defined. Keeps the test honest about what it covers: the
 * fetching policy, not the DOM wiring.
 */
function loadFactory(): Factory {
  const source = readFileSync(
    join(import.meta.dirname, '../../public/js/customer-autocomplete.js'),
    'utf8',
  )
  const sandbox: Record<string, unknown> = { AbortController }
  new Function('globalThis', 'window', 'document', source)(sandbox, undefined, undefined)
  const exposed = sandbox.__customerAutocomplete as { createSuggestionController: Factory }
  return exposed.createSuggestionController
}

let createSuggestionController: Factory

beforeEach(() => {
  vi.useFakeTimers()
  createSuggestionController = loadFactory()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('customer email autocomplete', () => {
  it('sends one request for a burst of typing, not one per keystroke', () => {
    const fetchImpl = vi.fn(async () => ({ data: [] }))
    const c = createSuggestionController({ delay: 250, fetchImpl, render: () => {} })

    for (const value of ['ma', 'mat', 'matt', 'matth', 'matthew']) c.onInput(value)
    expect(fetchImpl).not.toHaveBeenCalled() // still typing

    vi.advanceTimersByTime(250)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('matthew') // the final value, not the first
  })

  it('sends a second request once typing resumes after a pause', () => {
    const fetchImpl = vi.fn(async () => ({ data: [] }))
    const c = createSuggestionController({ delay: 250, fetchImpl, render: () => {} })

    c.onInput('acme')
    vi.advanceTimersByTime(250)
    c.onInput('acme.co')
    vi.advanceTimersByTime(250)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('aborts the in-flight request so a stale reply cannot overwrite newer suggestions', () => {
    const signals: AbortSignal[] = []
    const fetchImpl = vi.fn(async (_q: string, signal: unknown) => {
      signals.push(signal as AbortSignal)
      return new Promise(() => {}) // never settles; the abort is the point
    })
    const c = createSuggestionController({ delay: 250, fetchImpl, render: () => {} })

    c.onInput('ma')
    vi.advanceTimersByTime(250)
    c.onInput('matthew')
    vi.advanceTimersByTime(250)

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
  })

  it('ignores queries too short to be worth a round trip', () => {
    const fetchImpl = vi.fn(async () => ({ data: [] }))
    const c = createSuggestionController({ delay: 250, fetchImpl, render: () => {} })

    c.onInput('m')
    c.onInput(' ')
    vi.advanceTimersByTime(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not re-query when the value returns to what was last requested', () => {
    const fetchImpl = vi.fn(async () => ({ data: [] }))
    const c = createSuggestionController({ delay: 250, fetchImpl, render: () => {} })

    c.onInput('acme')
    vi.advanceTimersByTime(250)
    c.onInput('acme')
    vi.advanceTimersByTime(250)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('passes the response body to render', async () => {
    const body = { data: [{ id: 'eu_1', email: 'a@acme.test', displayName: 'Acme' }] }
    const render = vi.fn()
    const c = createSuggestionController({ delay: 250, fetchImpl: async () => body, render })

    c.onInput('acme')
    vi.advanceTimersByTime(250)
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(body))
  })
})

describe('customer email autocomplete — failure handling', () => {
  it('leaves the previous suggestions alone when a lookup fails', async () => {
    const render = vi.fn()
    const c = createSuggestionController({
      delay: 250,
      fetchImpl: async () => {
        throw new Error('429')
      },
      render,
    })

    c.onInput('acme')
    vi.advanceTimersByTime(250)
    await Promise.resolve()
    expect(render).not.toHaveBeenCalled()
  })
})
