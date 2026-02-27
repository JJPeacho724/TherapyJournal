export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`animate-pulse bg-sage-50 rounded-2xl ${height}`}>
      <div className="p-6 h-full flex flex-col">
        <div className="h-4 bg-sage-100 rounded w-1/4 mb-4" />
        <div className="flex-1 bg-sage-100/50 rounded-lg flex items-end gap-1 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-sage-100 rounded-t transition-all"
              style={{ height: `${25 + Math.sin(i * 0.8) * 30 + 20}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
