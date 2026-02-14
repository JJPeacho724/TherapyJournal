'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button, Input, Card } from '@/components/ui'
import { DisclaimerBanner } from '@/components/shared'
import type { UserRole } from '@/types'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('patient')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 8) {
      setError('Password should be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (data.user) {
        if (data.user.identities?.length === 0) {
          setError('An account with this email already exists.')
          return
        }

        setSuccess(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-therapy-background">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-sage-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-normal text-therapy-text mb-2">Check your email</h1>
          <p className="text-therapy-muted mb-8">
            We sent a confirmation link to <strong className="text-therapy-text">{email}</strong>
          </p>
          <Link href="/login">
            <Button variant="secondary">Back to sign in</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-therapy-background">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center mb-3">
              <span className="text-white font-medium text-lg">TJ</span>
            </div>
            <span className="text-therapy-text font-medium">Therapy Journal</span>
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-normal text-therapy-text mb-2">
            Create your space
          </h1>
          <p className="text-therapy-muted text-sm">
            A calm place for your thoughts
          </p>
        </div>

        <Card className="animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl p-3 text-center">
                {error}
              </div>
            )}

            {/* Role Selection */}
            <div>
              <label className="block text-sm text-therapy-muted mb-2">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('patient')}
                  className={`
                    p-3 rounded-xl border-2 text-left transition-all duration-200
                    ${role === 'patient'
                      ? 'border-sage-400 bg-sage-50'
                      : 'border-sage-200 hover:border-sage-300'
                    }
                  `}
                >
                  <div className="text-sm font-medium text-therapy-text">Patient</div>
                  <div className="text-xs text-therapy-muted mt-0.5">Track my wellness</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('therapist')}
                  className={`
                    p-3 rounded-xl border-2 text-left transition-all duration-200
                    ${role === 'therapist'
                      ? 'border-sage-400 bg-sage-50'
                      : 'border-sage-200 hover:border-sage-300'
                    }
                  `}
                >
                  <div className="text-sm font-medium text-therapy-text">Therapist</div>
                  <div className="text-xs text-therapy-muted mt-0.5">Support patients</div>
                </button>
              </div>
            </div>

            <Input
              label="Your name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="What should we call you?"
              required
              autoComplete="name"
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              hint="At least 8 characters"
              required
              autoComplete="new-password"
            />

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create account
            </Button>
          </form>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-therapy-muted text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-sage-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <DisclaimerBanner className="mt-8" />
      </div>
    </div>
  )
}
