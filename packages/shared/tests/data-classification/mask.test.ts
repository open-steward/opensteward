import { describe, it, expect } from 'vitest'
import {
  applyMasking,
  classifiedPaths,
  deriveMaskKey,
  isSearchable,
  maskValue,
  resolveFieldClass,
  REDACTED,
  type ResourceClassification,
} from '../../src/data-classification'

const CONTACT: ResourceClassification = {
  '*': { class: 'internal' },
  id: { class: 'public' },
  name: { class: 'pii', mask: 'name' },
  email: { class: 'pii', mask: 'email' },
  phone: { class: 'pii', mask: 'phone' },
  taxNumber: { class: 'pii' },
  billingAddress: { class: 'pii', mask: 'address' },
  emails: { class: 'pii', mask: 'email' },
  'telephones[].telephone': { class: 'pii', mask: 'phone' },
  balance: { class: 'financial' },
  'lines[].amount': { class: 'financial' },
  apiToken: { class: 'secret' },
  'settings.*': { class: 'pii', mask: 'hmac' },
}

const RECORD = {
  id: 'c_1',
  status: 'active',
  name: 'Jane van Doe',
  email: 'jane.doe@example.com',
  phone: '+46 70 123 45 67',
  taxNumber: 'SE556677889901',
  billingAddress: { line1: 'Main St 1', city: 'Oslo', postalCode: '0150', country: 'NO' },
  emails: ['a@x.io', 'bob@y.io'],
  telephones: [
    { telephone: '555-0101', type: 'work' },
    { telephone: null, type: 'home' },
  ],
  balance: 1234.5,
  lines: [{ amount: 10, sku: 'A' }],
  apiToken: 'sk_live_123',
  settings: { a: 'x', b: 'y' },
  metadata: { anything: 'goes' },
  raw: { upstream: true },
}

const KEY = deriveMaskKey('test-store-secret')

describe('applyMasking', () => {
  it('masks pii by kind, removes secrets, leaves financial and internal alone by default', () => {
    const out = applyMasking(RECORD, CONTACT, { hmacKey: KEY })
    expect(out.id).toBe('c_1')
    expect(out.status).toBe('active')
    expect(out.name).toBe('J*** v*** D***')
    expect(out.email).toBe('j***@example.com')
    expect(out.phone).toBe('+** ** *** ** 67')
    expect(out.taxNumber).toBe(REDACTED)
    expect(out.billingAddress).toEqual({
      line1: '***',
      city: '***',
      postalCode: '***',
      country: 'NO',
    })
    expect(out.emails).toEqual(['a***@x.io', 'b***@y.io'])
    expect(out.telephones).toEqual([
      { telephone: '***-**01', type: 'work' },
      { telephone: null, type: 'home' },
    ])
    expect(out.balance).toBe(1234.5)
    expect(out.lines).toEqual([{ amount: 10, sku: 'A' }])
    expect('apiToken' in out).toBe(false)
    expect(out.settings.a).toMatch(/^[0-9a-f]{16}$/)
    expect(out.settings.a).not.toBe(out.settings.b)
    // Stable: the same value and key give the same token.
    expect(applyMasking(RECORD, CONTACT, { hmacKey: KEY }).settings.a).toBe(out.settings.a)
    // metadata / raw are implicit PII.
    expect(out.metadata).toBe(REDACTED)
    expect(out.raw).toBe(REDACTED)
  })

  it('never mutates the input', () => {
    const copy = structuredClone(RECORD)
    applyMasking(RECORD, CONTACT, { hmacKey: KEY, maskFinancial: true })
    expect(RECORD).toEqual(copy)
  })

  it('revealPii shows pii (and metadata) but still removes secrets', () => {
    const out = applyMasking(RECORD, CONTACT, { revealPii: true })
    expect(out.email).toBe(RECORD.email)
    expect(out.billingAddress).toEqual(RECORD.billingAddress)
    expect(out.metadata).toEqual(RECORD.metadata)
    expect('apiToken' in out).toBe(false)
  })

  it('maskFinancial masks financial fields, including inside arrays', () => {
    const out = applyMasking(RECORD, CONTACT, { maskFinancial: true, revealPii: true })
    expect(out.balance).toBe(REDACTED)
    expect(out.lines).toEqual([{ amount: REDACTED, sku: 'A' }])
  })

  it('an explicit metadata rule overrides the implicit one; a nested rule does not', () => {
    const cls: ResourceClassification = { metadata: { class: 'internal' } }
    expect(applyMasking({ metadata: { a: 1 } }, cls).metadata).toEqual({ a: 1 })
    const nested: ResourceClassification = { 'metadata.a': { class: 'internal' } }
    expect(applyMasking({ metadata: { a: 1 } }, nested).metadata).toBe(REDACTED)
  })

  it('the default rule governs unclassified top-level fields', () => {
    const cls: ResourceClassification = { '*': { class: 'pii' }, id: { class: 'public' } }
    const out = applyMasking({ id: '1', other: 'x' }, cls)
    expect(out).toEqual({ id: '1', other: REDACTED })
  })

  it('a masked parent hides its children; a secret below a revealed parent is removed', () => {
    const cls: ResourceClassification = {
      address: { class: 'pii' },
      'address.country': { class: 'internal' },
      'profile.password': { class: 'secret' },
      profile: { class: 'pii' },
    }
    const out = applyMasking(
      { address: { country: 'SE', street: 'x' }, profile: { name: 'n', password: 'p' } },
      cls,
      { revealPii: true },
    )
    expect(out.address).toEqual({ country: 'SE', street: 'x' })
    expect(out.profile).toEqual({ name: 'n' })
    const masked = applyMasking({ address: { country: 'SE', street: 'x' } }, cls)
    expect(masked.address).toBe(REDACTED)
  })

  it('hmac without a key fails closed to redaction', () => {
    expect(maskValue('x', 'hmac')).toBe(REDACTED)
  })

  it('null and undefined pass through every mask', () => {
    for (const kind of ['email', 'phone', 'name', 'address', 'redact', 'hmac'] as const) {
      expect(maskValue(null, kind, KEY)).toBeNull()
      expect(maskValue(undefined, kind, KEY)).toBeUndefined()
    }
  })

  it('returns non-objects unchanged', () => {
    expect(applyMasking('x' as unknown, CONTACT)).toBe('x')
    expect(applyMasking(null as unknown, CONTACT)).toBeNull()
  })
})

describe('classifiedPaths / resolveFieldClass', () => {
  it('lists explicit paths, excluding the default key', () => {
    expect(classifiedPaths(CONTACT)).not.toContain('*')
    expect(classifiedPaths(CONTACT)).toContain('telephones[].telephone')
  })

  it('resolves exact, wildcard, ancestor, implicit and default classes', () => {
    expect(resolveFieldClass('email', CONTACT)).toBe('pii')
    expect(resolveFieldClass('settings.a', CONTACT)).toBe('pii')
    expect(resolveFieldClass('billingAddress.city', CONTACT)).toBe('pii')
    expect(resolveFieldClass('telephones.telephone', CONTACT)).toBe('pii')
    expect(resolveFieldClass('metadata.foo', CONTACT)).toBe('pii')
    expect(resolveFieldClass('status', CONTACT)).toBe('internal')
    expect(resolveFieldClass('status', {})).toBe('internal')
  })
})

describe('isSearchable', () => {
  it('pii only with revealPii; secret never; financial unless masked', () => {
    expect(isSearchable('status', CONTACT, false)).toBe(true)
    expect(isSearchable('email', CONTACT, false)).toBe(false)
    expect(isSearchable('email', CONTACT, true)).toBe(true)
    expect(isSearchable('apiToken', CONTACT, true)).toBe(false)
    expect(isSearchable('balance', CONTACT, false)).toBe(true)
    expect(isSearchable('balance', CONTACT, false, true)).toBe(false)
    expect(isSearchable('metadata.x', CONTACT, false)).toBe(false)
  })

  it('a path whose ancestor or descendant is pii is not searchable', () => {
    const cls: ResourceClassification = {
      address: { class: 'pii' },
      'address.country': { class: 'internal' },
      'contact.email': { class: 'pii' },
    }
    expect(isSearchable('address.country', cls, false)).toBe(false)
    expect(isSearchable('contact', cls, false)).toBe(false)
    expect(isSearchable('contact', cls, true)).toBe(true)
  })
})
