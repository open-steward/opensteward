/**
 * Accessibility helpers — no framework, no build step. Loaded from
 * layout.ejs so every page picks it up.
 *
 * Currently provides:
 *   - Roving-tabindex keyboard navigation for `.choice-card[role="radio"]`
 *     groups (arrow keys move selection within the radiogroup, Space
 *     selects).
 */
;(function () {
  'use strict'

  document.addEventListener('keydown', function (e) {
    var target = e.target
    if (!target || target.nodeType !== 1) return
    var card = target.closest && target.closest('.choice-card[role="radio"]')
    if (!card) return

    var movement = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
    var activation = [' ', 'Enter']
    var isMovement = movement.indexOf(e.key) !== -1
    var isActivation = activation.indexOf(e.key) !== -1
    if (!isMovement && !isActivation) return

    e.preventDefault()

    var group = card.closest('[role="radiogroup"]')
    if (!group) return

    var cards = Array.prototype.slice.call(
      group.querySelectorAll('.choice-card[role="radio"]'),
    )
    if (cards.length === 0) return

    var i = cards.indexOf(card)
    var next = card
    if (isMovement) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        next = cards[(i + 1) % cards.length]
      } else {
        next = cards[(i - 1 + cards.length) % cards.length]
      }
    }

    cards.forEach(function (c) {
      var checked = c === next
      c.setAttribute('aria-checked', checked ? 'true' : 'false')
      c.setAttribute('tabindex', checked ? '0' : '-1')
      var input = c.querySelector('input[type="radio"]')
      if (input) input.checked = checked
    })
    next.focus()
  })
})()
