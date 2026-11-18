/**
 * Tests for the adapter verification tier helpers.
 *
 * The point of this module is that a verification badge is a claim about our
 * own code, so every helper here is written to fail closed: anything that
 * isn't unmistakably a real tier reads as unverified rather than rendering a
 * badge nobody can account for. These tests pin that behaviour, because the
 * failure mode — a bogus string quietly becoming a "Verified" chip
 * in the admin picker — is exactly what the feature exists to prevent.
 */
import { describe, it, expect } from 'vitest'
import {
  VERIFICATION_TIERS,
  VERIFICATION_LABELS,
  VERIFICATION_RANK,
  isVerificationTier,
  meetsVerification,
  verificationIndex,
  verificationTally,
  verificationReadmeSentence,
  VERIFICATION_README_SENTENCE,
} from '../../src/reference/platform-verification'

describe('the ladder itself', () => {
  it('is ordered weakest-first, and rank agrees with that order', () => {
    expect(VERIFICATION_TIERS).toEqual(['unit-tested', 'verified'])
    const ranks = VERIFICATION_TIERS.map((t) => VERIFICATION_RANK[t])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('labels every tier, with no tier left unlabelled', () => {
    for (const t of VERIFICATION_TIERS) {
      expect(VERIFICATION_LABELS[t]).toBeTruthy()
    }
    expect(Object.keys(VERIFICATION_LABELS).sort()).toEqual([...VERIFICATION_TIERS].sort())
  })
})

describe('isVerificationTier', () => {
  it('accepts exactly the real tiers', () => {
    for (const t of VERIFICATION_TIERS) expect(isVerificationTier(t)).toBe(true)
  })

  it('rejects near-misses, wrong types and prototype keys', () => {
    for (const bogus of [
      'scaffolded',
      'Verified',
      'VERIFIED',
      'unit tested',
      '',
      undefined,
      null,
      true,
      2,
      {},
      ['verified'],
      'toString',
      'constructor',
      '__proto__',
    ]) {
      expect(isVerificationTier(bogus)).toBe(false)
    }
  })

  it('rejects the two tiers that "verified" replaced', () => {
    // Sandbox and live-tenant runs became one rung in 2026-11. A metadata entry
    // still carrying an old name must fail closed, not keep its badge.
    expect(isVerificationTier('sandbox-verified')).toBe(false)
    expect(isVerificationTier('production-verified')).toBe(false)
  })
})

describe('meetsVerification', () => {
  it('is true at and above the floor', () => {
    expect(meetsVerification('verified', 'unit-tested')).toBe(true)
    expect(meetsVerification('verified', 'verified')).toBe(true)
    expect(meetsVerification('unit-tested', 'unit-tested')).toBe(true)
  })

  it('is false below the floor', () => {
    expect(meetsVerification('unit-tested', 'verified')).toBe(false)
  })

  it('treats absent and malformed as below every floor', () => {
    for (const floor of VERIFICATION_TIERS) {
      expect(meetsVerification(undefined, floor)).toBe(false)
      expect(meetsVerification('nonsense', floor)).toBe(false)
      expect(meetsVerification(null, floor)).toBe(false)
    }
  })
})

describe('verificationIndex', () => {
  it('keys by vertical:slug and omits unverified platforms entirely', () => {
    const idx = verificationIndex([
      { vertical: 'logistics', slug: 'shipbob', verification: 'unit-tested' },
      { vertical: 'payments', slug: 'stripe', verification: 'verified' },
      { vertical: 'accounting', slug: 'xero' },
    ])
    expect(idx.get('logistics:shipbob')).toBe('unit-tested')
    expect(idx.get('payments:stripe')).toBe('verified')
    expect(idx.has('accounting:xero')).toBe(false)
    expect(idx.size).toBe(2)
  })

  it('omits a malformed tier rather than indexing it', () => {
    const idx = verificationIndex([
      { vertical: 'crm', slug: 'bogus', verification: 'very-verified' },
      { vertical: 'crm', slug: 'alsobogus', verification: true },
    ])
    expect(idx.size).toBe(0)
  })
})

describe('verificationTally', () => {
  it('counts each tier and sweeps everything else into unverified', () => {
    const t = verificationTally([
      { verification: 'unit-tested' },
      { verification: 'unit-tested' },
      { verification: 'verified' },
      { verification: 'nonsense' },
      { verification: 'sandbox-verified' },
      {},
    ])
    expect(t['unit-tested']).toBe(2)
    expect(t.verified).toBe(1)
    expect(t.unverified).toBe(3)
    expect(t.total).toBe(6)
  })

  it('always sums to the total — no platform is counted twice or dropped', () => {
    const rows = [
      { verification: 'verified' },
      { verification: 'production-verified' },
      { verification: 'unit-tested' },
      { verification: 'bogus' },
      {},
      {},
    ]
    const t = verificationTally(rows)
    const summed = VERIFICATION_TIERS.reduce((n, tier) => n + t[tier], 0) + t.unverified
    expect(summed).toBe(t.total)
    expect(t.total).toBe(rows.length)
  })

  it('reports an empty catalog as zero rather than throwing', () => {
    const t = verificationTally([])
    expect(t.total).toBe(0)
    expect(t.unverified).toBe(0)
  })
})

describe('verificationReadmeSentence', () => {
  it('writes the count with thousands separators and a per-tier breakdown', () => {
    const t = { 'unit-tested': 1, verified: 8, unverified: 1539, total: 1548 }
    expect(verificationReadmeSentence(t)).toBe(
      '**9 of 1,548** adapters have been exercised beyond scaffolding (1 unit tested, 8 verified).',
    )
  })

  it('leaves out a tier with no platforms', () => {
    const t = { 'unit-tested': 0, verified: 3, unverified: 7, total: 10 }
    expect(verificationReadmeSentence(t)).toBe(
      '**3 of 10** adapters have been exercised beyond scaffolding (3 verified).',
    )
  })

  it('reads sensibly when nothing is verified', () => {
    const t = verificationTally([{}, {}])
    expect(verificationReadmeSentence(t)).toBe(
      '**0 of 2** adapters have been exercised beyond scaffolding (none yet).',
    )
  })

  it('is matched by VERIFICATION_README_SENTENCE, whatever the numbers', () => {
    for (const t of [
      { 'unit-tested': 1, verified: 8, unverified: 1539, total: 1548 },
      verificationTally([{}, {}]),
    ]) {
      expect(verificationReadmeSentence(t)).toMatch(VERIFICATION_README_SENTENCE)
    }
    expect(VERIFICATION_README_SENTENCE.flags).not.toContain('g')
  })
})
