import { describe, it, expect } from 'vitest'
import { UnifiedAdapterRegistry, type VerticalRegistry } from '../../src/adapter/unified-registry'
import type { BaseAdapter } from '../../src/adapter/base'

function makeStub(slugs: string[]): VerticalRegistry {
  const set = new Set(slugs)
  return {
    get: (slug) => (set.has(slug) ? ({ platform: slug } as BaseAdapter) : undefined),
    has: (slug) => set.has(slug),
    list: () => Array.from(set),
    count: () => set.size,
    knownSlugs: () => Array.from(set),
  }
}

describe('UnifiedAdapterRegistry', () => {
  it('routes get(vertical, slug) to the right per-vertical registry', () => {
    const reg = new UnifiedAdapterRegistry()
    reg.register('accounting', makeStub(['fortnox', 'xero', 'bexio']))
    reg.register('crm', makeStub(['hubspot', 'bexio']))

    expect(reg.get('accounting', 'fortnox')?.platform).toBe('fortnox')
    expect(reg.get('crm', 'hubspot')?.platform).toBe('hubspot')

    // Same slug, different vertical → distinct lookups (the bexio collision case).
    expect(reg.get('accounting', 'bexio')).toBeDefined()
    expect(reg.get('crm', 'bexio')).toBeDefined()

    // Wrong vertical → undefined.
    expect(reg.get('accounting', 'hubspot')).toBeUndefined()
    expect(reg.get('crm', 'fortnox')).toBeUndefined()
  })

  it('rejects double-registration of the same vertical', () => {
    const reg = new UnifiedAdapterRegistry()
    reg.register('accounting', makeStub(['fortnox']))
    expect(() => reg.register('accounting', makeStub(['xero']))).toThrow(/already registered/)
  })

  it('listAll returns ${vertical}:${slug} keys', () => {
    const reg = new UnifiedAdapterRegistry()
    reg.register('accounting', makeStub(['fortnox']))
    reg.register('crm', makeStub(['hubspot', 'pipedrive']))

    expect(reg.listAll().sort()).toEqual([
      'accounting:fortnox',
      'crm:hubspot',
      'crm:pipedrive',
    ])
  })

  it('count sums every vertical', () => {
    const reg = new UnifiedAdapterRegistry()
    reg.register('accounting', makeStub(['fortnox', 'xero']))
    reg.register('crm', makeStub(['hubspot', 'pipedrive', 'salesforce']))
    expect(reg.count()).toBe(5)
  })

  it('verticals lists every registered vertical', () => {
    const reg = new UnifiedAdapterRegistry()
    reg.register('accounting', makeStub([]))
    reg.register('crm', makeStub([]))
    reg.register('logistics', makeStub([]))
    expect(reg.verticals().sort()).toEqual(['accounting', 'crm', 'logistics'])
  })

  it('listByVertical returns [] for unknown verticals', () => {
    const reg = new UnifiedAdapterRegistry()
    expect(reg.listByVertical('nope')).toEqual([])
    expect(reg.has('nope', 'whatever')).toBe(false)
  })
})
