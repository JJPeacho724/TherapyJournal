import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { Navbar } from '@/components/shared'

export default async function TherapistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()
  
  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'therapist') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-therapy-background">
      <Navbar role="therapist" userName={profile.full_name || undefined} />
      <main className="pt-16">
        {children}
      </main>
    </div>
  )
}

