/**
 * In-memory sliding-window rate limiter for API routes.
 *
 * Each limiter tracks requests per IP within a configurable window.
 * Designed for single-process deployments (Vercel serverless, etc.).
 * For multi-instance production use, swap to Redis-backed limiter.
 */

interface RateLimitEntry {
  timestamps: number[]
}

interface RateLimiterOptions {
  windowMs: number
  maxRequests: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores.has(name)) {
    stores.set(name, new Map())
  }
  return stores.get(name)!
}

export function createRateLimiter(name: string, options: RateLimiterOptions) {
  const { windowMs, maxRequests } = options

  return {
    check(identifier: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
      const store = getStore(name)
      const now = Date.now()
      const cutoff = now - windowMs

      let entry = store.get(identifier)
      if (!entry) {
        entry = { timestamps: [] }
        store.set(identifier, entry)
      }

      entry.timestamps = entry.timestamps.filter(t => t > cutoff)

      if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0]
        const retryAfterMs = oldestInWindow + windowMs - now
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, retryAfterMs),
        }
      }

      entry.timestamps.push(now)
      return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
        retryAfterMs: 0,
      }
    },

    reset(identifier: string) {
      getStore(name).delete(identifier)
    },
  }
}

export const aiExtractionLimiter = createRateLimiter('ai-extraction', {
  windowMs: 60_000,
  maxRequests: 10,
})

export const aiGuidedPromptLimiter = createRateLimiter('ai-guided-prompt', {
  windowMs: 60_000,
  maxRequests: 15,
})

export const generalApiLimiter = createRateLimiter('general-api', {
  windowMs: 60_000,
  maxRequests: 60,
})

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}
