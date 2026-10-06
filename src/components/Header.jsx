import { LogOut } from 'lucide-react';

export default function Header({ schoolName, user, onSignOut, children }) {
  return (
    <header className="iron-bar text-stone-100 no-print">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="w-10 h-10" />
        <div className="leading-tight">
          <div className="font-display font-bold text-lg tracking-wider text-gold-300">The Forge</div>
          <div className="text-xs text-stone-300">Math Check-In · {schoolName}</div>
        </div>
        <nav className="flex gap-1 ml-2 flex-wrap">{children}</nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-stone-400 hidden sm:inline">{user?.email}</span>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-200 hover:bg-white/10">
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
        (active ? 'bg-white/10 text-gold-300 ring-1 ring-gold-500/40' : 'text-stone-300 hover:bg-white/10 hover:text-white')}
    >
      {Icon && <Icon className="w-4 h-4" />} {children}
    </button>
  );
}
