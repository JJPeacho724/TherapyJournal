interface ClinicalDecisionBannerProps {
  className?: string
}

export function ClinicalDecisionBanner({ className = '' }: ClinicalDecisionBannerProps) {
  return (
    <div className={`flex items-start gap-2 bg-amber-50/60 border border-amber-100 rounded-lg px-4 py-2.5 ${className}`}>
      <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <p className="text-xs text-amber-700 leading-relaxed">
        For clinical decision support only. Does not replace clinical judgment.
      </p>
    </div>
  )
}
