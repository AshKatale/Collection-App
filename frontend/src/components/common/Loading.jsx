export default function Loading({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className={`flex items-center justify-center py-6 ${className}`} role="status" aria-label="Loading">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-gray-200 border-t-primary-500`} />
    </div>
  );
}

/** Placeholder rows shown while a table / list loads (keeps the page from jumping). */
export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-9 w-full" />
      ))}
    </div>
  );
}
