/**
 * Shared utilities for API calls: timeout wrappers and retry logic.
 */

export class ApiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = 'ApiTimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiTimeoutError(timeoutMs)), timeoutMs)
    promise
      .then(value => { clearTimeout(timer); resolve(value) })
      .catch(err => { clearTimeout(timer); reject(err) })
  })
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const { maxRetries = 1, baseDelayMs = 2000, timeoutMs = 30000 } = options

  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}
