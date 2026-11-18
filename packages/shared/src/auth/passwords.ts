/**
 * Shared password validation — enforces minimum security requirements.
 */

const MIN_LENGTH = 12
const MAX_LENGTH = 128

/**
 * Validate a password meets security requirements.
 *
 * Rules:
 *   - 12-128 characters
 *   - Must contain uppercase + lowercase + digit (or be 16+ chars for passphrase-style)
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password is required' }
  }
  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters` }
  }
  if (password.length > MAX_LENGTH) {
    return { valid: false, error: `Password must be at most ${MAX_LENGTH} characters` }
  }

  // Passphrase exemption: 16+ chars skips complexity rules
  if (password.length >= 16) {
    return { valid: true }
  }

  // Complexity requirements for shorter passwords
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /[0-9]/.test(password)

  if (!hasUpper || !hasLower || !hasDigit) {
    return {
      valid: false,
      error: 'Password must contain uppercase, lowercase, and a digit (or be 16+ characters)',
    }
  }

  return { valid: true }
}
