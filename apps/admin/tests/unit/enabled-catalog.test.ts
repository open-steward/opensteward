/**
 * The Connect Link pages must not spend ten upstream requests to answer
 * "which platforms are enabled?".
 *
 * `loadEnabledCatalog` issued `listCatalog()` plus one `listPlatforms(vertical)`
 * for each of the 9 verticals. Every one of those is proxied
 * admin -> admin-api -> integration-server, and they all count against
 * integration-server's per-IP rate budget — which is how an operator creating a
 * Connect Link ended up 429'd by their own admin UI.
 *
 * integration-server's `/admin/platforms` already returns every vertical's rows
 * with a `vertical` field on each, so one call answers the same question.
 */
import { describe, it, expect, vi } from 'vitest'
import { loadEnabledCatalog } from '../../src/core/proxy/enabled-catalog'
import type { AdminApiClient } from '../../src/core/proxy/admin-api-client'

const CATALOG = [
  { vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' },
  { vertical: 'accounting', slug: 'xero', name: 'Xero' },
  { vertical: 'crm', slug: 'nutshell', name: 'Nutshell' },
  { vertical: 'payments', slug: 'stripe', name: 'Stripe' },
]

const ROWS = [
  { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
  { vertical: 'accounting', slug: 'xero', enabled: false, hasConfig: false },
  { vertical: 'crm', slug: 'nutshell', enabled: true, hasConfig: false },
  { vertical: 'payments', slug: 'stripe', enabled: false, hasConfig: false },
]

function stubClient(overrides: Partial<Record<string, unknown>> = {}) {
  const listCatalog = vi.fn(async () => CATALOG)
  const listAllPlatformRows = vi.fn(async () => ROWS)
  const listPlatforms = vi.fn(async () => [])
  return {
    client: {
      listCatalog,
      listAllPlatformRows,
      listPlatforms,
      ...overrides,
    } as unknown as AdminApiClient,
    listCatalog,
    listAllPlatformRows,
    listPlatforms,
  }
}

describe('loadEnabledCatalog', () => {
  it('asks for every vertical at once instead of one call per vertical', async () => {
    const { client, listCatalog, listAllPlatformRows, listPlatforms } = stubClient()
    await loadEnabledCatalog(client, 'jwt')
    expect(listAllPlatformRows).toHaveBeenCalledTimes(1)
    expect(listPlatforms).not.toHaveBeenCalled()
    expect(listCatalog).toHaveBeenCalledTimes(1)
  })

  it('returns only the platforms the operator has enabled', async () => {
    const { client } = stubClient()
    const { providers } = await loadEnabledCatalog(client, 'jwt')
    expect(providers.map((p) => `${p.vertical}/${p.slug}`)).toEqual([
      'accounting/fortnox',
      'crm/nutshell',
    ])
  })

  it('lists the verticals that have at least one enabled platform, sorted', async () => {
    const { client } = stubClient()
    const { verticals } = await loadEnabledCatalog(client, 'jwt')
    expect(verticals).toEqual(['accounting', 'crm'])
  })

  it('renders an empty picker rather than failing when the rows cannot be fetched', async () => {
    const { client } = stubClient({
      listAllPlatformRows: vi.fn(async () => {
        throw new Error('upstream down')
      }),
    })
    const { providers, verticals } = await loadEnabledCatalog(client, 'jwt')
    expect(providers).toEqual([])
    expect(verticals).toEqual([])
  })
})
