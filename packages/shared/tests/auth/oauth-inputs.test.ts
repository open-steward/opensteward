/**
 * `oauthFields` are the non-secret inputs an OAuth adapter needs BEFORE it
 * can build an authorize URL — Shopify's `shop`, Zendesk's `subdomain`. The
 * flow collects them at oauth-start, parks them in pending state keyed by the
 * OAuth `state`, and replays them at token exchange. This pins the filter that
 * decides what a customer can put there: only declared names, trimmed, blanks
 * absent, required ones reported by name.
 */
import { describe, it, expect } from 'vitest'
import { collectOAuthInputs } from '../../src/auth/oauth-inputs'
import { storePendingState, consumePendingState } from '../../src/auth/oauth'

const FIELDS = [
  { name: 'shop', label: 'Store', type: 'text' as const, required: true },
  { name: 'region', label: 'Region', type: 'text' as const },
]

describe('collectOAuthInputs', () => {
  it('returns null inputs when the adapter declares no fields', () => {
    expect(collectOAuthInputs(undefined, { shop: 'x' })).toEqual({ inputs: null, missing: [] })
    expect(collectOAuthInputs([], { shop: 'x' })).toEqual({ inputs: null, missing: [] })
  })

  it('keeps only declared names, trimmed', () => {
    const r = collectOAuthInputs(FIELDS, { shop: '  acme ', region: 'eu', evil: 'x' })
    expect(r).toEqual({ inputs: { shop: 'acme', region: 'eu' }, missing: [] })
  })

  it('reports missing required fields and drops blanks', () => {
    expect(collectOAuthInputs(FIELDS, { shop: '   ' })).toEqual({ inputs: {}, missing: ['shop'] })
    expect(collectOAuthInputs(FIELDS, undefined)).toEqual({ inputs: {}, missing: ['shop'] })
    expect(collectOAuthInputs(FIELDS, 'nope')).toEqual({ inputs: {}, missing: ['shop'] })
  })

  it('ignores non-string values', () => {
    expect(collectOAuthInputs(FIELDS, { shop: 42 })).toEqual({ inputs: {}, missing: ['shop'] })
  })
})

describe('pending state carries inputs', () => {
  it('round-trips inputs and defaults them to null', () => {
    storePendingState('oauth-inputs-s1', 'shopify', { inputs: { shop: 'acme' } })
    expect(consumePendingState('oauth-inputs-s1')?.inputs).toEqual({ shop: 'acme' })
    storePendingState('oauth-inputs-s2', 'shopify', {})
    expect(consumePendingState('oauth-inputs-s2')?.inputs).toBeNull()
  })
})
