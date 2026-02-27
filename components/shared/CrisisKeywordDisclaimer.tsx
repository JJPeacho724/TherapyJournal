interface CrisisKeywordDisclaimerProps {
  className?: string
}

export function CrisisKeywordDisclaimer({ className = '' }: CrisisKeywordDisclaimerProps) {
  return (
    <p className={`text-[11px] text-therapy-muted/60 leading-relaxed ${className}`}>
      This is a keyword flag, not a clinical assessment. Clinician review required.
    </p>
  )
}
