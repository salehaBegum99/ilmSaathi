import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Check, ChevronRight, Clock3, FileLock2, Filter, LogOut, RotateCcw, Search, ShieldCheck, UserCheck, UsersRound, UserX, X } from 'lucide-react';
import { Brand } from '../components/Brand';
import { applications as demoApplications } from '../data/demo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { AdminEducator, AuditLogEntry, EducatorApplication, Report, VerificationDocument } from '../types';

type Section = 'applications' | 'educators' | 'moderation' | 'audit';
type ModalKind = 'suspend' | 'reinstate' | 'resolve' | 'dismiss';
const sectionTitles: Record<Section, string> = {
  applications: 'Educator review queue',
  educators: 'Educators directory',
  moderation: 'Safety cases',
  audit: 'Audit log'
};
const statusTone = (status: string) => (
  status === 'approved' || status === 'published' || status === 'resolved' ? 'approved'
    : status === 'rejected' || status === 'suspended' || status === 'dismissed' ? 'rejected'
    : status === 'under_review' || status === 'in_review' || status === 'submitted' || status === 'open' ? 'under_review'
    : 'draft'
);
const initials = (value: string) => value.split(/[\s@.]+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();

export function AdminPage() {
  const { user, loading, logout } = useAuth();
  const { notify } = useToast();
  const [section, setSection] = useState<Section>('applications');
  const [items, setItems] = useState<EducatorApplication[]>(import.meta.env.VITE_DEMO_MODE === 'true' ? demoApplications : []);
  const [selectedId, setSelectedId] = useState(items[0]?.id || '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [educators, setEducators] = useState<AdminEducator[]>([]);
  const [selectedEducatorId, setSelectedEducatorId] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [modal, setModal] = useState<{ kind: ModalKind; targetId: string } | null>(null);
  const [modalReason, setModalReason] = useState('');
  const [suspendOnResolve, setSuspendOnResolve] = useState(false);
  const [modalPending, setModalPending] = useState(false);
  const selected = useMemo(() => items.find(item => item.id === selectedId), [items, selectedId]);
  const selectedEducator = useMemo(() => educators.find(item => item.id === selectedEducatorId), [educators, selectedEducatorId]);
  const selectedReport = useMemo(() => reports.find(item => item.id === selectedReportId), [reports, selectedReportId]);

  useEffect(() => { api.adminApplications().then(result => { setItems(result); setSelectedId(result[0]?.id || ''); }).catch(() => undefined); }, []);

  useEffect(() => {
    let active = true;
    const shouldFetch = Boolean(selectedId) && import.meta.env.VITE_DEMO_MODE !== 'true';
    const request = shouldFetch ? api.adminApplicationDocuments(selectedId).catch(() => []) : Promise.resolve([]);
    void request.then(result => { if (active) setDocuments(result); });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return;
    let active = true;
    if (section === 'educators') api.adminEducators().then(result => { if (active) setEducators(result); }).catch(() => undefined);
    else if (section === 'moderation') api.adminReports().then(result => { if (active) setReports(result); }).catch(() => undefined);
    else if (section === 'audit') api.auditLog().then(result => { if (active) setAuditEntries(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [section]);

  const viewDocument = async (documentId: string) => {
    if (!selectedId) return;
    try {
      const url = await api.documentAccessUrl(selectedId, documentId);
      window.open(url, '_blank', 'noopener');
    } catch (error) { notify(error instanceof ApiError ? error.message : 'We could not open that document.'); }
  };

  const decide = async (decision: 'approve' | 'reject' | 'request_changes') => {
    if (!selected || reason.trim().length < 8) { notify('Add a clear review reason before making a decision.'); return; }
    setPending(true);
    try {
      if (import.meta.env.VITE_DEMO_MODE !== 'true') await api.reviewApplication(selected.id, { decision, reason });
      const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'changes_requested';
      setItems(current => current.map(item => item.id === selected.id ? { ...item, status } : item));
      setReason(''); notify(`Decision recorded: ${status.replace('_', ' ')}. An audit event was created.`);
    } catch { notify('The decision was not saved. No status was changed.'); }
    finally { setPending(false); }
  };

  const openModal = (kind: ModalKind, targetId: string) => { setModal({ kind, targetId }); setModalReason(''); setSuspendOnResolve(false); };
  const closeModal = () => { if (!modalPending) setModal(null); };

  const assignToMe = async (id: string) => {
    try {
      const updated = await api.assignReport(id);
      setReports(current => current.map(item => item.id === id ? updated : item));
      notify('Assigned to you.');
    } catch (error) { notify(error instanceof ApiError ? error.message : 'Could not assign this report.'); }
  };

  const submitModal = async () => {
    if (!modal || modalReason.trim().length < 10) { notify('Add a reason (at least 10 characters).'); return; }
    setModalPending(true);
    try {
      if (modal.kind === 'suspend') {
        await api.suspendEducator(modal.targetId, modalReason);
        setEducators(current => current.map(item => item.educatorId === modal.targetId ? { ...item, publicationStatus: 'suspended' } : item));
        notify('Educator suspended from public discovery.');
      } else if (modal.kind === 'reinstate') {
        await api.reinstateEducator(modal.targetId, modalReason);
        setEducators(current => current.map(item => item.educatorId === modal.targetId ? { ...item, publicationStatus: 'published' } : item));
        notify('Educator reinstated.');
      } else if (modal.kind === 'resolve') {
        const updated = await api.resolveReport(modal.targetId, modalReason, suspendOnResolve);
        setReports(current => current.map(item => item.id === modal.targetId ? updated : item));
        notify(suspendOnResolve ? 'Report resolved and the account was suspended.' : 'Report resolved.');
      } else {
        const updated = await api.dismissReport(modal.targetId, modalReason);
        setReports(current => current.map(item => item.id === modal.targetId ? updated : item));
        notify('Report dismissed.');
      }
      setModal(null);
    } catch (error) { notify(error instanceof ApiError ? error.message : 'That action could not be completed.'); }
    finally { setModalPending(false); }
  };

  if (loading) return <div className="page-loading"><span /></div>;
  if ((!user || !user.roles.includes('admin')) && import.meta.env.VITE_DEMO_MODE !== 'true') return <Navigate to="/login?next=/admin" />;

  return <div className="admin-shell"><aside className="admin-sidebar"><Brand /><nav>
      <a className={section === 'applications' ? 'is-active' : ''} href="#applications" onClick={event => { event.preventDefault(); setSection('applications'); }}><UserCheck />Applications <span>{items.filter(item => ['submitted', 'under_review'].includes(item.status)).length}</span></a>
      <a className={section === 'educators' ? 'is-active' : ''} href="#educators" onClick={event => { event.preventDefault(); setSection('educators'); }}><UsersRound />Educators</a>
      <a className={section === 'moderation' ? 'is-active' : ''} href="#moderation" onClick={event => { event.preventDefault(); setSection('moderation'); }}><ShieldCheck />Safety cases <span>{reports.filter(item => item.status === 'open' || item.status === 'in_review').length}</span></a>
      <a className={section === 'audit' ? 'is-active' : ''} href="#audit" onClick={event => { event.preventDefault(); setSection('audit'); }}><FileLock2 />Audit log</a>
    </nav><div className="admin-user"><span>{user?.displayName?.slice(0, 1) || 'A'}</span><div><strong>{user?.displayName || 'Pilot Admin'}</strong><small>MFA protected</small></div><button onClick={() => void logout()} aria-label="Log out"><LogOut /></button></div></aside>
    <main className="admin-main"><header><div><span className="kicker">Operations</span><h1>{sectionTitles[section]}</h1></div><div className="admin-security"><ShieldCheck /><span><strong>Protected session</strong><small>MFA checked · actions are audited</small></span></div></header>

      {section === 'applications' && <>
        <div className="admin-stats"><div><span><Clock3 /></span><strong>{items.filter(item => item.status === 'submitted').length}</strong><small>Awaiting review</small></div><div><span><UserCheck /></span><strong>{items.filter(item => item.status === 'under_review').length}</strong><small>In review</small></div><div><span><AlertTriangle /></span><strong>{items.filter(item => item.status === 'changes_requested').length}</strong><small>Changes requested</small></div><div><span><BadgeCheck /></span><strong>{items.filter(item => item.status === 'approved').length}</strong><small>Approved today</small></div></div>
        <div className="admin-workspace"><section className="queue-panel"><div className="queue-tools"><label><Search /><input placeholder="Search applicants" /></label><button aria-label="Filter queue"><Filter /></button></div><div className="queue-tabs"><button className="is-active">Open</button><button>Decided</button><button>All</button></div><div className="queue-list">{items.map(item => <button className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)} key={item.id}><span className="queue-avatar">{initials(item.educatorName)}</span><div><strong>{item.educatorName}</strong><small>{item.subjects.join(', ')}</small><span className={`status-label status-label--${item.status}`}>{item.status.replace('_', ' ')}</span></div><time>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Draft'}</time><ChevronRight /></button>)}</div></section>
          <section className="review-panel">{selected ? <><div className="review-panel__header"><div><span className="queue-avatar queue-avatar--large">{initials(selected.educatorName)}</span><div><h2>{selected.educatorName}</h2><p>{selected.email}</p></div></div><span className={`status-label status-label--${selected.status}`}>{selected.status.replace('_', ' ')}</span></div><div className="review-metadata"><div><span>Submitted</span><strong>{selected.submittedAt ? new Date(selected.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not submitted'}</strong></div><div><span>Languages</span><strong>{selected.languages.join(', ')}</strong></div><div><span>Experience</span><strong>{selected.experience}</strong></div></div><div className="review-block"><h3>Requested subject approvals</h3>{selected.subjects.map(subject => <div className="approval-row" key={subject}><span className="subject-mini">✦</span><div><strong>{subject}</strong><small>Qualification status requires evidence review</small></div><span className="status-pill">Pending</span></div>)}</div><div className="review-block"><h3>Private evidence</h3>{documents.length === 0 ? <p className="safety-caption"><ShieldCheck /> No documents uploaded yet.</p> : <>{documents.map(document => <button className="document-row" key={document.id} onClick={() => void viewDocument(document.id)}><FileLock2 /><span><strong>{document.filename}</strong><small>Private · signed access expires in 5 minutes</small></span><ChevronRight /></button>)}<p className="safety-caption"><ShieldCheck /> Opening a document creates an access audit event.</p></>}</div><div className="review-block"><label><span>Decision reason <small>required</small></span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} placeholder="Record the evidence checked and the reason for this decision…" /></label></div><div className="review-actions"><button className="button button--danger-outline" disabled={pending} onClick={() => void decide('reject')}><X />Decline</button><button className="button button--outline" disabled={pending} onClick={() => void decide('request_changes')}>Request changes</button><button className="button" disabled={pending} onClick={() => void decide('approve')}><Check />Approve educator</button></div></> : <div className="empty-state"><h2>Select an application</h2><p>Review details and evidence before making a recorded decision.</p></div>}</section>
        </div>
      </>}

      {section === 'educators' && <div className="admin-workspace"><section className="queue-panel"><div className="queue-tools"><label><Search /><input placeholder="Search educators" /></label></div><div className="queue-list">
          {educators.length === 0 ? <div className="empty-state"><h3>No educators yet</h3><p>Approved educators appear here once published.</p></div> : educators.map(item => <button className={selectedEducatorId === item.id ? 'is-selected' : ''} onClick={() => setSelectedEducatorId(item.id)} key={item.id}><span className="queue-avatar">{initials(item.displayName)}</span><div><strong>{item.displayName}</strong><small>{item.subjects.map(subject => subject.name).join(', ')}</small><span className={`status-label status-label--${statusTone(item.publicationStatus)}`}>{item.publicationStatus}</span></div><ChevronRight /></button>)}
        </div></section>
        <section className="review-panel">{selectedEducator ? <>
            <div className="review-panel__header"><div><span className="queue-avatar queue-avatar--large">{initials(selectedEducator.displayName)}</span><div><h2>{selectedEducator.displayName}</h2><p>{selectedEducator.email}</p></div></div><span className={`status-label status-label--${statusTone(selectedEducator.publicationStatus)}`}>{selectedEducator.publicationStatus}</span></div>
            <div className="review-metadata"><div><span>Approved</span><strong>{new Date(selectedEducator.approvedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</strong></div><div><span>Languages</span><strong>{selectedEducator.languages.join(', ')}</strong></div><div><span>Subjects</span><strong>{selectedEducator.subjects.map(subject => subject.name).join(', ')}</strong></div></div>
            <div className="review-actions">{selectedEducator.publicationStatus === 'published' ? <button className="button button--danger-outline" onClick={() => openModal('suspend', selectedEducator.educatorId)}><UserX />Suspend listing</button> : <button className="button" onClick={() => openModal('reinstate', selectedEducator.educatorId)}><RotateCcw />Reinstate listing</button>}</div>
          </> : <div className="empty-state"><h2>Select an educator</h2><p>Suspend or reinstate a public listing.</p></div>}</section>
      </div>}

      {section === 'moderation' && <div className="admin-workspace"><section className="queue-panel"><div className="queue-tabs"><button className="is-active">Open</button></div><div className="queue-list">
          {reports.length === 0 ? <div className="empty-state"><h3>No safety cases</h3><p>Reports from learners and educators appear here.</p></div> : reports.map(item => <button className={selectedReportId === item.id ? 'is-selected' : ''} onClick={() => setSelectedReportId(item.id)} key={item.id}><span className="queue-avatar">{initials(item.reportedUserEmail)}</span><div><strong>{item.reportedUserEmail}</strong><small>{item.category.replace(/_/g, ' ')}</small><span className={`status-label status-label--${statusTone(item.status)}`}>{item.status.replace('_', ' ')}</span></div><time>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</time><ChevronRight /></button>)}
        </div></section>
        <section className="review-panel">{selectedReport ? <>
            <div className="review-panel__header"><div><span className="queue-avatar queue-avatar--large">{initials(selectedReport.reportedUserEmail)}</span><div><h2>{selectedReport.reportedUserEmail}</h2><p>Reported by {selectedReport.reporterEmail}</p></div></div><span className={`status-label status-label--${statusTone(selectedReport.status)}`}>{selectedReport.status.replace('_', ' ')}</span></div>
            <div className="review-metadata"><div><span>Category</span><strong>{selectedReport.category.replace(/_/g, ' ')}</strong></div><div><span>Filed</span><strong>{new Date(selectedReport.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div></div>
            <div className="review-block"><h3>Description</h3><p className="profile-bio">{selectedReport.description}</p></div>
            {selectedReport.resolutionReason && <div className="review-block"><h3>Resolution</h3><p className="profile-bio">{selectedReport.resolutionReason}</p></div>}
            {(selectedReport.status === 'open' || selectedReport.status === 'in_review') && <div className="review-actions">
              {selectedReport.status === 'open' && <button className="button button--outline" onClick={() => void assignToMe(selectedReport.id)}><UserCheck />Assign to me</button>}
              <button className="button button--danger-outline" onClick={() => openModal('dismiss', selectedReport.id)}><X />Dismiss</button>
              <button className="button" onClick={() => openModal('resolve', selectedReport.id)}><Check />Resolve</button>
            </div>}
          </> : <div className="empty-state"><h2>Select a safety case</h2><p>Review the report before taking action.</p></div>}</section>
      </div>}

      {section === 'audit' && <section className="queue-panel audit-panel"><div className="queue-list">
          {auditEntries.length === 0 ? <div className="empty-state"><h3>No audit events yet</h3><p>Admin actions will be recorded here as they happen.</p></div> : auditEntries.map(entry => <div className="audit-row" key={entry.id}><div><strong>{entry.actorEmail}</strong><span>{entry.action.replace(/[._]/g, ' ')}</span></div><small>{entry.targetType} · {entry.targetId.slice(-6)}</small>{entry.reason && <p>{entry.reason}</p>}<time>{new Date(entry.occurredAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>)}
        </div></section>}
    </main>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
      <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <button className="modal-close" onClick={closeModal} aria-label="Close" disabled={modalPending}><X /></button>
        <span className="kicker">{modal.kind === 'suspend' ? 'Suspend listing' : modal.kind === 'reinstate' ? 'Reinstate listing' : modal.kind === 'resolve' ? 'Resolve report' : 'Dismiss report'}</span>
        <h2 id="admin-modal-title">Add a reason</h2>
        <label className="action-field">Reason<textarea value={modalReason} onChange={event => setModalReason(event.target.value)} rows={3} placeholder="Record the reasoning for this action…" /></label>
        {modal.kind === 'resolve' && <label className="check-row"><input type="checkbox" checked={suspendOnResolve} onChange={event => setSuspendOnResolve(event.target.checked)} /><span>Also suspend this account</span></label>}
        <button className="button button--large button--full" disabled={modalPending} onClick={() => void submitModal()}>{modalPending ? 'Saving…' : 'Confirm'}</button>
      </section>
    </div>}
  </div>;
}
