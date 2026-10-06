import { LogOut } from 'lucide-react';

export default function Header({ schoolName, user, onSignOut, children }) {
  return (
    <header className="bg-white border-b border-stone-200 no-print">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="w-9 h-9 rounded-lg" />
        <div className="leading-tight">
          <div className="font-semibold text-stone-800">Math Check-In</div>
          <div className="text-xs text-stone-500">{schoolName}</div>
        </div>
        <nav className="flex gap-1 ml-2 flex-wrap">{children}</nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-stone-500 hidden sm:inline">{user?.email}</span>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 hover:bg-stone-100">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export function NavButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ' +
        (active ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100')}
    >
      {Icon && <Icon className="w-4 h-4" />} {children}
    </button>
  );
}
