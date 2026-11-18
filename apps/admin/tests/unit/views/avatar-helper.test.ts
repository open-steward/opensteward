/**
 * `avatar()` returns raw HTML (`<%- %>`), so everything it interpolates must
 * be escaped or encoded here — the template cannot help.
 */
import { describe, expect, it } from 'vitest'
import { avatar, avatarInitials } from '../../../src/core/views/helpers'

describe('avatar()', () => {
  it('renders a versioned same-origin picture, decorative by default', () => {
    const html = avatar({ id: 'u1', username: 'olivia', avatarVersion: 'abc123' })
    expect(html).toBe(
      '<img class="avatar avatar--sm" src="/users/u1/avatar?v=abc123" alt="" width="24" height="24" loading="lazy" decoding="async">',
    )
  })

  it('renders initials from an attribute, so the text of a table cell stays the name', () => {
    const html = avatar({ id: 'u1', username: 'olivia.admin', avatarVersion: null }, 'lg')
    expect(html).toBe('<span class="avatar avatar--lg avatar--initials" data-initials="OA" aria-hidden="true"></span>')
  })

  it('labels a standalone avatar for assistive tech', () => {
    expect(avatar({ id: 'u1', username: 'o' }, 'lg', 'No picture')).toContain('role="img" aria-label="No picture"')
    expect(avatar({ id: 'u1', username: 'o', avatarVersion: 'v' }, 'lg', 'Picture of o')).toContain('alt="Picture of o"')
  })

  it('cannot be broken out of by a hostile id, version, name or label', () => {
    const html = avatar(
      { id: '"><script>alert(1)</script>', username: '"><img src=x onerror=alert(1)>', avatarVersion: '"x' },
      'sm',
      '"><b>',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('"><')
    expect(html).toContain('/users/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E/avatar?v=%22x')
    const initials = avatar({ id: 'u', username: '"<>&\'' })
    expect(initials).toContain('data-initials="?"')
  })

  it('renders nothing for no person', () => {
    expect(avatar(null)).toBe('')
  })

  it('initials: two words at most, an email’s local part only', () => {
    expect(avatarInitials('ada lovelace byron')).toBe('AL')
    expect(avatarInitials('bob@example.test')).toBe('B')
    expect(avatarInitials(undefined)).toBe('?')
  })
})
