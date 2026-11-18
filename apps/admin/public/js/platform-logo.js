// A platform logo that fails to load becomes the monogram it carries.
//
// Every <img> rendered by src/core/platform-logo.ts holds its own fallback in
// data-logo-fallback (and, for self-hosted logos, one more URL to try in
// data-logo-next). The error event does not bubble, so this listens in the
// capture phase — one listener for the whole document, surviving any DOM
// replacement a page does after load.
// Same behaviour as the catalog's grid listener in packages/platforms-ui.
;(function () {
  document.addEventListener(
    'error',
    function (ev) {
      var img = ev.target
      if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-logo-fallback')) return
      var next = img.getAttribute('data-logo-next')
      if (next) {
        img.removeAttribute('data-logo-next')
        img.src = next
        return
      }
      // Replace the whole box, not just the image: the monogram is a tile of
      // its own and would otherwise sit framed inside a second one.
      var box = img.closest('.plogo') || img
      box.outerHTML = img.getAttribute('data-logo-fallback')
    },
    true,
  )
})()
