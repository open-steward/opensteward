/**
 * The Connect Link form's mint-time label autofill.
 *
 * Every link needs a label and no two connections on a platform may share one,
 * so an operator minting a link had to invent a unique string before they could
 * submit — and a rejected duplicate came back only after the form round-tripped.
 * The form now fills the field in from what the operator has already chosen.
 *
 * Drives the extracted builder directly (it holds no DOM references and never
 * reads the clock — the caller passes the Date in, which is what lets the
 * timestamp below be pinned), loaded the way
 * tests/unit/customer-autocomplete.test.ts loads its script: in a sandbox with
 * no `document`, so only the logic is under test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type LabelInput = {
  mode: string
  matchedName?: string
  displayName?: string
  email?: string
  tenantName?: string
  adapterName?: string
  now: Date
}
type Label = {
  buildLabel: (input: LabelInput) => string
  formatStamp: (date: Date) => string
  tenantNameFor: (tenants: Array<{ id: string; name: string }>, id: string) => string
  adapterNameFor: (
    providers: Array<{ slug: string; name: string; vertical: string }>,
    vertical: string,
    slug: string,
  ) => string
}

function loadLabel(): Label {
  const source = readFileSync(
    join(import.meta.dirname, '../../public/js/connect-link-label.js'),
    'utf8',
  )
  const sandbox: Record<string, unknown> = {}
  new Function('globalThis', 'window', 'document', source)(sandbox, undefined, undefined)
  return sandbox.__connectLinkLabel as Label
}

// Pinned once, here: the builder takes the Date, so the whole suite reads as a
// mint at a single known minute rather than "whenever the test ran".
const NOW = new Date(2026, 8, 5, 14, 30)

let label: Label

beforeEach(() => {
  label = loadLabel()
})

describe('the three modes', () => {
  it('pinned names the customer, the tenant, the adapter and the minute', () => {
    expect(
      label.buildLabel({
        mode: 'pinned',
        matchedName: 'Jane Doe',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        adapterName: 'Xero',
        now: NOW,
      }),
    ).toBe('Jane Doe - Acme - Xero - 2026-09-05 14:30')
  })

  it('customer-picks-adapter leaves the adapter out — it is not known yet', () => {
    expect(
      label.buildLabel({
        mode: 'customer-picks-adapter',
        matchedName: 'Jane Doe',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        // Set, and still dropped: in this mode the customer chooses, so naming
        // whatever the Adapter select happens to show would be a lie.
        adapterName: 'Xero',
        now: NOW,
      }),
    ).toBe('Jane Doe - Acme - 2026-09-05 14:30')
  })

  it('self-register names the tenant — there is no customer to name', () => {
    expect(
      label.buildLabel({
        mode: 'self-register',
        // applyMode() clears the customer fields in this mode, but a stale
        // value must not leak into the label even if one survives.
        matchedName: 'Jane Doe',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        adapterName: 'Xero',
        now: NOW,
      }),
    ).toBe('Self-register - Acme - 2026-09-05 14:30')
  })

  it('pinned drops the adapter segment while the Adapter select still says Any', () => {
    expect(
      label.buildLabel({
        mode: 'pinned',
        matchedName: 'Jane Doe',
        tenantName: 'Acme',
        adapterName: '',
        now: NOW,
      }),
    ).toBe('Jane Doe - Acme - 2026-09-05 14:30')
  })
})

describe('who the label names', () => {
  it('prefers the matched customer over anything typed', () => {
    expect(
      label.buildLabel({
        mode: 'customer-picks-adapter',
        matchedName: 'Jane Doe',
        displayName: 'typed name',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        now: NOW,
      }),
    ).toBe('Jane Doe - Acme - 2026-09-05 14:30')
  })

  it('falls back to the display name typed for a customer being created', () => {
    expect(
      label.buildLabel({
        mode: 'customer-picks-adapter',
        matchedName: '',
        displayName: 'Jane Doe (Acme)',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        now: NOW,
      }),
    ).toBe('Jane Doe (Acme) - Acme - 2026-09-05 14:30')
  })

  it('falls back to the email when neither name is known', () => {
    expect(
      label.buildLabel({
        mode: 'customer-picks-adapter',
        email: 'jane@acme.com',
        tenantName: 'Acme',
        now: NOW,
      }),
    ).toBe('jane@acme.com - Acme - 2026-09-05 14:30')
  })

  it('names the tenant when the operator has told us nothing about the customer', () => {
    // A blank form: the customer segment is dropped rather than left as an
    // empty gap, so the tenant leads until an address is typed.
    expect(label.buildLabel({ mode: 'pinned', tenantName: 'Acme', now: NOW })).toBe(
      'Acme - 2026-09-05 14:30',
    )
  })
})

describe('tenantNameFor', () => {
  const TENANTS = [
    { id: 'default', name: 'Default' },
    { id: 't_acme', name: 'Acme Ltd' },
  ]

  it('resolves the id to the tenant name the operator sees elsewhere', () => {
    expect(label.tenantNameFor(TENANTS, 't_acme')).toBe('Acme Ltd')
  })

  it('falls back to the id for a tenant that is not in the list', () => {
    // The list can be empty when listTenants() failed, and a customer can carry
    // a tenant id the form never rendered. The id is still a true answer.
    expect(label.tenantNameFor(TENANTS, 't_ghost')).toBe('t_ghost')
    expect(label.tenantNameFor([], 'default')).toBe('default')
  })

  it('is empty when there is no tenant id at all', () => {
    expect(label.tenantNameFor(TENANTS, '')).toBe('')
  })
})

describe('adapterNameFor', () => {
  const PROVIDERS = [
    { slug: 'xero', name: 'Xero', vertical: 'accounting' },
    { slug: 'stripe', name: 'Stripe', vertical: 'payments' },
  ]

  it('resolves (vertical, slug) to the adapter name', () => {
    expect(label.adapterNameFor(PROVIDERS, 'accounting', 'xero')).toBe('Xero')
  })

  it('falls back to the slug when the pair matches no enabled provider', () => {
    // Keyed on the pair, not the slug alone: the same slug can appear in two
    // verticals, and only the enabled catalog is seeded into the page.
    expect(label.adapterNameFor(PROVIDERS, 'payments', 'xero')).toBe('xero')
    expect(label.adapterNameFor([], 'accounting', 'xero')).toBe('xero')
  })

  it('is empty while the Adapter select still says Any', () => {
    expect(label.adapterNameFor(PROVIDERS, 'accounting', '')).toBe('')
  })
})

describe('formatStamp', () => {
  it('is local 24-hour YYYY-MM-DD HH:mm', () => {
    expect(label.formatStamp(new Date(2026, 8, 5, 14, 30))).toBe('2026-09-05 14:30')
  })

  it('zero-pads a single-digit month, day, hour and minute', () => {
    expect(label.formatStamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07')
  })

  it('keeps midnight as 00 rather than 24 or 12', () => {
    expect(label.formatStamp(new Date(2026, 10, 30, 0, 0))).toBe('2026-11-30 00:00')
  })

  it('the same stamp reaches the label', () => {
    expect(
      label.buildLabel({
        mode: 'pinned',
        email: 'jane@acme.com',
        tenantName: 'Acme Ltd',
        adapterName: 'Xero',
        now: new Date(2026, 0, 5, 9, 7),
      }),
    ).toBe('jane@acme.com - Acme Ltd - Xero - 2026-01-05 09:07')
  })
})
