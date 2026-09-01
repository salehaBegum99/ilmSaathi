import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Flag, Heart, Languages, MapPin, MessageCircle, ShieldCheck, ShieldOff, Star, Video, X } from 'lucide-react';
import { AppLayout } from '../components/Layout';
import { EmptyState } from '../components/Loading';
import { educators } from '../data/demo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Educator, ReportCategory } from '../types';

const slots = ['10:00 am', '11:30 am', '4:00 pm', '6:30 pm'];
const reportCategories: { value: ReportCategory; label: string }[] = [
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' }
];

function parseSlot(label: string) {
  const match = /^(\d{1,2}):(\d{2})\s?(am|pm)$/i.exec(label.trim());
  if (!match) return { hours: 10, minutes: 0 };
  let hours = Number(match[1]) % 12;
  if (match[3]?.toLowerCase() === 'pm') hours += 12;
  return { hours, minutes: Number(match[2]) };
}

export function EducatorPage() {
  const { slug = '' } = useParams();
  const [educator, setEducator] = useState<Educator | undefined>(() => educators.find(item => item.slug === slug));
  const [dateIndex, setDateIndex] = useState(0);
  const [slot, setSlot] = useState('');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('safety_concern');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  useEffect(() => { api.educator(slug).then(setEducator).catch(() => undefined); }, [slug]);
  const dates = useMemo(() => Array.from({ length: 4 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() + index); return date; }), []);
  if (!educator) return <AppLayout><div className="container narrow-page"><EmptyState title="Educator not found" message="This profile may no longer be published." /></div></AppLayout>;

  const requestLesson = async () => {
    if (!user) { navigate(`/login?next=/educators/${slug}`); return; }
    if (!slot) return;
    setSubmitting(true);
    try {
      const selectedDate = dates[dateIndex] ?? dates[0]!;
      const { hours, minutes } = parseSlot(slot);
      const startAt = new Date(selectedDate);
      startAt.setHours(hours, minutes, 0, 0);
      const subjectId = educator.subjectRefs[0]?.id;
      if (import.meta.env.VITE_DEMO_MODE !== 'true' && subjectId) {
        await api.requestClass({ educatorId: educator.educatorId, subjectId, startAt: startAt.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, message: '' });
      }
      setBookingOpen(false); notify('Your class request is ready. The educator will confirm the time.');
    } catch (error) { notify(error instanceof ApiError ? error.message : 'We could not send that request yet. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const submitReport = async () => {
    if (!user) { navigate(`/login?next=/educators/${slug}`); return; }
    if (reportDescription.trim().length < 10) { notify('Add a few more details (at least 10 characters).'); return; }
    setReportSubmitting(true);
    try {
      await api.fileReport({ reportedUserId: educator.educatorId, category: reportCategory, description: reportDescription.trim() });
      setReportOpen(false); setReportDescription('');
      notify('Thank you. Our safety team will review this.');
    } catch (error) { notify(error instanceof ApiError ? error.message : 'We could not send that report. Please try again.'); }
    finally { setReportSubmitting(false); }
  };

  const toggleBlock = async () => {
    if (!user) { navigate(`/login?next=/educators/${slug}`); return; }
    setBlockPending(true);
    try {
      await api.blockUser(educator.educatorId);
      setBlocked(true);
      notify(`${educator.displayName.split(' ')[0]} can no longer contact you or be booked.`);
    } catch (error) { notify(error instanceof ApiError ? error.message : 'We could not block this educator.'); }
    finally { setBlockPending(false); }
  };

  return <AppLayout>
    <div className="profile-page"><div className="container"><button className="back-link" onClick={() => navigate(-1)}><ChevronLeft />Back to educators</button>
      <div className="profile-grid">
        <div className="profile-main">
          <section className="profile-intro">
            <div className={`avatar avatar--large avatar--${educator.accent}`}><span>{educator.initials}</span><i /></div>
            <div className="profile-intro__copy"><div className="profile-title"><h1>{educator.displayName}</h1><BadgeCheck className="verified-icon" /></div><p className="educator-location"><MapPin />{educator.city} · <Languages />{educator.languages.join(', ')}</p><h2>{educator.headline}</h2><div className="profile-rating"><Star fill="currentColor" /> <strong>{educator.rating}</strong> <a href="#reviews">{educator.reviewCount} learner reviews</a><span>·</span><span>{educator.completedClasses} classes</span></div></div>
            <div className="profile-safety-actions"><button className="save-button save-button--large"><Heart />Save</button><button className="icon-button" onClick={() => setReportOpen(true)} aria-label="Report this educator"><Flag /></button><button className="icon-button" disabled={blocked || blockPending} onClick={() => void toggleBlock()} aria-label={blocked ? 'Blocked' : 'Block this educator'}><ShieldOff /></button></div>
          </section>
          <section className="profile-section"><h2>Why learners choose {educator.displayName.split(' ')[0]}</h2><p className="profile-bio">{educator.biography}</p><div className="profile-highlights"><div><ShieldCheck /><span><strong>Identity verified</strong><small>Government ID reviewed privately</small></span></div><div><BadgeCheck /><span><strong>Approved subjects</strong><small>{educator.subjects.join(' · ')}</small></span></div><div><Clock3 /><span><strong>{educator.yearsExperience} years' experience</strong><small>Experience is educator-declared unless marked verified</small></span></div></div></section>
          <section className="profile-section"><h2>Subjects & teaching approach</h2>{educator.subjects.map(subject => <div className="subject-detail" key={subject}><div><h3>{subject}</h3><span className="status-pill"><Check /> Approved to teach</span></div><p>Practical one-to-one lessons shaped around your current level, questions and pace.</p></div>)}</section>
          <section id="reviews" className="profile-section"><div className="reviews-heading"><h2>Learner stories</h2><strong><Star fill="currentColor" /> {educator.rating}</strong></div><div className="review-card"><div><span>NZ</span><strong>Nazia</strong><small>Learning for 3 months</small></div><p>“I never feel rushed. Every lesson has a clear purpose, and I leave knowing exactly what to practise.”</p></div></section>
        </div>
        <aside className="booking-card"><div className="booking-price"><span>From</span><strong>₹{educator.priceFrom}</strong><span>/ 50 min</span></div><div className="booking-feature"><Video /><span><strong>Private live lesson</strong><small>Protected external meeting link</small></span></div><button className="button button--large button--full" onClick={() => setBookingOpen(true)}>View availability</button><p className="booking-note">No charge until the educator accepts your request.</p><hr /><div className="booking-meta"><span><MessageCircle />{educator.responseTime}</span><span><CalendarDays />Next: {educator.nextAvailable}</span></div></aside>
      </div>
    </div></div>
    {bookingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setBookingOpen(false); }}><section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><button className="modal-close" onClick={() => setBookingOpen(false)} aria-label="Close"><X /></button><span className="kicker">Request a class</span><h2 id="booking-title">Choose a time with {educator.displayName.split(' ')[0]}</h2><div className="date-picker"><button aria-label="Previous dates" disabled><ChevronLeft /></button>{dates.map((date, index) => <button type="button" className={dateIndex === index ? 'is-selected' : ''} onClick={() => setDateIndex(index)} key={date.toISOString()}>{date.toLocaleDateString('en-IN', { weekday: 'short' })}<strong>{date.getDate().toString().padStart(2, '0')}</strong></button>)}<button aria-label="Next dates" disabled><ChevronRight /></button></div><fieldset className="slot-grid"><legend>Available times · IST</legend>{slots.map(value => <label className={slot === value ? 'is-selected' : ''} key={value}><input type="radio" name="slot" value={value} checked={slot === value} onChange={() => setSlot(value)} />{value}</label>)}</fieldset><div className="booking-summary"><span>{educator.subjects[0]} · 50 minutes</span><strong>₹{educator.priceFrom}</strong></div><button className="button button--large button--full" disabled={!slot || submitting} onClick={() => void requestLesson()}>{submitting ? 'Sending request…' : user ? 'Request this class' : 'Log in to request'}</button><p className="booking-note">This is a request, not an instant booking. Your private class link appears here once the educator accepts.</p></section></div>}
    {reportOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setReportOpen(false); }}><section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><button className="modal-close" onClick={() => setReportOpen(false)} aria-label="Close"><X /></button><span className="kicker">Report {educator.displayName.split(' ')[0]}</span><h2 id="report-title">Help us keep this circle safe</h2><label className="action-field">Category<select value={reportCategory} onChange={event => setReportCategory(event.target.value as ReportCategory)}>{reportCategories.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="action-field">What happened?<textarea value={reportDescription} onChange={event => setReportDescription(event.target.value)} rows={4} placeholder="Share as much detail as you can. Only our safety team sees this." /></label><button className="button button--large button--full" disabled={reportSubmitting} onClick={() => void submitReport()}>{reportSubmitting ? 'Sending…' : 'Submit report'}</button></section></div>}
  </AppLayout>;
}
