// Customer email autocomplete for the Connect Link form.
//
// Extracted from views/connect-links/new.ejs, where it fired a request on every
// keystroke: typing a 20-character address issued ~18 calls to
// /customers/search.json, each one proxied through admin-api to
// integration-server. That is a third of a small deployment's per-minute rate
// budget spent on one field, and it is also wrong — responses could arrive out
// of order, so a slower reply for "ma" could overwrite the suggestions for
// "matthew@".
//
// Two changes: wait for a pause in typing before asking, and abort the previous
// request when a new one starts, so a stale reply can never win.
//
// The controller below holds no DOM references, which is what makes it
// testable; the wiring at the bottom is the only part that touches the page.
;(function (global) {
  'use strict'

  /** Typing pause, in ms, before a query is sent. */
  var DEBOUNCE_MS = 250
  /** Shorter queries match too much to be worth a round trip. */
  var MIN_QUERY_LENGTH = 2

  /**
   * @param {{ delay?: number, fetchImpl: (q: string, signal: any) => Promise<any>,
   *           render: (results: any) => void }} opts
   */
  function createSuggestionController(opts) {
    var delay = typeof opts.delay === 'number' ? opts.delay : DEBOUNCE_MS
    var timer = null
    var inFlight = null
    var lastQuery = ''

    function cancelPending() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    return {
      onInput: function (raw) {
        var q = String(raw == null ? '' : raw).trim()
        cancelPending()
        if (q.length < MIN_QUERY_LENGTH || q === lastQuery) return
        timer = setTimeout(function () {
          timer = null
          lastQuery = q
          // Abort the previous request rather than racing it: without this the
          // suggestions shown depend on which reply happens to land last.
          if (inFlight && typeof inFlight.abort === 'function') inFlight.abort()
          inFlight =
            typeof global.AbortController === 'function' ? new global.AbortController() : null
          var signal = inFlight ? inFlight.signal : undefined
          Promise.resolve(opts.fetchImpl(q, signal)).then(opts.render, function () {
            /* aborted or offline — leave the previous suggestions in place */
          })
        }, delay)
      },
      cancel: cancelPending,
    }
  }

  // Exposed so the debounce/abort behaviour can be tested without a DOM.
  global.__customerAutocomplete = { createSuggestionController: createSuggestionController }

  if (typeof document === 'undefined') return

  var emailEl = document.querySelector('input[name="customerEmail"]')
  var suggestionsEl = document.getElementById('customer-suggestions')
  var endUserIdEl = document.getElementById('endUserId')
  if (!emailEl || !suggestionsEl) return

  var controller = createSuggestionController({
    fetchImpl: function (q, signal) {
      return fetch('/customers/search.json?q=' + encodeURIComponent(q), { signal }).then(
        function (res) {
          // A throttled or failed lookup must not clear what is on screen: the
          // old code parsed any response and rendered `body.data || []`, so a
          // 429 wiped the suggestions. Reject instead and keep the last good set.
          if (!res.ok) throw new Error('search failed: ' + res.status)
          return res.json()
        },
      )
    },
    render: function (body) {
      suggestionsEl.innerHTML = ''
      ;((body && body.data) || []).forEach(function (c) {
        var opt = document.createElement('option')
        opt.value = c.email
        opt.label = c.displayName ? c.email + ' — ' + c.displayName : c.email
        opt.dataset.id = c.id
        // The customer's tenant travels with them: a Connect Link must belong
        // to the same tenant as the customer it names, so selecting one here
        // decides the link's tenant rather than leaving it to be guessed.
        opt.dataset.tenant = c.tenantId || ''
        // Carried as data rather than parsed back out of `label`: the label is a
        // display string, and splitting it on a separator turns a customer with
        // no display name into "email (email)".
        opt.dataset.name = c.displayName || ''
        suggestionsEl.appendChild(opt)
      })
      // Reconcile against the list that now exists. Replacing the options can
      // change what the typed address resolves to — and on a form that arrived
      // with a customer preset, this call is what stops the very first search
      // response quietly unbinding them: the seeded option is the only thing
      // holding their id, and `innerHTML = ''` above has just deleted it.
      syncCustomerSelection()
    },
  })

  /**
   * Reconcile the form with whatever the email box currently says.
   *
   * One customer selection drives three things — the hidden `endUserId`, the
   * tenant controls, and whether Display name is worth showing — so they are
   * resolved together rather than in three listeners that can disagree.
   */
  function syncCustomerSelection() {
    var opt = Array.prototype.slice.call(suggestionsEl.children).find(function (o) {
      return o.value === emailEl.value
    })
    var picked = opt && opt.dataset.id ? opt : null
    if (endUserIdEl) endUserIdEl.value = picked ? picked.dataset.id : ''

    // Display name only ever describes someone being created for the first
    // time. Against an existing customer the server ignores it, so the field
    // should not be on screen at all once one is matched. The confirmation
    // replaces it, because a datalist gives no sign that anything was
    // selected.
    var nameField = document.getElementById('customerDisplayNameField')
    var matched = document.getElementById('customerMatched')
    var matchedName = document.getElementById('customerMatchedName')
    if (nameField) nameField.style.display = picked ? 'none' : ''
    if (matched) matched.style.display = picked ? '' : 'none'
    if (matchedName && picked) {
      var name = picked.dataset.name || ''
      matchedName.textContent = name ? name + ' (' + picked.value + ')' : picked.value
    }

    // Tenant controls are only rendered when there is more than one tenant, so
    // everything above must happen whether or not they exist — an early return
    // here would skip the display-name toggle on single-tenant deployments,
    // which is most of them.
    var derivedWrap = document.getElementById('tenantDerived')
    var chooserWrap = document.getElementById('tenantChooser')
    if (derivedWrap && chooserWrap) {
      var derivedText = document.getElementById('tenantDerivedValue')
      var derivedInput = document.getElementById('tenantDerivedInput')
      var sel = chooserWrap.querySelector('select[name="tenantId"]')
      if (picked && picked.dataset.tenant) {
        derivedWrap.style.display = ''
        chooserWrap.style.display = 'none'
        if (derivedText) derivedText.textContent = picked.dataset.tenant
        if (derivedInput) {
          derivedInput.value = picked.dataset.tenant
          derivedInput.disabled = false
        }
        if (sel) sel.disabled = true
      } else {
        derivedWrap.style.display = 'none'
        chooserWrap.style.display = ''
        if (derivedInput) derivedInput.disabled = true
        if (sel) sel.disabled = false
      }
    }

    // Announce what this just resolved, for anything that needs the same
    // answer — the label autofill does. Broadcast rather than called, so the
    // resolution stays in one place: a second reader matching the typed address
    // against the datalist itself would eventually disagree with the badge
    // above.
    //
    // Fired LAST, after the tenant controls above have been rewritten. It used
    // to fire before them, and because `dispatchEvent` is synchronous the
    // listener ran while `#tenantDerivedInput` was still disabled and the
    // chooser still held the pre-match tenant — so the label named the tenant
    // the form was about to stop submitting. The block above is now wrapped
    // rather than guarded by an early return, so a single-tenant deployment,
    // which renders neither control, still reaches this.
    //
    // `CustomEvent` is read off `global` so a document without one — a test's —
    // simply gets no event.
    var CustomEventCtor = global.CustomEvent
    if (CustomEventCtor && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(
        new CustomEventCtor('connect-link:customer-change', {
          detail: {
            // Whether the typed address resolved to somebody at all. Distinct
            // from a non-empty `displayName`: an existing customer recorded
            // with no name matches, and a listener that inferred "matched" from
            // the name would fall back to the typed Display name — a control
            // this function has just hidden and the server discards.
            matched: !!picked,
            displayName: picked ? picked.dataset.name || '' : '',
            email: emailEl.value || '',
            tenantId: picked ? picked.dataset.tenant || '' : '',
          },
        }),
      )
    }
  }

  // Exposed so the DOM behaviour can be driven from a test without synthesising
  // datalist selection events, which jsdom does not implement.
  global.__customerAutocomplete.syncCustomerSelection = syncCustomerSelection

  emailEl.addEventListener('input', function () {
    controller.onInput(emailEl.value)
    // On `input` as well as `change`: `change` only fires on blur, so a field
    // that appears and disappears would lag a keystroke behind the box driving
    // it. Cheap — this reads the datalist already in the DOM, it does not fetch.
    syncCustomerSelection()
  })

  emailEl.addEventListener('change', syncCustomerSelection)

  // Reconcile once on load. The page may arrive with a customer already chosen
  // (`/connect-links/new?customer=<id>`), in which case the server renders the
  // resolved state AND seeds the datalist with them — so this agrees rather than
  // fighting it. It matters for the tenant controls, which are not rendered
  // resolved: a preset customer in another tenant would otherwise leave the
  // chooser sitting on `default`, and submitting would be refused by the
  // tenant-agreement guard for a choice the operator never made.
  if (emailEl.value) syncCustomerSelection()
})(typeof window !== 'undefined' ? window : globalThis)
