/**
 * The dashboard showed the same adapter count against every vertical.
 *
 * `/health` returns a deployment-wide `adapters` total, and healthCheck()
 * stamped that one number onto each vertical — so a single enabled accounting
 * adapter read as "1 adapter" nine times. integration-server now publishes
 * `adaptersByVertical`; this maps it through, falling back to the old
 * behaviour against an older backend that does not send it.
 */
import { describe, it, expect } from 'vitest'
import { Aggregator } from '../../src/core/proxy/aggregator'
import type { UnifiedClient } from '../../src/core/proxy/client'

function clientReturning(health: Record<string, unknown>): UnifiedClient {
  return { getHealth: async () => health } as unknown as UnifiedClient
}

const VERTICALS = ['accounting', 'crm', 'payments']

describe('Aggregator.healthCheck — per-vertical adapter counts', () => {
  it('reports each vertical its own count', async () => {
    const aggregator = new Aggregator(
      clientReturning({
        verticals: VERTICALS,
        adapters: 3,
        adaptersByVertical: { accounting: 1, crm: 2, payments: 0 },
      }),
      VERTICALS,
    )
    const statuses = await aggregator.healthCheck()
    expect(statuses.map((s) => [s.name, s.adapterCount])).toEqual([
      ['accounting', 1],
      ['crm', 2],
      ['payments', 0],
    ])
  })

  it('reports zero for a vertical missing from the breakdown', async () => {
    const aggregator = new Aggregator(
      clientReturning({
        verticals: VERTICALS,
        adapters: 1,
        adaptersByVertical: { accounting: 1 },
      }),
      VERTICALS,
    )
    const statuses = await aggregator.healthCheck()
    expect(statuses.find((s) => s.name === 'payments')?.adapterCount).toBe(0)
  })

  it('falls back to the deployment total when the backend sends no breakdown', async () => {
    const aggregator = new Aggregator(
      clientReturning({ verticals: VERTICALS, adapters: 4 }),
      VERTICALS,
    )
    const statuses = await aggregator.healthCheck()
    expect(statuses.every((s) => s.adapterCount === 4)).toBe(true)
  })
})
