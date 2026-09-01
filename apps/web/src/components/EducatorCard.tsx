import { BadgeCheck, Clock3, Heart, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Educator } from '../types';

export function EducatorCard({ educator }: { educator: Educator }) {
  return <article className="educator-card">
    <div className={`avatar avatar--${educator.accent}`} aria-hidden="true"><span>{educator.initials}</span><i /></div>
    <div className="educator-card__body">
      <div className="educator-card__top">
        <div><h3><Link to={`/educators/${educator.slug}`}>{educator.displayName}</Link>{educator.verified.identity && <BadgeCheck className="verified-icon" aria-label="Identity verified" />}</h3><p className="educator-location"><MapPin size={14} />{educator.city} · {educator.languages.slice(0, 2).join(', ')}</p></div>
        <button className="save-button" aria-label={`Save ${educator.displayName}`}><Heart size={19} /></button>
      </div>
      <p className="educator-headline">{educator.headline}</p>
      <div className="subject-tags">{educator.subjects.map(subject => <span key={subject}>{subject}</span>)}</div>
      <div className="educator-stats">
        <span className="rating"><Star size={15} fill="currentColor" />{educator.rating} <small>({educator.reviewCount})</small></span>
        <span>{educator.completedClasses} classes</span>
        <span><Clock3 size={14} /> {educator.nextAvailable}</span>
      </div>
      <div className="educator-card__footer"><span>From <strong>₹{educator.priceFrom}</strong> / 50 min</span><Link className="button button--outline button--small" to={`/educators/${educator.slug}`}>View profile</Link></div>
    </div>
  </article>;
}
