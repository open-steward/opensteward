import { describe, it, expect } from 'vitest'
import { PLATFORMS, getPlatform } from '../../../../../../src/verticals/accounting/platforms/metadata'

const VALID_CATEGORIES = new Set(['accounting', 'erp', 'bookkeeping'])
const VALID_AUTH_TYPES = new Set(['oauth2', 'oauth2_cc', 'api_key', 'session', 'local'])
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

describe('PLATFORMS', () => {
  it('contains all 281 platforms', () => {
    expect(PLATFORMS).toHaveLength(281)
    // Spot-check a sample of slugs across regions
    const slugs = PLATFORMS.map((p) => p.slug)
    for (const slug of [
      'fortnox', 'quickbooks', 'xero', 'zohobooks', 'freshbooks',
      'freee', 'moneyforward', 'bukku', 'wafeq', 'daftra', 'siigo',
      'datev', 'evoliz', 'anfix', 'aruba', 'pohoda', 'meritaktiva',
      'smartbill', 'dilovod', 'kwara',
    ]) {
      expect(slugs).toContain(slug)
    }
  })

  it.each(PLATFORMS.map((p) => [p.slug, p] as const))('%s has non-empty required strings', (_, p) => {
    expect(p.name.length).toBeGreaterThan(0)
    expect(p.description.length).toBeGreaterThan(0)
    expect(p.website.length).toBeGreaterThan(0)
    expect(p.docs_url.length).toBeGreaterThan(0)
    expect(p.pricing_url.length).toBeGreaterThan(0)
  })

  it.each(PLATFORMS.map((p) => [p.slug, p] as const))('%s has valid primary_color', (_, p) => {
    expect(p.primary_color).toMatch(HEX_COLOR_RE)
  })

  it.each(PLATFORMS.map((p) => [p.slug, p] as const))('%s has valid category', (_, p) => {
    expect(VALID_CATEGORIES.has(p.category)).toBe(true)
  })

  it.each(PLATFORMS.map((p) => [p.slug, p] as const))('%s has valid auth_type', (_, p) => {
    expect(VALID_AUTH_TYPES.has(p.auth_type)).toBe(true)
  })

  it.each(PLATFORMS.map((p) => [p.slug, p] as const))('%s has valid founded_year', (_, p) => {
    expect(p.founded_year).toBeGreaterThanOrEqual(1000)
    expect(p.founded_year).toBeLessThanOrEqual(9999)
  })
})

describe('getPlatform', () => {
  it('returns the fortnox entry', () => {
    const p = getPlatform('fortnox')
    expect(p).toBeDefined()
    expect(p?.slug).toBe('fortnox')
    expect(p?.name).toBe('Fortnox')
  })

  it('returns undefined for unknown slug', () => {
    expect(getPlatform('nonexistent')).toBeUndefined()
  })
})
