import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, Heart, Menu, Search, UserRound, X } from 'lucide-react';
import { Brand } from './Brand';
import { useAuth } from '../contexts/AuthContext';
import { useLocale, type Locale } from '../contexts/LocaleContext';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const navigate = useNavigate();
  const localeNames: Record<Locale, string> = { en: 'EN', hi: 'हिं', ur: 'اردو' };

  const close = () => setMenuOpen(false);
  return <header className="site-header">
    <div className="container header-inner">
      <Brand />
      <nav id="main-navigation" className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <NavLink to="/explore" onClick={close}><Search size={17} />{t.explore}</NavLink>
        <NavLink to="/how-it-works" onClick={close}>How it works</NavLink>
        <NavLink to="/teach" onClick={close}>{t.teach}</NavLink>
        <NavLink to="/safety" onClick={close}>Trust & safety</NavLink>
        <div className="mobile-nav-account">
          {user ? <><NavLink to={user.roles.includes('admin') ? '/admin' : '/dashboard'} onClick={close}>My space</NavLink><button type="button" className="text-button" onClick={() => { close(); void logout().catch(() => undefined); }}>Log out</button></> : <><NavLink to="/login" onClick={close}>{t.login}</NavLink><NavLink className="button" to="/register" onClick={close}>Join free</NavLink></>}
        </div>
      </nav>
      <div className="header-actions">
        <div className="locale-switcher">
          <button type="button" className="text-button" onClick={() => setLocaleOpen(!localeOpen)} aria-expanded={localeOpen} aria-haspopup="menu" aria-controls="locale-menu" aria-label="Choose language">
            {localeNames[locale]} <ChevronDown size={14} />
          </button>
          {localeOpen && <div className="locale-menu" id="locale-menu" role="menu">
            {(['en', 'hi', 'ur'] as Locale[]).map(item => <button type="button" key={item} role="menuitemradio" aria-checked={locale === item} onClick={() => { setLocale(item); setLocaleOpen(false); }}>{localeNames[item]}</button>)}
          </div>}
        </div>
        {user ? <>
          <Link className="icon-button desktop-only" to="/saved" aria-label="Saved educators"><Heart size={19} /></Link>
          <button type="button" className="user-chip" aria-label="Open my space" onClick={() => navigate(user.roles.includes('admin') ? '/admin' : '/dashboard')}><span>{user.displayName.slice(0, 1).toUpperCase()}</span>{user.displayName.split(' ')[0]}</button>
          <button type="button" className="text-button desktop-only" onClick={() => void logout().catch(() => undefined)}>Log out</button>
        </> : <>
          <Link className="text-button desktop-only" to="/login">{t.login}</Link>
          <Link className="button button--small desktop-only" to="/register">Join free</Link>
        </>}
        <button type="button" className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-controls="main-navigation" aria-expanded={menuOpen} aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
      </div>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div className="footer-brand"><Brand /><p>A trusted learning circle built for women—one meaningful lesson at a time.</p><div className="made-in">Built with care in India <span>●</span></div></div>
      <div><h3>Learn</h3><Link to="/explore">Find an educator</Link><Link to="/how-it-works">How it works</Link><Link to="/subjects">All subjects</Link><Link to="/gift">Gift learning</Link></div>
      <div><h3>Teach</h3><Link to="/teach">Become an educator</Link><Link to="/teach#standards">Teaching standards</Link><Link to="/teach#earnings">Earnings guide</Link></div>
      <div><h3>Company</h3><Link to="/safety">Trust & safety</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="mailto:support@ilmsaathi.example">Help centre</a></div>
    </div>
    <div className="container footer-bottom"><span>© 2026 IlmSaathi Learning. Working brand—verify trademark before launch.</span><span>Age-inclusive learning · Educators 18+ · No class recording by default</span></div>
  </footer>;
}

export function AppLayout({ children, hideFooter = false }: { children: ReactNode; hideFooter?: boolean }) {
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a><Header /><main id="main">{children}</main>{!hideFooter && <Footer />}</div>;
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const educatorOnly = Boolean(user?.roles.includes('educator')) && !user?.roles.includes('learner');
  return <nav className="mobile-bottom-nav" aria-label="Quick navigation">
    {educatorOnly ? <>
      <NavLink to="/teach"><BookOpen /><span>Teaching</span></NavLink>
      <NavLink to="/dashboard"><UserRound /><span>Requests</span></NavLink>
    </> : <>
      <NavLink to="/explore"><Search /><span>Explore</span></NavLink>
      <NavLink to="/saved"><Heart /><span>Saved</span></NavLink>
      <NavLink to="/dashboard"><UserRound /><span>My space</span></NavLink>
    </>}
  </nav>;
}
