import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo Mode — Synthetic Data',
  description: 'Synthetic-only demo environment. No real patient data.',
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo mode banner */}
      <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-800 font-medium">
        SYNTHETIC DEMO MODE — All data on these pages is generated. No real patient information is displayed.
      </div>
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-6">
          <a href="/demo/admin/synthetic" className="text-sm font-medium text-gray-700 hover:text-indigo-600 transition">
            Cohort Admin
          </a>
          <a href="/demo/admin/feedback" className="text-sm font-medium text-gray-700 hover:text-indigo-600 transition">
            Feedback Dashboard
          </a>
          <span className="ml-auto text-xs text-gray-400">Synthetic Demo</span>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}
