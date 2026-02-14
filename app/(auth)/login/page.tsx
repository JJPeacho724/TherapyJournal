'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Button, Input, Card } from '@/components/ui'
import { DisclaimerBanner } from '@/components/shared'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        return
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (profile?.role === 'therapist') {
          router.push('/therapist/dashboard')
        } else {
          router.push('/dashboard')
        }
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
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
            Welcome back
          </h1>
          <p className="text-therapy-muted text-sm">
            Good to see you again
          </p>
        </div>

        <Card className="animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl p-3 text-center">
                {error}
              </div>
            )}

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
              placeholder="Your password"
              required
              autoComplete="current-password"
            />

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign in
            </Button>
          </form>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-therapy-muted text-sm">
            New here?{' '}
            <Link href="/signup" className="text-sage-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        <DisclaimerBanner className="mt-8" />
      </div>
    </div>
  )
}
