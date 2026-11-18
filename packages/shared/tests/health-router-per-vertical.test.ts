/**
 * /health publishes the registry's per-vertical adapter breakdown. A single
 * deployment-wide count stamped onto every vertical by admin-api's aggregator
 * would show "1 adapter" nine times over on the dashboard when one accounting
 * adapter was enabled.
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { createUnifiedHealthRouter } from '../src/control-plane/health-router'
import { UnifiedAdapterRegistry } from '../src/adapter/unified-registry'
import { AdapterRegistry } from '../src/adapter/registry'

/** Registry with `enabled` adapters registered under `vertical`. */
async function registryWith(shape: Record<string, string[]>): Promise<UnifiedAdapterRegistry> {
  const unified = new UnifiedAdapterRegistry()
  for (const [vertical, slugs] of Object.entries(shape)) {
    const factories = Object.fromEntries(slugs.map((s) => [s, () => ({ platform: s })]))
    const registry = new AdapterRegistry<{ platform: string }>({ factories })
    for (const slug of slugs) await registry.enable(slug)
    unified.register(vertical, registry as never)
  }
  return unified
}

async function health(registry: UnifiedAdapterRegistry): Promise<Record<string, unknown>> {
  const fastify = Fastify({ logger: false })
  await fastify.register(createUnifiedHealthRouter({ registry }))
  await fastify.ready()
  const res = await fastify.inject({ method: 'GET', url: '/health' })
  await fastify.close()
  return JSON.parse(res.payload)
}

describe('GET /health — per-vertical adapter counts', () => {
  it('breaks the adapter count down by vertical', async () => {
    const body = await health(await registryWith({ accounting: ['fortnox'], crm: [], payments: [] }))
    expect(body.adaptersByVertical).toEqual({ accounting: 1, crm: 0, payments: 0 })
  })

  it('still reports the deployment-wide total', async () => {
    const body = await health(await registryWith({ accounting: ['fortnox'], crm: ['nutshell'] }))
    expect(body.adapters).toBe(2)
    expect(body.adaptersByVertical).toEqual({ accounting: 1, crm: 1 })
  })

  it('reports an empty breakdown when no registry is wired', async () => {
    const fastify = Fastify({ logger: false })
    await fastify.register(createUnifiedHealthRouter({}))
    await fastify.ready()
    const res = await fastify.inject({ method: 'GET', url: '/health' })
    await fastify.close()
    expect(JSON.parse(res.payload).adaptersByVertical).toEqual({})
  })
})
