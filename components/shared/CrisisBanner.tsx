'use client'

import { useState } from 'react'

interface CrisisBannerProps {
  onDismiss?: () => void
  severity?: 'low' | 'medium' | 'high'
}

export function CrisisBanner({ onDismiss, severity = 'medium' }: CrisisBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const severityStyles = {
    low: 'bg-warm-50 border-warm-300',
    medium: 'bg-amber-50 border-amber-300',
    high: 'bg-red-50 border-red-300',
  }

  const severityTextStyles = {
    low: 'text-warm-800',
    medium: 'text-amber-800',
    high: 'text-red-800',
  }

  return (
    <div className={`border rounded-xl p-4 ${severityStyles[severity]} mb-6`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className={`w-6 h-6 ${severityTextStyles[severity]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className={`font-medium ${severityTextStyles[severity]}`}>
            We care about your wellbeing
          </p>
          <p className={`text-sm mt-1 ${severityTextStyles[severity]} opacity-90`}>
            It sounds like you might be going through a difficult time. You don&apos;t have to face this alone.
          </p>

          {/* Resources */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`text-sm font-medium mt-2 ${severityTextStyles[severity]} underline`}
          >
            {isExpanded ? 'Hide resources' : 'View helpful resources'}
          </button>

          {isExpanded && (
            <div className={`mt-3 pt-3 border-t ${severity === 'high' ? 'border-red-200' : severity === 'medium' ? 'border-amber-200' : 'border-warm-200'}`}>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="font-semibold">National Suicide Prevention Lifeline:</span>
                  <a href="tel:988" className="font-bold hover:underline">988</a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-semibold">Crisis Text Line:</span>
                  <span>Text HOME to <strong>741741</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-semibold">International Association for Suicide Prevention:</span>
                  <a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                    Find local resources
                  </a>
                </li>
              </ul>
              <p className={`text-xs mt-3 ${severityTextStyles[severity]} opacity-75`}>
                If you&apos;re in immediate danger, please call your local emergency services.
              </p>
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className={`flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors ${severityTextStyles[severity]}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

