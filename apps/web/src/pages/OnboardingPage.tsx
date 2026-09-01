import { useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Clock3, Languages, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { subjects } from '../data/demo';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { LanguageCode } from '../types';

export function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [goal, setGoal] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const complete = async () => {
    setPending(true);
    try { if (import.meta.env.VITE_DEMO_MODE !== 'true') await api.updateProfile({ displayName: user?.displayName || 'IlmSaathi member', preferredLanguage: language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, learningGoals: [goal], subjectIds: selectedSubjects }); await refreshUser(); } catch { /* form remains useful in preview mode */ }
    finally { setPending(false); navigate('/explore'); }
  };

  return <div className="onboarding-page"><header><Brand /><button className="text-button" onClick={() => navigate('/')}>Save & leave</button></header><main><div className="onboarding-progress"><span style={{ width: `${step * 33.333}%` }} /></div><div className="onboarding-card"><span className="step-count">Step {step} of 3</span>
    {step === 1 && <><span className="onboarding-icon"><Sparkles /></span><h1>What would you love to learn?</h1><p>Choose as many as you like. This simply makes your discovery page more useful.</p><div className="onboarding-subjects">{subjects.map(subject => { const selected = selectedSubjects.includes(subject.slug); return <button className={selected ? 'is-selected' : ''} onClick={() => setSelectedSubjects(selected ? selectedSubjects.filter(item => item !== subject.slug) : [...selectedSubjects, subject.slug])} key={subject.id}>{selected && <Check />}{subject.name}<small>{subject.category}</small></button>; })}</div></>}
    {step === 2 && <><span className="onboarding-icon"><Languages /></span><h1>How do you prefer to learn?</h1><p>Your educator can teach in more than one language. Choose your first preference.</p><div className="language-options">{([{ code: 'en', label: 'English', native: 'English' }, { code: 'hi', label: 'Hindi', native: 'हिंदी' }, { code: 'ur', label: 'Urdu', native: 'اردو' }] as const).map(item => <button className={language === item.code ? 'is-selected' : ''} onClick={() => setLanguage(item.code)} key={item.code}><strong>{item.label}</strong><small>{item.native}</small>{language === item.code && <Check />}</button>)}</div><div className="timezone-note"><Clock3 /><span><strong>Your timezone</strong><small>{Intl.DateTimeFormat().resolvedOptions().timeZone} · times will always be shown here</small></span></div></>}
    {step === 3 && <><span className="onboarding-icon">✦</span><h1>What would make this feel worthwhile?</h1><p>A sentence is enough. Only you and relevant educators should see this goal.</p><label className="goal-field"><span>My learning goal</span><textarea value={goal} onChange={event => setGoal(event.target.value)} maxLength={300} placeholder="For example: I want to speak confidently in work meetings, starting with everyday conversation…" /><small>{goal.length}/300</small></label><div className="privacy-note">We don’t use private learning goals for advertising.</div></>}
    <div className="onboarding-actions">{step > 1 && <button className="button button--ghost" onClick={() => setStep(step - 1)}><ChevronLeft />Back</button>}<button className="button button--large" disabled={step === 1 && selectedSubjects.length === 0 || step === 3 && !goal.trim() || pending} onClick={() => step < 3 ? setStep(step + 1) : void complete()}>{pending ? 'Finishing…' : step < 3 ? 'Continue' : 'Show my educators'}<ArrowRight /></button></div>
  </div></main></div>;
}
