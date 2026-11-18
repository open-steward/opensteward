/**
 * The two Connect Link form scripts driven together, against one document.
 *
 * `connect-link-label.test.ts` covers the label format; it loads the script
 * with no `document` at all, so everything below the DOM guard — which tenant
 * is read, which customer is named, when the autofill stops — had no coverage
 * whatsoever. Three defects lived in exactly that gap:
 *
 *   - `customer-autocomplete.js` announced the matched customer BEFORE it
 *     rewrote the tenant controls. `dispatchEvent` is synchronous, so the
 *     label was written while `#tenantDerivedInput` was still disabled and the
 *     chooser still held the pre-match tenant: the label named one tenant and
 *     the form submitted another.
 *   - a matched customer recorded with no display name fell through to the
 *     typed Display name — a control the form hides and the route discards —
 *     so the link was labelled with whoever had been typed there before.
 *   - a rejected submit echoes the label back, the autofill read its own text
 *     as the operator's, and switched itself off for the life of the page.
 *
 * All three are ordering and precedence bugs between two files, so they are
 * only reachable by loading both, in the order views/connect-links/new.ejs
 * loads them, and driving them through the same fake document. There is no
 * jsdom in this workspace (see customer-selection-sync.test.ts) — the surface
 * these two scripts touch is small enough to fake honestly.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface FakeEl {
  value: string
  textContent: string
  style: { display: string }
  dataset: Record<string, string>
  children: FakeEl[]
  disabled?: boolean
  listeners: Record<string, Array<() => void>>
  addEventListener: (type: string, fn: () => void) => void
  querySelector: (sel: string) => FakeEl | null
  innerHTML: string
  label?: string
}

function el(init: Partial<FakeEl> = {}): FakeEl {
  const node: FakeEl = {
    value: '',
    textContent: '',
    style: { display: '' },
    dataset: {},
    children: [],
    listeners: {},
    innerHTML: '',
    addEventListener(type, fn) {
      ;(node.listeners[type] ??= []).push(fn)
    },
    querySelector: () => null,
    ...init,
  }
  return node
}

/** A datalist option as customer-autocomplete's `render()` builds one. */
const suggestion = (email: string, name: string, id = 'eu_1', tenant = 'default') =>
  el({ value: email, label: `${email} — ${name}`, dataset: { id, tenant, name } })

interface Harness {
  /** customer-autocomplete's reconcile point — what every listener funnels to. */
  sync: () => void
  label: FakeEl
  labelAutofilled: FakeEl
  email: FakeEl
  displayName: FakeEl
  linkMode: FakeEl
  vertical: FakeEl
  platform: FakeEl
  linkTenant: FakeEl
  tenantDerivedInput: FakeEl
  suggestions: FakeEl
  /** Fire a listener registered on an element, the way a browser would. */
  fire: (node: FakeEl, type: string) => void
}

const TENANTS = [
  { id: 'default', name: 'Default' },
  { id: 't_acme', name: 'Acme Ltd' },
]
const PROVIDERS = [{ vertical: 'accounting', slug: 'xero', name: 'Xero' }]

/** Minted 2026-09-05 14:30 local, so every stamp below is fixed. */
const MINTED_AT = new Date(2026, 8, 5, 14, 30).getTime()

function mount(
  opts: { withTenantControls?: boolean; label?: string; labelAutofilled?: string } = {},
): Harness {
  const withTenantControls = opts.withTenantControls ?? true

  const label = el({ value: opts.label ?? '' })
  const labelAutofilled = el({ value: opts.labelAutofilled ?? '1' })
  const email = el()
  const displayName = el()
  const suggestions = el()
  const linkMode = el({ value: 'pinned' })
  const vertical = el({ value: '' })
  const platform = el({ value: '' })
  const linkTenant = el({ value: 'default' })
  const tenantDerivedInput = el({ disabled: true })

  const byId: Record<string, FakeEl> = {
    linkMode,
    vertical,
    platform,
    labelAutofilled,
    endUserId: el(),
    customerDisplayNameField: el(),
    customerMatched: el({ style: { display: 'none' } }),
    customerMatchedName: el(),
    'customer-suggestions': suggestions,
  }

  if (withTenantControls) {
    byId.linkTenant = linkTenant
    byId.tenantDerived = el({ style: { display: 'none' } })
    byId.tenantDerivedValue = el()
    byId.tenantDerivedInput = tenantDerivedInput
    byId.tenantChooser = el({ querySelector: () => linkTenant })
  }

  const bySelector: Record<string, FakeEl> = {
    'input[name="label"]': label,
    'input[name="customerEmail"]': email,
    'input[name="customerDisplayName"]': displayName,
  }

  const docListeners: Record<string, Array<(ev: unknown) => void>> = {}
  const document = {
    querySelector: (sel: string) => bySelector[sel] ?? null,
    getElementById: (id: string) => byId[id] ?? null,
    createElement: () => el(),
    addEventListener: (type: string, fn: (ev: unknown) => void) => {
      ;(docListeners[type] ??= []).push(fn)
    },
    // Synchronous, like the real one — which is the whole point of this file.
    dispatchEvent: (ev: { type: string }) => {
      ;(docListeners[ev.type] ?? []).forEach((fn) => fn(ev))
      return true
    },
  }

  const sandbox: Record<string, unknown> = {
    AbortController,
    CustomEvent: class {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    },
    __connectLinkLabelSeed: { tenants: TENANTS, providers: PROVIDERS, mintedAt: MINTED_AT },
  }

  const load = (file: string) =>
    new Function(
      'globalThis',
      'window',
      'document',
      readFileSync(join(import.meta.dirname, '../../public/js/', file), 'utf8'),
    )(sandbox, undefined, document)

  // The order views/connect-links/new.ejs loads them: the label script's
  // document listener has to exist before the autocomplete can dispatch to it.
  load('connect-link-label.js')
  load('customer-autocomplete.js')

  const exposed = sandbox.__customerAutocomplete as { syncCustomerSelection: () => void }
  return {
    sync: exposed.syncCustomerSelection,
    label,
    labelAutofilled,
    email,
    displayName,
    linkMode,
    vertical,
    platform,
    linkTenant,
    tenantDerivedInput,
    suggestions,
    fire: (node, type) => (node.listeners[type] ?? []).forEach((f) => f()),
  }
}

describe('the tenant the label names', () => {
  let h: Harness

  beforeEach(() => {
    h = mount()
    h.suggestions.children = [suggestion('jane@acme.example', 'Jane Doe', 'eu_1', 't_acme')]
  })

  it('is the matched customer’s, not the one the chooser held a moment ago', () => {
    // The defect: the chooser sits on `default` until the match rewrites it,
    // and the announcement used to arrive first — so the label said "Default"
    // while the form went on to submit `t_acme`.
    h.email.value = 'jane@acme.example'
    h.sync()

    expect(h.label.value).toBe('Jane Doe - Acme Ltd - 2026-09-05 14:30')
    // What the form will actually submit, for the same customer.
    expect(h.tenantDerivedInput.disabled).toBe(false)
    expect(h.tenantDerivedInput.value).toBe('t_acme')
  })

  it('goes back to the chooser’s tenant when the address stops matching', () => {
    h.email.value = 'jane@acme.example'
    h.sync()
    expect(h.label.value).toContain('Acme Ltd')

    h.email.value = 'jane@acme.example.org'
    h.sync()

    expect(h.tenantDerivedInput.disabled).toBe(true)
    expect(h.label.value).toBe('jane@acme.example.org - Default - 2026-09-05 14:30')
  })

  it('is resolved on a single-tenant deployment, which renders no controls', () => {
    // Neither control exists, so the route's own `|| DEFAULT_TENANT` is what
    // the link gets — the label has to agree with that rather than go blank.
    const bare = mount({ withTenantControls: false })
    bare.suggestions.children = [suggestion('jane@acme.example', 'Jane Doe')]
    bare.email.value = 'jane@acme.example'
    bare.sync()

    expect(bare.label.value).toBe('Jane Doe - Default - 2026-09-05 14:30')
  })
})

describe('who the label names', () => {
  it('does not fall back to a hidden Display name once somebody is matched', () => {
    // A customer recorded with no display name still matches. The typed
    // Display name is hidden by the match and dropped by the route, so reading
    // it here labelled the link with a different person entirely.
    const h = mount()
    h.suggestions.children = [suggestion('nameless@acme.example', '', 'eu_2', 't_acme')]
    h.displayName.value = 'Somebody Else'
    h.email.value = 'nameless@acme.example'
    h.sync()

    expect(h.label.value).toBe('nameless@acme.example - Acme Ltd - 2026-09-05 14:30')
    expect(h.label.value).not.toContain('Somebody Else')
  })

  it('uses the typed Display name while nobody is matched', () => {
    const h = mount()
    h.displayName.value = 'Jane Doe (Acme)'
    h.email.value = 'brand-new@acme.example'
    h.sync()

    expect(h.label.value).toBe('Jane Doe (Acme) - Default - 2026-09-05 14:30')
  })
})

describe('when the autofill stops', () => {
  it('stops for good once the operator types in the field', () => {
    const h = mount()
    h.suggestions.children = [suggestion('jane@acme.example', 'Jane Doe', 'eu_1', 't_acme')]

    h.label.value = 'Q2 reconciliation — Acme'
    h.fire(h.label, 'input')

    h.email.value = 'jane@acme.example'
    h.sync()

    expect(h.label.value).toBe('Q2 reconciliation — Acme')
    // Recorded for the round trip, so a rejected submit comes back knowing it.
    expect(h.labelAutofilled.value).toBe('0')
  })

  it('keeps going on a form re-rendered with a label it wrote itself', () => {
    // The regression: an error re-render echoes the label back, and treating a
    // non-empty box as "the operator owns this" left the autofill dead — so
    // the operator fixed the vertical the error was about and submitted a
    // label still naming no adapter.
    const h = mount({
      label: 'jane@acme.example - Default - 2026-09-05 14:30',
      labelAutofilled: '1',
    })
    // Everything the operator submitted comes back with the error, the email
    // included — `formValues` in src/core/routes/connect-links.ts.
    h.email.value = 'jane@acme.example'
    h.vertical.value = 'accounting'
    h.platform.value = 'xero'
    h.fire(h.platform, 'change')

    expect(h.label.value).toBe('jane@acme.example - Default - Xero - 2026-09-05 14:30')
  })

  it('leaves a re-rendered label alone when the operator had typed it', () => {
    const h = mount({ label: 'Q2 reconciliation — Acme', labelAutofilled: '0' })
    h.vertical.value = 'accounting'
    h.platform.value = 'xero'
    h.fire(h.platform, 'change')

    expect(h.label.value).toBe('Q2 reconciliation — Acme')
  })
})

describe('the adapter segment', () => {
  it('appears in pinned mode once an adapter is chosen', () => {
    const h = mount()
    h.email.value = 'jane@acme.example'
    h.vertical.value = 'accounting'
    h.platform.value = 'xero'
    h.fire(h.platform, 'change')

    expect(h.label.value).toBe('jane@acme.example - Default - Xero - 2026-09-05 14:30')
  })

  it('is left out of a customer-picks link, where the adapter is not decided yet', () => {
    const h = mount()
    h.email.value = 'jane@acme.example'
    h.vertical.value = 'accounting'
    h.platform.value = 'xero'
    h.linkMode.value = 'customer-picks-adapter'
    h.fire(h.linkMode, 'change')

    expect(h.label.value).toBe('jane@acme.example - Default - 2026-09-05 14:30')
  })

  it('names the tenant and nobody else for a self-register link', () => {
    const h = mount()
    h.email.value = 'jane@acme.example'
    h.linkMode.value = 'self-register'
    h.fire(h.linkMode, 'change')

    expect(h.label.value).toBe('Self-register - Default - 2026-09-05 14:30')
  })
})
