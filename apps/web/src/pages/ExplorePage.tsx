import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { AppLayout, MobileBottomNav } from '../components/Layout';
import { EducatorCard } from '../components/EducatorCard';
import { educators as demoEducators, subjects } from '../data/demo';
import { api } from '../lib/api';
import type { Educator } from '../types';

export function ExplorePage() {
  const params = new URLSearchParams(window.location.search);
  const initialSubject = params.get('subject') || 'all';
  const [items, setItems] = useState<Educator[]>(import.meta.env.VITE_DEMO_MODE === 'true' ? demoEducators : []);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState(initialSubject);
  const [language, setLanguage] = useState('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.educators().then(setItems).catch(() => {
      if (import.meta.env.VITE_DEMO_MODE !== 'true') setError('We could not load educators right now. Please try again shortly.');
    });
  }, []);

  const filtered = useMemo(() => items.filter(item => {
    const matchesQuery = !query || `${item.displayName} ${item.headline} ${item.subjects.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesSubject = subject === 'all' || item.subjects.some(name => subjects.find(s => s.slug === subject)?.name === name);
    const matchesLanguage = language === 'all' || item.languages.includes(language);
    const matchesVerified = !verifiedOnly || item.verified.identity;
    return matchesQuery && matchesSubject && matchesLanguage && matchesVerified;
  }), [items, query, subject, language, verifiedOnly]);

  const clear = () => { setSubject('all'); setLanguage('all'); setVerifiedOnly(false); setQuery(''); };
  return <AppLayout>
    <section className="explore-hero"><div className="container"><span className="kicker">Find the right fit</span><h1>Learn from someone who gets <em>how you learn.</em></h1><p>Every educator shown here is approved for the subjects on her profile.</p>
      <label className="search-box"><Search /><span className="sr-only">Search educators or subjects</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try “spoken English” or an educator’s name" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X /></button>}<button className="button">Search</button></label>
    </div></section>
    <section className="explore-body"><div className="container explore-layout">
      <aside className={`filter-panel ${filterOpen ? 'is-open' : ''}`}><div className="filter-title"><h2>Filters</h2><button className="text-button" onClick={clear}>Clear all</button></div>
        <label>Subject<select value={subject} onChange={event => setSubject(event.target.value)}><option value="all">All subjects</option>{subjects.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select><ChevronDown /></label>
        <label>Lesson language<select value={language} onChange={event => setLanguage(event.target.value)}><option value="all">Any language</option><option>English</option><option>Hindi</option><option>Urdu</option><option>Marathi</option></select><ChevronDown /></label>
        <fieldset><legend>Price per lesson</legend><div className="price-range"><span>₹300</span><span>₹1,500+</span></div><input type="range" min="300" max="1500" defaultValue="1000" aria-label="Maximum price" /></fieldset>
        <label className="check-row"><input type="checkbox" checked={verifiedOnly} onChange={event => setVerifiedOnly(event.target.checked)} /><span>Identity verified</span></label>
        <label className="check-row"><input type="checkbox" /><span>Available this week</span></label>
      </aside>
      <div className="results-panel"><div className="results-toolbar"><div><strong>{filtered.length} educators</strong><span> ready to help you begin</span></div><div><button className="filter-mobile button button--outline" onClick={() => setFilterOpen(!filterOpen)}><Filter /> Filters</button><button className="sort-button"><SlidersHorizontal /> Recommended <ChevronDown /></button></div></div>
        {import.meta.env.VITE_DEMO_MODE === 'true' && <div className="preview-banner">Preview catalogue · connect the API to show live approved educators</div>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="results-list">{filtered.map(item => <EducatorCard educator={item} key={item.id} />)}</div>
        {!filtered.length && !error && <div className="empty-results"><span>✦</span><h2>No exact match yet</h2><p>Try removing a filter—we are thoughtfully growing this circle.</p><button className="button button--outline" onClick={clear}>Reset filters</button></div>}
      </div>
    </div></section>
    <MobileBottomNav />
  </AppLayout>;
}
