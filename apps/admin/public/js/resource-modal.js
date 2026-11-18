/**
 * Resource modal — opens a detail page in a dialog without replacing it.
 *
 * THE PATTERN, for the next resource that adopts it (sync jobs, API keys,
 * webhook delivery settings):
 *
 *   1. Leave the detail route and its view exactly as they are. They keep
 *      rendering a full page and stay the source of truth — deep links,
 *      bookmarks, "open in new tab", no-JS and role-gated direct access all
 *      keep working because nothing about them changes.
 *   2. In the list view, add `data-modal` to the link that already points at
 *      the detail URL. That is the entire opt-in:
 *        <a href="/sync-jobs/<%= j.id %>" data-modal>…</a>
 *   3. There is no step 3. layout.ejs already ships this script and the empty
 *      <dialog> (views/_resource-modal.ejs) on every signed-in page.
 *
 * How it works: the click is intercepted, the detail URL is fetched, and the
 * page's `main.app-content` is lifted out of the response into the dialog. The
 * extraction is client-side on purpose — the server is never told a modal is
 * involved, so there is no fragment branch that can drift out of step with the
 * page, and no route to keep two renderings of.
 *
 * What a detail page may and may not rely on inside the dialog:
 *   - <script> tags in the fetched page do NOT run. The response is parsed with
 *     DOMParser, which never executes scripts, and moving a script node into
 *     the live document does not revive it. Behaviour a detail page needs must
 *     come from the delegated document-level listeners in layout.ejs — that is
 *     why [data-copy] and the theme toggle keep working here and an inline
 *     <script> in the view would not.
 *   - Forms submit as ordinary full-page POSTs and land on the detail page
 *     afterwards. The write and its redirect are unchanged; the modal simply
 *     ends. Keep the `_csrf` hidden input as-is — it comes along in the copy.
 *   - Anything that exists only because the page is a page — the "Back to …"
 *     link that would sit next to the close button — can be marked
 *     `data-modal-omit`, which drops it from the dialog copy only. The page
 *     itself still shows it.
 *
 * Failure is always navigation, never a broken dialog: a network error, a
 * non-200, or a response with nothing extractable (a session that expired mid
 * session returns the login page, which has no `main.app-content`) sends the
 * browser to the URL and lets the server do whatever it was going to do.
 */
;(function () {
  'use strict'

  /** The shell's content region — what layout.ejs wraps every view in. */
  var CONTENT_SELECTOR = 'main.app-content'

  var dialog = null
  var body = null
  /** The link that opened the dialog; focus goes back to it on close. */
  var opener = null
  /**
   * True while this dialog owns the top history entry. Close then owes a
   * history.back() to put the list's URL back; Back itself clears it first so
   * closing does not unwind a second entry.
   */
  var owesHistory = false

  function ready() {
    if (dialog) return true
    dialog = document.querySelector('dialog[data-resource-modal]')
    if (!dialog) return false
    body = dialog.querySelector('[data-resource-modal-body]')
    if (!body) {
      dialog = null
      return false
    }
    wire()
    return true
  }

  function wire() {
    dialog.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-resource-modal-close]')) {
        dialog.close()
        return
      }
      // A click on the backdrop is reported against the dialog itself, so the
      // target alone cannot tell it from a click on the dialog's own padding.
      // The pointer position can.
      if (e.target !== dialog) return
      var r = dialog.getBoundingClientRect()
      var inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) dialog.close()
    })

    // One handler for every way out — Escape, the close button, the backdrop —
    // because <dialog> funnels all of them through `close`.
    dialog.addEventListener('close', function () {
      body.innerHTML = ''
      dialog.removeAttribute('aria-label')
      if (owesHistory) {
        owesHistory = false
        history.back()
      }
      // showModal() restores focus on its own in current browsers; doing it
      // explicitly keeps the link focused in the ones that do not.
      if (opener && document.contains(opener)) opener.focus()
      opener = null
    })

    window.addEventListener('popstate', function (e) {
      if (dialog.open) {
        // Back has already unwound the entry this dialog pushed.
        owesHistory = false
        dialog.close()
        return
      }
      // Forward, back into an entry a dialog had pushed. Re-opening it would
      // leave the URL and the closed dialog disagreeing later, so honour the
      // URL the only other way there is: as a page.
      if (e.state && e.state.resourceModal === location.href) {
        window.location.href = location.href
      }
    })
  }

  /**
   * Pull the detail page's content out of a fetched document.
   * @returns {DocumentFragment|null} null when there is nothing to show.
   */
  function extract(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html')
    var content = doc.querySelector(CONTENT_SELECTOR)
    if (!content) return null
    content.querySelectorAll('[data-modal-omit]').forEach(function (el) {
      el.remove()
    })
    var frag = doc.createDocumentFragment()
    while (content.firstChild) frag.appendChild(content.firstChild)
    if (!frag.firstChild) return null
    return frag
  }

  function show(frag, url, link) {
    opener = link
    body.innerHTML = ''
    body.appendChild(frag)

    // The dialog's accessible name is the detail page's own heading, so a
    // screen reader announces the same thing the page would have. Read from
    // a copy with aria-hidden nodes removed: textContent does not honour
    // aria-hidden, and a decorative monogram or icon beside the heading's
    // text would otherwise be spoken as part of the name.
    var heading = body.querySelector('h1')
    var name = link.textContent || ''
    if (heading) {
      var copy = heading.cloneNode(true)
      copy.querySelectorAll('[aria-hidden="true"]').forEach(function (el) {
        el.remove()
      })
      name = copy.textContent || ''
    }
    dialog.setAttribute('aria-label', name.trim() || 'Details')

    dialog.showModal()
    body.scrollTop = 0

    // The URL is half the point: the address bar holds the detail page, so the
    // modal can be copied out and sent to someone, and Back closes it.
    if (url.href !== location.href) {
      history.pushState({ resourceModal: url.href }, '', url.href)
      owesHistory = true
    }
  }

  function open(url, link) {
    fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.text()
      })
      .then(function (html) {
        var frag = extract(html)
        if (!frag) throw new Error('no content region in response')
        show(frag, url, link)
      })
      .catch(function () {
        window.location.href = url.href
      })
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return
    // A modified click means the operator asked for a new tab or window. That
    // is a navigation and stays one.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    var link = e.target && e.target.closest && e.target.closest('a[data-modal]')
    if (!link) return
    if (link.target && link.target !== '_self') return
    var href = link.getAttribute('href')
    if (!href || href.charAt(0) === '#') return

    var url
    try {
      url = new URL(href, location.href)
    } catch (err) {
      return
    }
    if (url.origin !== location.origin) return
    // Links inside an open dialog are left alone: stacking modals would leave
    // history owing more than one entry back.
    if (!ready() || dialog.open) return

    e.preventDefault()
    open(url, link)
  })
})()
