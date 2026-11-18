import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNormalizerVersion } from '../../src/normalizer-version'

/**
 * The version must change when — and only when — a normalizer changes.
 *
 * A version that never changes serves records from a previous build (Finding
 * 26). A version that changes on every deploy is flush-on-deploy wearing a
 * hat: correct, but it cold-starts every platform's cache at once.
 */

function tree(): { dir: string; write: (rel: string, body: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'oi-nv-'))
  const write = (rel: string, body: string) => {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  write('accounting/adapters/xero/transform/invoice.js', 'export const a = 1')
  write('accounting/adapters/xero/index.js', 'export class X {}')
  write('accounting/adapters/shared/transform.js', 'export const toCalendarDate = 1')
  write('accounting/schema/invoice.js', 'export const InvoiceSchema = 1')
  write('accounting/adapters/fortnox/transform/invoice.js', 'export const b = 2')
  write('accounting/adapters/fortnox/index.js', 'export class F {}')
  return { dir, write }
}

describe('normalizer version', () => {
  it('is stable across calls for unchanged files', () => {
    const { dir } = tree()
    try {
      const v = createNormalizerVersion({ verticalsDir: dir })
      expect(v('accounting', 'xero')).toBe(v('accounting', 'xero'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('differs between platforms', () => {
    const { dir } = tree()
    try {
      const v = createNormalizerVersion({ verticalsDir: dir })
      expect(v('accounting', 'xero')).not.toBe(v('accounting', 'fortnox'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('changes when the platform’s own transform changes', () => {
    const { dir, write } = tree()
    try {
      const before = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      write('accounting/adapters/xero/transform/invoice.js', 'export const a = 2')
      const after = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      expect(after).not.toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('changes when the SHARED transform helpers change', () => {
    // `toUtcDate` and `toCalendarDate` both live there; Finding 12 was fixed
    // in that file and would otherwise not have invalidated anything.
    const { dir, write } = tree()
    try {
      const before = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      write('accounting/adapters/shared/transform.js', 'export const toCalendarDate = 2')
      const after = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      expect(after).not.toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('changes when the canonical schema changes', () => {
    const { dir, write } = tree()
    try {
      const before = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      write('accounting/schema/invoice.js', 'export const InvoiceSchema = 2')
      const after = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      expect(after).not.toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does NOT change when an unrelated platform changes', () => {
    // The whole reason for hashing per platform rather than per build: a Xero
    // deploy must not cold-start every other platform's cache.
    const { dir, write } = tree()
    try {
      const before = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      write('accounting/adapters/fortnox/transform/invoice.js', 'export const b = 99')
      const after = createNormalizerVersion({ verticalsDir: dir })('accounting', 'xero')
      expect(after).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back rather than claiming a shared version for an unreadable tree', () => {
    // Every unknown platform hashing to the same empty-tree digest would let
    // one platform's rows answer for another's. The fallback is a deploy id,
    // which is wrong in the safe direction.
    const v = createNormalizerVersion({ verticalsDir: '/nonexistent', fallback: 'deploy-abc' })
    expect(v('accounting', 'xero')).toBe('deploy-abc')
  })

  it('memoizes, so a hot path does not re-hash the tree', () => {
    const { dir, write } = tree()
    try {
      const v = createNormalizerVersion({ verticalsDir: dir })
      const first = v('accounting', 'xero')
      write('accounting/adapters/xero/transform/invoice.js', 'export const a = 3')
      // Same instance: the answer is memoized for the life of the process,
      // which is correct — the code cannot change under a running process.
      expect(v('accounting', 'xero')).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
