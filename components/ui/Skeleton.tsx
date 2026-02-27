interface SkeletonProps {
  className?: string
  variant?: 'line' | 'circle' | 'card' | 'chart'
}

export function Skeleton({ className = '', variant = 'line' }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-sage-100 rounded'

  switch (variant) {
    case 'circle':
      return <div className={`${baseClasses} rounded-full w-10 h-10 ${className}`} />
    case 'card':
      return (
        <div className={`${baseClasses} rounded-2xl p-6 space-y-3 ${className}`}>
          <div className="h-4 bg-sage-200 rounded w-1/3" />
          <div className="h-3 bg-sage-200 rounded w-full" />
          <div className="h-3 bg-sage-200 rounded w-2/3" />
        </div>
      )
    case 'chart':
      return (
        <div className={`${baseClasses} rounded-2xl ${className}`}>
          <div className="p-6 space-y-3">
            <div className="h-4 bg-sage-200 rounded w-1/4" />
            <div className="h-48 bg-sage-200/50 rounded-lg flex items-end gap-1 p-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 bg-sage-200 rounded-t"
                  style={{ height: `${20 + Math.random() * 60}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      )
    default:
      return <div className={`${baseClasses} h-4 ${className}`} />
  }
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-24" />
        ))}
      </div>
      <Skeleton variant="chart" className="h-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton variant="chart" className="h-64" />
        <Skeleton variant="chart" className="h-64" />
      </div>
    </div>
  )
}
