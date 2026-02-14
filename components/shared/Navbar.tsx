'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/types'

interface NavbarProps {
  role: UserRole
  userName?: string
}

export function Navbar({ role, userName }: NavbarProps) {
  const pathname = usePathname()

  const patientLinks = [
    { href: '/dashboard', label: 'Home' },
    { href: '/journal', label: 'Journal' },
  ]

  const therapistLinks = [
    { href: '/therapist/dashboard', label: 'Home' },
    { href: '/therapist/patients', label: 'Patients' },
  ]

  const links = role === 'patient' ? patientLinks : therapistLinks
  const homeLink = role === 'patient' ? '/dashboard' : '/therapist/dashboard'

  const firstName = userName?.split(' ')[0]

  return (
    <nav className="fixed top-0 left-0 right-0 h-14 bg-white/90 backdrop-blur-sm border-b border-sage-100 z-40">
      <div className="max-w-2xl mx-auto px-4 h-full flex items-center justify-between">
        {/* Logo */}
        <Link href={homeLink} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center">
            <span className="text-white text-xs font-medium">TJ</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${isActive
                    ? 'bg-sage-100 text-sage-700'
                    : 'text-therapy-muted hover:text-therapy-text'
                  }
                `}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {firstName && (
            <span className="text-sm text-therapy-muted hidden sm:inline">
              {firstName}
            </span>
          )}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="p-1.5 rounded-lg text-therapy-muted hover:text-therapy-text hover:bg-sage-50 transition-colors"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
