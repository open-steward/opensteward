// Preset logic for the scope-group form (views/scope-groups/edit.ejs).
//
// Extracted so it can be tested without a DOM — there is no jsdom in this
// workspace; see tests/unit/customer-autocomplete.test.ts for the pattern.
//
// The bug this exists to pin: choosing Read-write ticked every recommended
// scope, and choosing Read-only afterwards changed nothing. The inline preset
// code returned early when the platform had no catalogued read scopes — which
// is most platforms, since curated read sets exist for a minority — so the
// previous selection survived, and a group the operator had just named
// "Read-only" carried every write scope.
//
// Holds no DOM references; the wiring in the view is the only part that
// touches the page.
;(function (global) {
  'use strict'

  /**
   * The scopes a preset ticks, given what the platform catalogues.
   *
   * `null` for 'custom' — the operator is hand-picking, so the selection is
   * left alone. For the named presets, the list to tick — which may be EMPTY.
   * That is the point: an adapter with no catalogued read scopes has no
   * read-only set, and the honest result of asking for one is nothing ticked,
   * never whatever happened to be ticked before.
   *
   * @param {string} preset  'read-only' | 'read-write' | 'custom'
   * @param {{ readScopes?: string[], recommendedScopes?: string[] }} catalog
   * @returns {string[] | null}
   */
  function presetScopes(preset, catalog) {
    if (preset === 'read-only') return (catalog && catalog.readScopes) || []
    if (preset === 'read-write') return (catalog && catalog.recommendedScopes) || []
    return null
  }

  /**
   * Apply a preset to the live selection, a Set mutated in place.
   *
   * Returns what happened, for the form's hint and name field:
   *   applied    — the selection was replaced (false for 'custom')
   *   catalogued — the preset had at least one scope to tick; false means the
   *                selection is now deliberately empty
   *
   * @param {Set<string>} selected
   * @param {string} preset
   * @param {{ readScopes?: string[], recommendedScopes?: string[] }} catalog
   * @returns {{ applied: boolean, catalogued: boolean }}
   */
  function applyPresetTo(selected, preset, catalog) {
    var scopes = presetScopes(preset, catalog)
    if (scopes === null) return { applied: false, catalogued: false }
    selected.clear()
    for (var i = 0; i < scopes.length; i++) selected.add(scopes[i])
    return { applied: true, catalogued: scopes.length > 0 }
  }

  global.__scopeGroupPresets = { presetScopes: presetScopes, applyPresetTo: applyPresetTo }
})(typeof window !== 'undefined' ? window : globalThis)
