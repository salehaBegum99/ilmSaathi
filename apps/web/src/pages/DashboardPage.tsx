import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Calendar, Check, Flag, Heart, MessageCircle, Plus, ShieldOff, Sparkles, Video, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { AppLayout, MobileBottomNav } from '../components/Layout';
import { EmptyState } from '../components/Loading';
import { educators } from '../data/demo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Block, BookingRequest, BookingStatus, ReportCategory } from '../types';

const statusMeta: Record<BookingStatus, { label: string; className: string }> = {
  requested: { label: 'Awaiting response', className: 'status-pill status-pill--pending' },
  accepted: { label: 'Confirmed', className: 'status-pill' },
  declined: { label: 'Declined', className: 'status-pill status-pill--muted' },
  cancelled: { label: 'Cancelled', className: 'status-pill status-pill--muted' },
  completed: { label: 'Completed', className: 'status-pill' }
};
const reportCategories: { value: ReportCategory; label: string }[] = [
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' }
];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

type ActionMode = 'accept' | 'decline' | 'cancel' | 'report';
interface PendingAction { booking: BookingRequest; mode: ActionMode; targetUserId?: string }

export function DashboardPage() {
  const { user, loading } = useAuth();
  const { notify } = useToast();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [received, setReceived] = useState<BookingRequest[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [actionValue, setActionValue] = useState('');
  const [reportCategory, setReportCategory] = useState<ReportCategory>('safety_concern');
  const [actionPending, setActionPending] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const isEducator = Boolean(user?.roles.includes('educator'));
  const isLearner = Boolean(user?.roles.includes('learner'));
  const educatorOnly = isEducator && !isLearner;

  const canFetch = import.meta.env.VITE_DEMO_MODE !== 'true' && Boolean(user);
  const refresh = useCallback(async () => {
    if (!canFetch) return;
    const [mine, incoming] = await Promise.all([
      api.myBookings().catch(() => []),
      isEducator ? api.receivedBookings().catch(() => []) : Promise.resolve([])
    ]);
    setBookings(mine);
    setReceived(incoming);
  }, [canFetch, isEducator]);

  useEffect(() => {
    let active = true;
    const bookingsPromise = canFetch ? api.myBookings().catch(() => [] as BookingRequest[]) : Promise.resolve([] as BookingRequest[]);
    const receivedPromise = canFetch && isEducator ? api.receivedBookings().catch(() => [] as BookingRequest[]) : Promise.resolve([] as BookingRequest[]);
    const blocksPromise = canFetch ? api.myBlocks().catch(() => [] as Block[]) : Promise.resolve([] as Block[]);
    void Promise.all([bookingsPromise, receivedPromise, blocksPromise]).then(([mine, incoming, myBlocks]) => {
      if (!active) return;
      setBookings(mine);
      setReceived(incoming);
      setBlocks(myBlocks);
      setBookingsLoading(false);
    });
    return () => { active = false; };
  }, [canFetch, isEducator]);

  if (loading) return <AppLayout><div className="page-loading"><span /></div></AppLayout>;
  if (!user && import.meta.env.VITE_DEMO_MODE !== 'true') return <Navigate to="/login" />;
  const displayName = user?.displayName || 'Amina';

  const openAction = (booking: BookingRequest, mode: ActionMode, targetUserId?: string) => { setAction({ booking, mode, ...(targetUserId ? { targetUserId } : {}) }); setActionValue(''); setReportCategory('safety_concern'); };
  const closeAction = () => { if (!actionPending) setAction(null); };

  const submitAction = async () => {
    if (!action) return;
    if (action.mode !== 'accept' && actionValue.trim().length < 10) { notify('Add a short reason (at least 10 characters).'); return; }
    if (action.mode === 'accept' && !/^https?:\/\//.test(actionValue.trim())) { notify('Add a valid meeting link starting with https://'); return; }
    setActionPending(true);
    try {
      if (action.mode === 'accept') await api.acceptBooking(action.booking.id, actionValue.trim());
      else if (action.mode === 'decline') await api.declineBooking(action.booking.id, actionValue.trim());
      else if (action.mode === 'report') await api.fileReport({ reportedUserId: action.targetUserId!, category: reportCategory, description: actionValue.trim(), relatedBookingId: action.booking.id });
      else await api.cancelBooking(action.booking.id, actionValue.trim());
      if (action.mode !== 'report') await refresh();
      notify(action.mode === 'accept' ? 'Class confirmed. Your learner can now see the class link.' : action.mode === 'decline' ? 'Request declined.' : action.mode === 'report' ? 'Thank you. Our safety team will review this.' : 'Booking cancelled.');
      setAction(null);
    } catch (error) { notify(error instanceof ApiError ? error.message : 'That action could not be completed.'); }
    finally { setActionPending(false); }
  };

  const markComplete = async (booking: BookingRequest) => {
    try { await api.completeBooking(booking.id); await refresh(); notify('Marked as complete.'); }
    catch (error) { notify(error instanceof ApiError ? error.message : 'This class cannot be marked complete yet.'); }
  };

  const unblock = async (id: string) => {
    try { await api.unblockUser(id); setBlocks(current => current.filter(item => item.id !== id)); notify('Unblocked.'); }
    catch (error) { notify(error instanceof ApiError ? error.message : 'Could not unblock right now.'); }
  };

  const activeLearnerBookings = bookings
    .filter(item => item.status === 'requested' || item.status === 'accepted')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const pendingRequests = received.filter(item => item.status === 'requested').sort((a, b) => a.startAt.localeCompare(b.startAt));
  const acceptedForEducator = received.filter(item => item.status === 'accepted').sort((a, b) => a.startAt.localeCompare(b.startAt));

  return <AppLayout>
    <section className="dashboard-hero"><div className="container"><div><span className="kicker">{educatorOnly ? 'My teaching space' : 'My learning space'}</span><h1>Assalamu alaikum, {displayName.split(' ')[0]}.</h1><p>{educatorOnly ? 'Here’s what needs your attention today.' : 'Small, steady steps count. Here’s what’s waiting for you.'}</p></div>{educatorOnly ? <Link className="button" to="/teach"><Plus />Manage teaching profile</Link> : <Link className="button" to="/explore"><Plus />Find a new educator</Link>}</div></section>
    <div className="container dashboard-grid"><main>
      {isLearner && <section className="dashboard-section">
        <div className="dashboard-section__heading"><h2>Your class requests</h2></div>
        {bookingsLoading ? <div className="booking-queue-loading">Loading your classes…</div> : activeLearnerBookings.length === 0
          ? <EmptyState title="No class requests yet" message="When you request a class, it will appear here with its status." />
          : <div className="booking-queue">{activeLearnerBookings.map(item => <article className="booking-row" key={item.id}>
              <div className="booking-row__meta">
                <span className={statusMeta[item.status].className}>{statusMeta[item.status].label}</span>
                <h3>{item.subjectName} with {item.educatorName}</h3>
                <p><Calendar size={14} />{formatWhen(item.startAt)} · {item.durationMinutes} min</p>
                {item.status === 'accepted' && item.meetingLink && <a className="booking-row__link" href={item.meetingLink} target="_blank" rel="noreferrer"><Video size={14} />Join class link</a>}
              </div>
              <div className="booking-row__actions"><button type="button" className="icon-button" onClick={() => openAction(item, 'report', item.educatorId)} aria-label="Report"><Flag size={15} /></button><button type="button" className="button button--outline button--small" onClick={() => openAction(item, 'cancel')}>Cancel</button></div>
            </article>)}</div>}
      </section>}

      {isEducator && <section className="dashboard-section">
        <div className="dashboard-section__heading"><h2>Class requests to review</h2></div>
        {bookingsLoading ? null : pendingRequests.length === 0 && acceptedForEducator.length === 0
          ? <EmptyState title="No incoming requests" message="Learner requests for your approved subjects will show up here." />
          : <div className="booking-queue">
              {pendingRequests.map(item => <article className="booking-row" key={item.id}>
                <div className="booking-row__meta">
                  <span className={statusMeta[item.status].className}>{statusMeta[item.status].label}</span>
                  <h3>{item.subjectName} for {item.learnerName}</h3>
                  <p><Calendar size={14} />{formatWhen(item.startAt)} · {item.durationMinutes} min</p>
                  {item.message && <p className="booking-row__note">“{item.message}”</p>}
                </div>
                <div className="booking-row__actions">
                  <button type="button" className="icon-button" onClick={() => openAction(item, 'report', item.learnerId)} aria-label="Report"><Flag size={15} /></button>
                  <button type="button" className="button button--outline button--small" onClick={() => openAction(item, 'decline')}><X size={15} />Decline</button>
                  <button type="button" className="button button--small" onClick={() => openAction(item, 'accept')}><Check size={15} />Accept</button>
                </div>
              </article>)}
              {acceptedForEducator.map(item => <article className="booking-row" key={item.id}>
                <div className="booking-row__meta">
                  <span className={statusMeta[item.status].className}>{statusMeta[item.status].label}</span>
                  <h3>{item.subjectName} with {item.learnerName}</h3>
                  <p><Calendar size={14} />{formatWhen(item.startAt)} · {item.durationMinutes} min</p>
                  {item.meetingLink && <a className="booking-row__link" href={item.meetingLink} target="_blank" rel="noreferrer"><Video size={14} />Class link</a>}
                </div>
                <div className="booking-row__actions">
                  <button type="button" className="icon-button" onClick={() => openAction(item, 'report', item.learnerId)} aria-label="Report"><Flag size={15} /></button>
                  <button type="button" className="button button--outline button--small" onClick={() => openAction(item, 'cancel')}>Cancel</button>
                  <button type="button" className="button button--small" onClick={() => void markComplete(item)}>Mark complete</button>
                </div>
              </article>)}
            </div>}
      </section>}

      {isLearner && <section className="dashboard-section"><div className="dashboard-section__heading"><h2>Continue your journey</h2><Link to="/explore">Explore more</Link></div><div className="journey-card"><div className="journey-ring"><strong>4</strong><small>classes</small></div><div><span className="kicker">Your August rhythm</span><h3>You showed up four times this month.</h3><p>That’s four meaningful steps toward speaking with confidence.</p></div><span className="journey-spark">✦</span></div></section>}
      {isEducator && !bookingsLoading && pendingRequests.length === 0 && acceptedForEducator.length === 0 && <section className="dashboard-section"><div className="dashboard-section__heading"><h2>Educator application</h2><Link to="/teach">Open application</Link></div><div className="application-status-card"><span className="status-orb">✦</span><div><h3>Manage your teaching profile</h3><p>Update your subjects, languages and availability so the right learners can find you.</p></div><Link className="button button--outline" to="/teach">Open application <ArrowRight /></Link></div></section>}
      {isLearner && <section className="dashboard-section"><div className="dashboard-section__heading"><h2>Saved for later</h2><Link to="/saved">See saved</Link></div><div className="saved-row">{educators.slice(1, 3).map(item => <Link to={`/educators/${item.slug}`} className="saved-mini" key={item.id}><span className={`avatar avatar--${item.accent}`}><span>{item.initials}</span><i /></span><div><strong>{item.displayName}</strong><small>{item.subjects[0]}</small><span>★ {item.rating} · From ₹{item.priceFrom}</span></div><Heart fill="currentColor" /></Link>)}</div></section>}
    </main><aside className="dashboard-aside"><div className="dashboard-profile"><span className="dashboard-avatar">{displayName.slice(0, 1)}</span><h3>{displayName}</h3><p>{educatorOnly ? 'Teaching on IlmSaathi' : 'Learning in English'} · Asia/Kolkata</p><Link to="/settings">Edit profile</Link></div><div className="support-card"><MessageCircle /><h3>Need a little help?</h3><p>Our support team can help with classes, safety or your account.</p><Link to="/support">Talk to support</Link></div>{blocks.length > 0 && <div className="support-card"><ShieldOff /><h3>Blocked</h3><p>{blocks.length} {blocks.length === 1 ? 'person' : 'people'} you’ve blocked.</p><div className="blocked-list">{blocks.map(item => <div className="blocked-row" key={item.id}><span>{item.blockedUserEmail}</span><button type="button" onClick={() => void unblock(item.id)}>Unblock</button></div>)}</div></div>}<div className="dashboard-tip"><Sparkles /><div><strong>Your privacy tip</strong><p>Keep personal contact details inside IlmSaathi support channels.</p></div></div></aside></div>
    <MobileBottomNav />
    {action && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeAction(); }}>
      <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="action-title">
        <button className="modal-close" onClick={closeAction} aria-label="Close" disabled={actionPending}><X /></button>
        <span className="kicker">{action.mode === 'accept' ? 'Accept this request' : action.mode === 'decline' ? 'Decline this request' : action.mode === 'report' ? 'Report this participant' : 'Cancel this booking'}</span>
        <h2 id="action-title">{action.booking.subjectName} · {formatWhen(action.booking.startAt)}</h2>
        {action.mode === 'accept'
          ? <label className="action-field">Private meeting link<input type="url" value={actionValue} onChange={event => setActionValue(event.target.value)} placeholder="https://meet.google.com/…" /><small>Shared only with this learner once you accept.</small></label>
          : action.mode === 'report'
            ? <><label className="action-field">Category<select value={reportCategory} onChange={event => setReportCategory(event.target.value as ReportCategory)}>{reportCategories.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="action-field">What happened?<textarea value={actionValue} onChange={event => setActionValue(event.target.value)} rows={3} placeholder="Share details for our safety team…" /></label></>
            : <label className="action-field">Reason<textarea value={actionValue} onChange={event => setActionValue(event.target.value)} rows={3} placeholder="Let them know why…" /></label>}
        <button className="button button--large button--full" disabled={actionPending} onClick={() => void submitAction()}>{actionPending ? 'Saving…' : action.mode === 'accept' ? 'Confirm class' : action.mode === 'decline' ? 'Decline request' : action.mode === 'report' ? 'Submit report' : 'Cancel booking'}</button>
      </section>
    </div>}
  </AppLayout>;
}
