'use client'

import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-therapy-text mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full px-4 py-3 rounded-lg border bg-white text-therapy-text 
            placeholder:text-therapy-muted transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-therapy-accent focus:border-transparent
            ${error ? 'border-therapy-danger focus:ring-therapy-danger' : 'border-therapy-border'}
            ${className}
          `}
          {...props}
        />
        {hint && !error && (
          <p className="mt-1.5 text-sm text-therapy-muted">{hint}</p>
        )}
        {error && (
          <p className="mt-1.5 text-sm text-therapy-danger">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

