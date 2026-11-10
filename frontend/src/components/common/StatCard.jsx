const colorClasses = {
  primary: 'bg-primary-50 text-primary-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  yellow: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
};

/** `icon` is a lucide component (e.g. Wallet). */
export default function StatCard({ icon: Icon, label, value, color = 'primary', subtitle }) {
  return (
    <div className="card flex items-center gap-4 !p-4 sm:!p-5">
      <div className={`flex-shrink-0 p-3 rounded-xl ${colorClasses[color] || colorClasses.primary}`}>
        {Icon && <Icon className="h-6 w-6" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 truncate">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
