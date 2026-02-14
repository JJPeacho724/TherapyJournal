interface DisclaimerBannerProps {
  variant?: 'subtle' | 'prominent'
  className?: string
}

export function DisclaimerBanner({ variant = 'subtle', className = '' }: DisclaimerBannerProps) {
  if (variant === 'subtle') {
    return (
      <p className={`text-xs text-therapy-muted/70 text-center max-w-sm mx-auto ${className}`}>
        This supports your wellness journey but isn&apos;t a replacement for professional care.
        In a crisis, please call 988 or your local emergency services.
      </p>
    )
  }

  return (
    <div className={`bg-sage-50 border border-sage-100 rounded-xl p-4 ${className}`}>
      <p className="text-sm text-therapy-muted text-center">
        This journal is here to support you, but it&apos;s not a substitute for talking to a professional.
        If you&apos;re struggling, please reach out to your healthcare provider.
      </p>
    </div>
  )
}
