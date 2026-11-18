/**
 * What the Connect Link form does once the typed email resolves to somebody.
 *
 * A datalist gives no sign that a selection happened, so on its own the form
 * cannot tell you which of two very different things is about to occur:
 * issuing the link to an existing customer, or creating a new one.
 *
 * The server ignores Display name for an existing customer (pinned in
 * `packages/shared/tests/control-plane/connect-link-preserves-customer.test.ts`).
 * This covers the UI half a reader of that file cannot see: the form must not
 * offer a field that does nothing, and must say who it matched.
 *
 * There is no jsdom in this workspace and the existing autocomplete test
 * deliberately loads the script with no `document` at all, so the DOM is
 * hand-built here rather than pulling in an environment for one file. The
 * surface the script touches is small enough to fake honestly.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface FakeEl {
  id?: string
  value: string
  label?: string
  textContent: string
  style: { display: string }
  dataset: Record<string, string>
  children: FakeEl[]
  disabled?: boolean
  listeners: Record<string, Array<() => void>>
  addEventListener: (type: string, fn: () => void) => void
  querySelector: (sel: string) => FakeEl | null
  innerHTML: string
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

interface Harness {
  sync: () => void
  email: FakeEl
  endUserId: FakeEl
  nameField: FakeEl
  matched: FakeEl
  matchedName: FakeEl
  suggestions: FakeEl
  fire: (type: string) => void
}

/** Load the browser script against a fake document and hand back the pieces. */
function mount(opts: { withTenantControls?: boolean } = {}): Harness {
  const email = el()
  const suggestions = el()
  const endUserId = el()
  const nameField = el()
  const matched = el({ style: { display: 'none' } })
  const matchedName = el()

  const byId: Record<string, FakeEl> = {
    endUserId,
    customerDisplayNameField: nameField,
    customerMatched: matched,
    customerMatchedName: matchedName,
    'customer-suggestions': suggestions,
  }

  if (opts.withTenantControls) {
    const select = el()
    byId.tenantDerived = el({ style: { display: 'none' } })
    byId.tenantDerivedValue = el()
    byId.tenantDerivedInput = el({ disabled: true })
    byId.tenantChooser = el({ querySelector: () => select })
  }

  const document = {
    querySelector: (sel: string) => (sel === 'input[name="customerEmail"]' ? email : null),
    getElementById: (id: string) => byId[id] ?? null,
    createElement: () => el(),
  }

  const source = readFileSync(
    join(import.meta.dirname, '../../public/js/customer-autocomplete.js'),
    'utf8',
  )
  const sandbox: Record<string, unknown> = { AbortController }
  new Function('globalThis', 'window', 'document', source)(sandbox, undefined, document)

  const exposed = sandbox.__customerAutocomplete as { syncCustomerSelection: () => void }
  return {
    sync: exposed.syncCustomerSelection,
    email,
    endUserId,
    nameField,
    matched,
    matchedName,
    suggestions,
    fire: (type) => (email.listeners[type] ?? []).forEach((f) => f()),
  }
}

/** A datalist option as `render()` builds one. */
const suggestion = (email: string, name: string, id = 'eu_1', tenant = 'default') =>
  el({ value: email, label: `${email} — ${name}`, dataset: { id, tenant, name } })

let h: Harness

beforeEach(() => {
  h = mount()
  h.suggestions.children = [suggestion('jane@acme.example', 'Jane Doe (Acme)')]
})

describe('when the typed email matches an existing customer', () => {
  beforeEach(() => {
    h.email.value = 'jane@acme.example'
    h.sync()
  })

  it('captures the customer id so no duplicate is created', () => {
    expect(h.endUserId.value).toBe('eu_1')
  })

  it('stops offering a Display name that would do nothing', () => {
    expect(h.nameField.style.display).toBe('none')
  })

  it('says who was matched, which the datalist never did', () => {
    expect(h.matched.style.display).toBe('')
    expect(h.matchedName.textContent).toContain('Jane Doe (Acme)')
    expect(h.matchedName.textContent).toContain('jane@acme.example')
  })
})

describe('when the typed email is new', () => {
  it('offers Display name, because it names the customer being created', () => {
    h.email.value = 'brand-new@acme.example'
    h.sync()

    expect(h.endUserId.value).toBe('')
    expect(h.nameField.style.display).toBe('')
    expect(h.matched.style.display).toBe('none')
  })

  it('puts the field back when a matched address is edited away', () => {
    h.email.value = 'jane@acme.example'
    h.sync()
    expect(h.nameField.style.display).toBe('none')

    h.email.value = 'jane@acme.example.org'
    h.sync()
    expect(h.nameField.style.display).toBe('')
    expect(h.endUserId.value).toBe('')
  })
})

describe('the form keeps up with the box', () => {
  it('reconciles on input, not only on blur', () => {
    // `change` fires on blur. Driving the toggle from it alone would leave the
    // field a keystroke behind whatever the operator is typing.
    h.email.value = 'jane@acme.example'
    h.fire('input')
    expect(h.nameField.style.display).toBe('none')
  })

  it('reconciles on change as well, for a datalist pick', () => {
    h.email.value = 'jane@acme.example'
    h.fire('change')
    expect(h.endUserId.value).toBe('eu_1')
  })
})

describe('single-tenant deployments', () => {
  it('still toggles Display name with no tenant controls on the page', () => {
    // The tenant block returns early when its elements are absent, which is
    // every single-tenant deployment. Anything sequenced after that return
    // would silently never run for them.
    const bare = mount({ withTenantControls: false })
    bare.suggestions.children = [suggestion('jane@acme.example', 'Jane Doe (Acme)')]
    bare.email.value = 'jane@acme.example'
    bare.sync()

    expect(bare.endUserId.value).toBe('eu_1')
    expect(bare.nameField.style.display).toBe('none')
    expect(bare.matched.style.display).toBe('')
  })

  it('drives the tenant controls when they are present', () => {
    const withTenants = mount({ withTenantControls: true })
    withTenants.suggestions.children = [
      suggestion('jane@acme.example', 'Jane Doe (Acme)', 'eu_1', 'dept-a'),
    ]
    withTenants.email.value = 'jane@acme.example'
    withTenants.sync()

    expect(withTenants.nameField.style.display).toBe('none')
  })
})

describe('a customer with no display name', () => {
  it('is confirmed by address alone, not by the address twice', () => {
    // The name travels as data (data-name), never recovered by splitting the
    // option's label on its separator — with no display name the label is just
    // the address, so a split would render the address twice:
    // "jane@acme.example (jane@acme.example)".
    const bare = mount()
    bare.suggestions.children = [
      el({
        value: 'nameless@acme.example',
        label: 'nameless@acme.example',
        dataset: { id: 'eu_2', tenant: 'default', name: '' },
      }),
    ]
    bare.email.value = 'nameless@acme.example'
    bare.sync()

    expect(bare.matchedName.textContent).toBe('nameless@acme.example')
  })
})
