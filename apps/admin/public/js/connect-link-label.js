// Mint-time label autofill for the Connect Link form.
//
// A link's label becomes the resulting connection's label, and those are unique
// per tenant and platform — so the operator was asked to invent a unique string
// before they could submit, and found out they had not only when the form came
// back rejected. The field is now written from what has already been chosen:
// who the link is for, which adapter it pins, and the minute it was minted,
// which is the part that makes it unique.
//
// A suggestion, not a decision. The field stays required and editable, and the
// first keystroke in it stops this script for the life of the page — an
// autofill that reappeared over an edit would be worse than none.
//
// The builder below holds no DOM references and never reads the clock — the
// caller passes the Date in, which is what lets a test pin it. The wiring at
// the bottom is the only part that touches the page.
;(function (global) {
  'use strict'

  /** Two digits, so every stamp is the same width and sorts as it reads. */
  function pad(n) {
    return n < 10 ? '0' + n : String(n)
  }

  /**
   * The minted-at stamp: local, 24-hour, `YYYY-MM-DD HH:mm`.
   *
   * Local rather than `toISOString()`: the operator recognises the time they
   * minted the link, not the UTC one, and an ISO string's `T`, seconds and `Z`
   * are noise in a label meant to be read. Minutes are the finest grain worth
   * having — seconds would not make the label more recognisable to anyone.
   *
   * @param {Date} date
   * @returns {string}
   */
  function formatStamp(date) {
    return (
      date.getFullYear() +
      '-' +
      pad(date.getMonth() + 1) +
      '-' +
      pad(date.getDate()) +
      ' ' +
      pad(date.getHours()) +
      ':' +
      pad(date.getMinutes())
    )
  }

  /**
   * A tenant's name, falling back to its id.
   *
   * The list can be empty — `listTenants()` failing is swallowed by its
   * `.catch(() => [])` — and a matched customer can carry a tenant this form
   * never rendered. The id is a true answer in both cases; nothing is not.
   *
   * @param {Array<{ id: string, name: string }>} tenants
   * @param {string} id
   * @returns {string}
   */
  function tenantNameFor(tenants, id) {
    if (!id) return ''
    var found = (tenants || []).find(function (t) {
      return t && t.id === id
    })
    return (found && found.name) || id
  }

  /**
   * An adapter's name, falling back to its slug.
   *
   * Keyed on (vertical, slug) the way the registry is — a slug is only unique
   * within its vertical. Only enabled platforms are seeded into the page, so a
   * pair that matches nothing is ordinary rather than a bug.
   *
   * @param {Array<{ slug: string, name: string, vertical: string }>} providers
   * @param {string} vertical
   * @param {string} slug
   * @returns {string}
   */
  function adapterNameFor(providers, vertical, slug) {
    if (!slug) return ''
    var found = (providers || []).find(function (p) {
      return p && p.slug === slug && p.vertical === vertical
    })
    return (found && found.name) || slug
  }

  /**
   * The label for a form in this state.
   *
   *   pinned                  Jane Doe - Acme - Xero - 2026-09-05 14:30
   *   customer-picks-adapter  Jane Doe - Acme - 2026-09-05 14:30
   *   self-register           Self-register - Acme - 2026-09-05 14:30
   *
   * The tenant is in all three because it is what the connection will belong
   * to, and two customers with the same name in different tenants are the case
   * the label has to keep apart.
   *
   * Empty segments are dropped rather than left as an empty gap, so a pinned
   * link whose adapter is still "Any" reads like the middle line until one is
   * picked.
   *
   * @param {{ mode: string, matchedName?: string, displayName?: string,
   *           email?: string, tenantName?: string, adapterName?: string,
   *           now: Date }} input
   * @returns {string}
   */
  function buildLabel(input) {
    var parts
    if (input.mode === 'self-register') {
      // There is nobody to name: the link is minted before it is known who will
      // claim it, and applyMode() clears the customer fields in this mode. The
      // tenant is the only thing that tells two of these apart.
      parts = ['Self-register', input.tenantName]
    } else {
      // Matched customer, then the name typed for one about to be created, then
      // the address itself — the order the form resolves them in, so the label
      // agrees with the confirmation on screen. Blank on a form where nothing
      // has been said about the customer yet, and dropped below; the tenant is
      // its own segment rather than a stand-in for this one.
      var who = input.matchedName || input.displayName || input.email
      // Only pinned mode knows the adapter. In customer-picks the customer
      // chooses at connect time, so naming whatever the Adapter select happens
      // to show would state a guess as fact.
      parts = [who, input.tenantName, input.mode === 'pinned' ? input.adapterName : '']
    }
    parts.push(formatStamp(input.now))
    return parts
      .filter(function (part) {
        return !!part
      })
      .join(' - ')
  }

  // Exposed so the format can be tested without a DOM.
  global.__connectLinkLabel = {
    buildLabel: buildLabel,
    formatStamp: formatStamp,
    tenantNameFor: tenantNameFor,
    adapterNameFor: adapterNameFor,
  }

  if (typeof document === 'undefined') return

  // Installed by the inline script in views/connect-links/new.ejs, which runs
  // at parse time — this file is deferred, so the seed is always there by now.
  var seed = global.__connectLinkLabelSeed || {}

  var labelEl = document.querySelector('input[name="label"]')
  var linkModeEl = document.getElementById('linkMode')
  if (!labelEl || !linkModeEl) return

  var verticalEl = document.getElementById('vertical')
  var platformEl = document.getElementById('platform')
  var emailEl = document.querySelector('input[name="customerEmail"]')
  var displayNameEl = document.querySelector('input[name="customerDisplayName"]')

  // Stamped when the page loads, not when the field is rewritten: otherwise the
  // label would creep forward a minute at a time while the rest of the form is
  // filled in, and the operator would watch it change under them.
  var mintedAt = new Date(typeof seed.mintedAt === 'number' ? seed.mintedAt : Date.now())

  // What customer-autocomplete.js last resolved. Taken from its event rather
  // than re-derived here: it already matches the typed address against the
  // datalist, and a second copy of that resolution would eventually disagree
  // with the "Existing" badge next to it.
  var customer = { matched: false, displayName: '', email: '', tenantId: '' }

  // A label the operator has touched is theirs, permanently.
  //
  // The answer has to survive a round trip, so it rides in a hidden field the
  // server echoes back rather than being inferred from the box being non-empty.
  // Inferring it was wrong on exactly the form that needs the autofill most: a
  // rejected submit comes back with the label echoed in, the autofill read its
  // own text as the operator's and stopped for good, and the operator fixed the
  // vertical the error was about and submitted a label that still named no
  // adapter and the wrong minute.
  //
  // No flag at all means no autofill has run against this form, so whatever is
  // in the box is not ours to overwrite.
  var ownedEl = document.getElementById('labelAutofilled')
  var operatorOwned = ownedEl ? ownedEl.value !== '1' : !!labelEl.value
  labelEl.addEventListener('input', function () {
    operatorOwned = true
    if (ownedEl) ownedEl.value = '0'
  })

  /** The tenant this link would be minted into, as the form currently stands. */
  function currentTenantId() {
    // The matched customer's own tenant first. It is the freshest answer and
    // the one the form will submit — a link must belong to its customer's
    // tenant — and taking it from the event rather than the DOM keeps this
    // right regardless of when the controls below are rewritten.
    if (customer.matched && customer.tenantId) return customer.tenantId
    // Enabled only while a matched customer's tenant is driving the form.
    var derived = document.getElementById('tenantDerivedInput')
    if (derived && !derived.disabled && derived.value) return derived.value
    // The chooser: a select on multi-tenant deployments, a plain input on the
    // branch that draws one because the tenant list could not be loaded.
    var chooser = document.getElementById('linkTenant')
    if (chooser && !chooser.disabled && chooser.value) return chooser.value
    // Single-tenant deployments render neither control, and the route defaults
    // to `default` for exactly that case.
    return customer.tenantId || 'default'
  }

  function regenerate() {
    if (operatorOwned) return
    // Live from the field rather than from the event: this script runs before
    // the autocomplete has reconciled anything, and a form re-rendered with an
    // address that matched nobody never fires one.
    var email = emailEl ? emailEl.value : customer.email
    // The matched name only holds while the address it was matched against is
    // still in the box. applyMode() empties that box when self-register is
    // chosen, and switching back would otherwise leave the label naming a
    // customer the form no longer has.
    var stillMatched = customer.matched && !!email && email === customer.email
    var matchedName = stillMatched ? customer.displayName : ''
    labelEl.value = buildLabel({
      mode: linkModeEl.value,
      matchedName: matchedName,
      // Only while nobody is matched. Display name describes a customer being
      // created for the first time: `syncCustomerSelection` hides the field
      // once an address resolves, and the route drops `customerDisplayName`
      // outright when `endUserId` is set. A matched customer recorded with no
      // name would otherwise be labelled with whatever an invisible, discarded
      // control still held — someone else's name.
      displayName: stillMatched ? '' : displayNameEl ? displayNameEl.value : '',
      email: email,
      tenantName: tenantNameFor(seed.tenants, currentTenantId()),
      adapterName: adapterNameFor(
        seed.providers,
        verticalEl ? verticalEl.value : '',
        platformEl ? platformEl.value : '',
      ),
      now: mintedAt,
    })
  }

  // Every listener below is registered after the inline script's, because this
  // file is deferred — so each one runs after the handler that rewires the mode,
  // the adapter list and the scope groups. That ordering is what lets the label
  // be regenerated by listening rather than by being called from inside those
  // handlers: by the time these fire, the form already says what it means.
  linkModeEl.addEventListener('change', regenerate)
  if (verticalEl) verticalEl.addEventListener('change', regenerate)
  if (platformEl) platformEl.addEventListener('change', regenerate)
  // Applying a template hydrates mode, vertical and adapter in one handler
  // without firing any of their change events, so it is listened for directly.
  var applyTplEl = document.getElementById('applyTemplate')
  if (applyTplEl) applyTplEl.addEventListener('change', regenerate)
  // Display name is who the label names when the customer does not exist yet —
  // there is no match, so nothing else would report the change.
  if (displayNameEl) displayNameEl.addEventListener('input', regenerate)
  // The tenant is what a self-register label names. Only the chooser is worth
  // listening to: the derived input moves only when a customer does, and that
  // arrives on the event below.
  var tenantChooserEl = document.getElementById('linkTenant')
  if (tenantChooserEl) tenantChooserEl.addEventListener('change', regenerate)

  document.addEventListener('connect-link:customer-change', function (ev) {
    var detail = (ev && ev.detail) || {}
    customer = {
      matched: !!detail.matched,
      displayName: detail.displayName || '',
      email: detail.email || '',
      tenantId: detail.tenantId || '',
    }
    regenerate()
  })

  // Fill the field before anything is touched. A label that only appeared after
  // the first change would read as a reaction to that one change, rather than as
  // a description of the whole form.
  regenerate()
})(typeof window !== 'undefined' ? window : globalThis)
