import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify from 'fastify'
import { createTrackingEventsRouter } from '../../../../../src/verticals/logistics/router/trackingevents'

/**
 * The carrier hint is only useful if a caller can supply it, so the route
 * accepts `?carrier=` and passes it to the adapter.
 *
 * It also has to reach the CACHE key. `cachedGet` keys on the tracking number
 * alone, and the whole point of the hint is that one tracking number can mean
 * two different shipments on two carriers — without it in the key, the first
 * carrier's answer would be served to the second.
 */

function buildApp(getTrackingEvents: ReturnType<typeof vi.fn>) {
  const app = Fastify()
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as Record<string, unknown>).adapter = {
      platform: 'stamps',
      getTrackingEvents,
    }
    ;(request as unknown as Record<string, unknown>).credentials = { accessToken: 'tok' }
  })
  app.register(createTrackingEventsRouter())
  return app
}

afterEach(() => vi.restoreAllMocks())

describe('GET /tracking-events/:trackingNumber', () => {
  it('passes ?carrier through to the adapter', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const app = buildApp(fn)
    await app.inject({ method: 'GET', url: '/tracking-events/9400111?carrier=usps' })
    expect(fn).toHaveBeenCalledWith(expect.anything(), '9400111', 'usps')
    await app.close()
  })

  it('passes undefined when no carrier is given', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const app = buildApp(fn)
    await app.inject({ method: 'GET', url: '/tracking-events/9400111' })
    expect(fn).toHaveBeenCalledWith(expect.anything(), '9400111', undefined)
    await app.close()
  })
})
