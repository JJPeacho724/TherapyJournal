import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-therapy-background">
      {/* Navigation */}
      <nav className="w-full px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center">
            <span className="text-white text-sm font-medium">TJ</span>
          </div>
          <span className="font-medium text-therapy-text">Therapy Journal</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-therapy-muted hover:text-therapy-text transition-colors text-sm">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="bg-sage-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-sage-600 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-normal text-therapy-text mb-6 leading-relaxed">
            A quiet space for your thoughts
          </h1>
          <p className="text-lg text-therapy-muted mb-10 max-w-lg mx-auto leading-relaxed">
            Reflect on your days, notice patterns, and share what feels right with your therapist.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-sage-500 text-white px-8 py-3 rounded-xl font-medium hover:bg-sage-600 transition-colors"
            >
              Start journaling
            </Link>
            <Link
              href="/login"
              className="bg-white text-therapy-text px-8 py-3 rounded-xl font-medium border border-sage-200 hover:border-sage-300 transition-colors"
            >
              I have an account
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto mt-20">
          <div className="bg-white rounded-2xl p-6 border border-sage-100">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-sage-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="font-medium text-therapy-text mb-2">Write freely</h3>
            <p className="text-therapy-muted text-sm leading-relaxed">
              Express yourself however feels natural, with gentle prompts when you need them.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-sage-100">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-sage-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="font-medium text-therapy-text mb-2">Notice patterns</h3>
            <p className="text-therapy-muted text-sm leading-relaxed">
              See how your days have felt over time, without getting lost in numbers.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-sage-100">
            <div className="w-10 h-10 rounded-xl bg-sage-50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-sage-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-therapy-text mb-2">Share when ready</h3>
            <p className="text-therapy-muted text-sm leading-relaxed">
              You decide what your therapist sees. Your thoughts, your choice.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center">
        <p className="text-therapy-muted text-sm max-w-md mx-auto">
          This app supports your wellness journey but isn't a replacement for professional care.
          If you're in crisis, please reach out to emergency services.
        </p>
      </footer>
    </main>
  )
}
