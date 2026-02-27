/**
 * Input sanitization for user-facing text.
 *
 * Strips HTML tags and dangerous patterns from user input before DB storage.
 * Lightweight approach — no external dependency needed since we only store
 * plain text (never render raw HTML from user input).
 */

const HTML_TAG_RE = /<\/?[^>]+(>|$)/g
const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
const EVENT_HANDLER_RE = /\bon\w+\s*=\s*["'][^"']*["']/gi
const NULL_BYTE_RE = /\0/g

export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return ''

  return input
    .replace(NULL_BYTE_RE, '')
    .replace(SCRIPT_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(HTML_TAG_RE, '')
    .trim()
}

export const MAX_JOURNAL_CONTENT_LENGTH = 5000

export function validateJournalContent(content: unknown): {
  valid: boolean
  sanitized: string
  error?: string
} {
  if (!content || typeof content !== 'string') {
    return { valid: false, sanitized: '', error: 'Content is required' }
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Content cannot be empty' }
  }

  if (trimmed.length > MAX_JOURNAL_CONTENT_LENGTH) {
    return {
      valid: false,
      sanitized: '',
      error: `Content exceeds maximum length of ${MAX_JOURNAL_CONTENT_LENGTH} characters`,
    }
  }

  const sanitized = sanitizeText(trimmed)
  return { valid: true, sanitized }
}
