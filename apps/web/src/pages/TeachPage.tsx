import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BadgeCheck, CalendarClock, Check, ChevronLeft, FileCheck2, IndianRupee, Languages, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout';
import { subjects } from '../data/demo';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { api, ApiError } from '../lib/api';
import type { EducatorDraftInput, LanguageCode, VerificationDocument } from '../types';

interface ApplicationDraft { biography: string; selectedSubjects: string[]; languages: LanguageCode[]; experience: string; qualification: string; city: string }
const emptyDraft: ApplicationDraft = { biography: '', selectedSubjects: [], languages: [], experience: '', qualification: '', city: '' };
const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function TeachPage() {
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(emptyDraft);
  const [pending, setPending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const progress = useMemo(() => `${step * 25}%`, [step]);

  const toggleSubject = (value: string) => setDraft(current => ({ ...current, selectedSubjects: current.selectedSubjects.includes(value) ? current.selectedSubjects.filter(item => item !== value) : [...current.selectedSubjects, value] }));
  const toggleLanguage = (value: LanguageCode) => setDraft(current => ({ ...current, languages: current.languages.includes(value) ? current.languages.filter(item => item !== value) : [...current.languages, value] }));
  const nextDisabled = step === 1 ? draft.selectedSubjects.length === 0 : step === 2 ? draft.languages.length === 0 || draft.biography.length < 100 : step === 3 ? !draft.experience : false;
  const buildDraftInput = (): EducatorDraftInput => ({
    biography: draft.biography,
    languages: draft.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    subjectClaims: draft.selectedSubjects.map(subjectId => ({
      subjectId,
      qualificationSummary: draft.qualification,
      experienceSummary: draft.experience
    }))
  });

  const goNext = async () => {
    // Evidence uploads attach to a persisted application, so save the draft as soon as enough of
    // it exists (subjects + languages + biography) rather than waiting for final submission.
    if (step === 2 && user && import.meta.env.VITE_DEMO_MODE !== 'true') {
      setSavingDraft(true);
      try {
        await api.saveApplication(buildDraftInput());
        setDocuments(await api.applicationDocuments().catch(() => []));
      } catch { notify('We could not save your draft yet. You can still continue and try again.'); }
      finally { setSavingDraft(false); }
    }
    setStep(step + 1);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) { notify('Please choose a PDF, JPG or PNG file.'); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { notify('That file is larger than 5 MB.'); return; }
    if (documents.length >= 5) { notify('You can add up to 5 documents.'); return; }
    setUploading(true);
    try {
      const uploaded = await api.uploadApplicationDocument(file);
      setDocuments(current => [...current, uploaded]);
      notify('Document added.');
    } catch (error) { notify(error instanceof ApiError ? error.message : 'We could not upload that file. Please try again.'); }
    finally { setUploading(false); }
  };

  const removeDocument = async (id: string) => {
    try { await api.deleteApplicationDocument(id); setDocuments(current => current.filter(item => item.id !== id)); }
    catch (error) { notify(error instanceof ApiError ? error.message : 'We could not remove that file.'); }
  };

  const submit = async () => {
    if (!user) { navigate('/register?role=educator&next=/teach'); return; }
    setPending(true);
    try {
      if (import.meta.env.VITE_DEMO_MODE !== 'true') {
        await api.saveApplication(buildDraftInput());
        await api.submitApplication();
      }
      notify('Application submitted. We’ll keep every review step visible.'); navigate('/dashboard');
    } catch { notify('Your draft is safe, but submission did not complete. Please try again.'); }
    finally { setPending(false); }
  };

  if (applying) return <AppLayout hideFooter><div className="application-page"><aside className="application-aside"><span className="kicker kicker--light">Educator application</span><h1>Share what you know. Keep what makes your teaching yours.</h1><div className="application-steps">{['Subjects', 'Your story', 'Experience', 'Review'].map((label, index) => <div className={step === index + 1 ? 'is-active' : step > index + 1 ? 'is-done' : ''} key={label}><span>{step > index + 1 ? <Check /> : index + 1}</span><strong>{label}</strong></div>)}</div><p><LockKeyhole /> Your draft and evidence are private to you and authorised reviewers.</p></aside><main className="application-main"><div className="mobile-progress"><span style={{ width: progress }} /></div><button className="back-link" onClick={() => step > 1 ? setStep(step - 1) : setApplying(false)}><ChevronLeft />{step > 1 ? 'Previous step' : 'Back to teaching overview'}</button>
    <div className="application-form"><span className="step-count">Step {step} of 4</span>
      {step === 1 && <><h2>What would you like to teach?</h2><p>Choose only from our approved catalogue. Approval happens subject by subject.</p><div className="application-subjects">{subjects.map(subject => <button className={draft.selectedSubjects.includes(subject.id) ? 'is-selected' : ''} onClick={() => toggleSubject(subject.id)} key={subject.id}>{draft.selectedSubjects.includes(subject.id) && <Check />}<strong>{subject.name}</strong><small>{subject.category}</small></button>)}</div></>}
      {step === 2 && <><h2>Help learners understand your style.</h2><p>Write naturally. We’ll never turn self-declared experience into a verified claim.</p><label>Teaching languages<div className="pill-picker">{([{ code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi' }, { code: 'ur', label: 'Urdu' }] as const).map(item => <button type="button" className={draft.languages.includes(item.code) ? 'is-selected' : ''} onClick={() => toggleLanguage(item.code)} key={item.code}>{item.label}</button>)}</div></label><label>Public introduction<textarea value={draft.biography} onChange={event => setDraft({ ...draft, biography: event.target.value })} rows={6} maxLength={800} placeholder="Tell learners who you help, how your lessons feel and what they can expect…" /><small>{draft.biography.length}/800 · minimum 100 characters</small></label><label>City (public at city level only)<input value={draft.city} onChange={event => setDraft({ ...draft, city: event.target.value })} placeholder="e.g. Hyderabad" /></label></>}
      {step === 3 && <><h2>Your experience and evidence</h2><p>These details go to our review team. They do not become public automatically.</p><label>Teaching experience<select value={draft.experience} onChange={event => setDraft({ ...draft, experience: event.target.value })}><option value="">Choose a range</option><option>Less than 1 year</option><option>1–3 years</option><option>4–7 years</option><option>8+ years</option></select></label><label>Qualification or training details<textarea value={draft.qualification} onChange={event => setDraft({ ...draft, qualification: event.target.value })} rows={4} placeholder="Institution, course or other relevant learning. Leave blank if your experience is self-taught." /></label>
        {!user ? <div className="upload-zone upload-zone--locked"><LockKeyhole /><strong>Create your account to add evidence</strong><span>You can finish adding documents once you’ve signed up.</span></div> : <>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden onChange={event => void handleFileChange(event)} />
          <button className="upload-zone" type="button" disabled={uploading || savingDraft || documents.length >= 5} onClick={() => fileInputRef.current?.click()}><UploadCloud /><strong>{uploading ? 'Uploading…' : 'Add private evidence'}</strong><span>PDF, JPG or PNG · up to 5 MB · stored privately</span></button>
          {documents.length > 0 && <ul className="document-list">{documents.map(item => <li key={item.id}><FileCheck2 /><span>{item.filename}</span><small>{(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB</small><button type="button" onClick={() => void removeDocument(item.id)} aria-label={`Remove ${item.filename}`}><X size={15} /></button></li>)}</ul>}
        </>}
      </>}
      {step === 4 && <><h2>Review before you submit</h2><p>Our team checks identity, subject suitability and evidence separately. Most pilot reviews take 2–4 working days.</p><div className="review-summary"><div><span>Subjects</span><strong>{draft.selectedSubjects.map(id => subjects.find(item => item.id === id)?.name).join(', ')}</strong><button onClick={() => setStep(1)}>Edit</button></div><div><span>Languages</span><strong>{draft.languages.map(code => ({ en: 'English', hi: 'Hindi', ur: 'Urdu' }[code])).join(', ')}</strong><button onClick={() => setStep(2)}>Edit</button></div><div><span>Experience</span><strong>{draft.experience}</strong><button onClick={() => setStep(3)}>Edit</button></div></div><label className="consent-row"><input type="checkbox" required /><span>I confirm these details are accurate and understand that approval may be withdrawn if evidence is misleading.</span></label><div className="application-trust"><ShieldCheck /><span><strong>No vague “verified” badge</strong><small>Your public profile will explain exactly which checks are complete.</small></span></div></>}
      <div className="application-actions">{step > 1 && <button className="button button--ghost" onClick={() => setStep(step - 1)}>Back</button>}<button className="button button--large" disabled={nextDisabled || pending || savingDraft} onClick={() => void (step < 4 ? goNext() : submit())}>{pending ? 'Submitting…' : savingDraft ? 'Saving…' : step < 4 ? 'Continue' : user ? 'Submit for review' : 'Create account to submit'}<ArrowRight /></button></div>
    </div></main></div></AppLayout>;

  return <AppLayout>
    <section className="teach-hero"><div className="container teach-hero__grid"><div><span className="eyebrow"><span>✦</span> Teach with IlmSaathi</span><h1>Your knowledge already has value. <em>Let it travel.</em></h1><p>Build a flexible teaching practice, meet committed learners and earn from one-to-one lessons—without turning yourself into content.</p><button className="button button--gold button--large" onClick={() => setApplying(true)}>Start your application <ArrowRight /></button><small>No listing fee · Clear review process · You choose your hours</small></div><div className="teacher-portrait-art"><div className="teacher-card"><span className="avatar avatar--rose"><span>NR</span><i /></span><strong>Nida’s week</strong><div><CalendarClock /> 8 lessons</div><div><IndianRupee /> ₹4,720 earned</div><small>Illustrative earnings, before applicable fees and taxes</small></div><div className="teacher-shape teacher-shape--one" /><div className="teacher-shape teacher-shape--two" /></div></div></section>
    <section id="earnings" className="section teaching-benefits"><div className="container"><div className="section-heading section-heading--center"><span className="kicker">A teaching platform that works like a partner</span><h2>Build a practice you can sustain.</h2></div><div className="benefit-grid"><div><CalendarClock /><h3>Own your schedule</h3><p>Open only the hours that work for you. Set buffers and change future availability.</p></div><div><IndianRupee /><h3>Transparent earnings</h3><p>See learner price, platform fee and your estimated earning before you accept.</p></div><div><Languages /><h3>Teach your way</h3><p>Offer approved subjects in the languages where you can teach with confidence.</p></div><div><FileCheck2 /><h3>Verification with nuance</h3><p>Identity, qualifications, experience and subject approval remain separate claims.</p></div></div></div></section>
    <section id="standards" className="section review-process"><div className="container review-process__grid"><div><span className="kicker">A human review, not a black box</span><h2>Know exactly what happens next.</h2><p>We protect learners without asking educators to fit one narrow mould. Every decision includes a reason and a path forward.</p><Link className="arrow-link" to="/safety">Read educator standards <ArrowRight /></Link></div><ol><li><span>1</span><div><strong>Tell us about your teaching</strong><small>Subjects, languages, experience and a private application.</small></div></li><li><span>2</span><div><strong>Share relevant evidence</strong><small>Only authorised reviewers can access short-lived document links.</small></div></li><li><span>3</span><div><strong>Receive a clear decision</strong><small>Approved, changes requested or declined—with a recorded reason.</small></div></li><li><span><BadgeCheck /></span><div><strong>Publish your educator profile</strong><small>Only approved subjects appear in discovery.</small></div></li></ol></div></section>
    <section className="section final-cta"><div className="container"><span>✦</span><h2>Someone is looking for the way you explain it.</h2><p>Start a private draft today. Submit only when it feels ready.</p><button className="button button--large" onClick={() => setApplying(true)}>Begin my educator application <ArrowRight /></button></div></section>
  </AppLayout>;
}
