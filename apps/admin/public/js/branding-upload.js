// Branding file uploads (logo / favicon / font) for the company-info form and
// the setup wizard's step 2. Reads a selected file as a data URL and writes it
// into a hidden input so the form posts as standard
// application/x-www-form-urlencoded — no upload server needed.
//
// Each file input is self-wired from data-* attributes so the markup stays the
// single source of truth for the caps (which mirror the server-side Zod guards
// in packages/shared/src/schemas/company-info.ts):
//   data-target     id of the hidden input that receives the data URL
//   data-hint       id of the field's hint element (per-field error display)
//   data-max-bytes  reject files larger than this many bytes
//   data-label      human label used in error copy, e.g. "Logo"
//
// Every failure is surfaced (oversize, read error): the field hint turns red
// with a specific message AND a shared top-of-form alert (#brandingFormError)
// repeats it. A file is never silently dropped.
;(function () {
  'use strict'

  function formatBytes(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
    return Math.round(n / 1024) + ' KB'
  }

  // The .alert class sets `display: flex`, which (as an author rule) overrides
  // the [hidden] attribute's UA `display: none`. So toggle inline display
  // directly instead of relying on `hidden`: '' falls back to the stylesheet's
  // flex, 'none' truly hides it.
  function showTopError(message) {
    var box = document.getElementById('brandingFormError')
    if (!box) return
    box.textContent = message
    box.style.display = ''
  }

  function clearTopError() {
    var box = document.getElementById('brandingFormError')
    if (!box) return
    box.textContent = ''
    box.style.display = 'none'
  }

  function wire(input) {
    var hiddenId = input.getAttribute('data-target')
    var hintId = input.getAttribute('data-hint')
    var maxBytes = parseInt(input.getAttribute('data-max-bytes') || '0', 10)
    var label = input.getAttribute('data-label') || 'File'
    if (!hiddenId) return

    var hint = hintId ? document.getElementById(hintId) : null
    var defaultHintText = hint ? hint.textContent : ''

    function fail(message) {
      if (hint) {
        hint.textContent = message
        hint.style.color = 'var(--danger)'
      }
      showTopError(message)
      input.value = ''
    }

    function clearError() {
      if (hint) {
        hint.textContent = defaultHintText
        hint.style.color = ''
      }
      clearTopError()
    }

    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0]
      if (!file) return
      clearError()

      if (maxBytes && file.size > maxBytes) {
        fail(
          label +
            ' is too large (' +
            formatBytes(file.size) +
            '). Maximum ' +
            formatBytes(maxBytes) +
            ' — pick a smaller image or compress it first.',
        )
        return
      }

      var reader = new FileReader()
      reader.onload = function () {
        var hidden = document.getElementById(hiddenId)
        if (hidden) hidden.value = reader.result
      }
      reader.onerror = function () {
        fail('Could not read the selected ' + label.toLowerCase() + ' file. Please try another file.')
      }
      reader.readAsDataURL(file)
    })
  }

  function init() {
    var inputs = document.querySelectorAll('input[type="file"][data-target]')
    for (var i = 0; i < inputs.length; i++) wire(inputs[i])
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
