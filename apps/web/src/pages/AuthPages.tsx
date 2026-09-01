import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Brand } from '../components/Brand';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

const loginSchema = z.object({ email: z.email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
const registerBaseSchema = loginSchema.extend({
  password: z.string().min(12, 'Use at least 12 characters.').max(128, 'Use no more than 128 characters.').refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), 'Include at least one letter and one number.'),
  displayName: z.string().trim().min(2, 'Tell us what to call you.').max(80, 'Use no more than 80 characters.'),
  termsAccepted: z.literal(true, { error: 'Please agree to the Terms and Privacy Notice.' })
});
const registerSchema = z.discriminatedUnion('role', [
  registerBaseSchema.extend({ role: z.literal('learner') }),
  registerBaseSchema.extend({
    role: z.literal('educator'),
    ageConfirmed: z.literal(true, { error: 'Educators must be 18 or older.' })
  })
]);

function safeNext(value: string | null, fallback: string) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

function AuthShell({ children, quote }: { children: React.ReactNode; quote: string }) {
  return <div className="auth-page"><aside className="auth-story"><Brand /><div><span className="kicker kicker--light">Your next chapter can start quietly</span><blockquote>“{quote}”</blockquote><p>Private, one-to-one learning with women who teach with care.</p></div><div className="auth-story__proof"><ShieldCheck /><span>Private profiles · Protected sessions · Clear verification</span></div></aside><main className="auth-main">{children}</main></div>;
}

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [values, setValues] = useState({ email: '', password: '', mfaCode: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setErrors({}); setNotice('');
    if (mfaRequired) {
      if (!/^\d{6}$/.test(values.mfaCode)) { setErrors({ mfaCode: 'Enter the 6-digit code from your authenticator app.' }); return; }
      setPending(true);
      try { await verifyMfa(values.mfaCode); navigate(safeNext(searchParams.get('next'), '/admin')); }
      catch (error) { setNotice(error instanceof ApiError ? error.message : 'That code could not be verified.'); }
      finally { setPending(false); }
      return;
    }
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    setPending(true);
    try {
      const result = await login(values.email, values.password);
      if (result.mfaRequired) { setMfaRequired(true); }
      else { navigate(safeNext(searchParams.get('next'), '/dashboard')); }
    } catch (error) { setNotice(error instanceof ApiError ? error.message : 'We could not log you in.'); }
    finally { setPending(false); }
  };

  return <AuthShell quote="I didn’t need more pressure. I needed the right person beside me.">
    <div className="auth-card"><Link className="auth-home" to="/">← Back to IlmSaathi</Link>{mfaRequired ? <><span className="auth-icon"><LockKeyhole /></span><h1>One last security check</h1><p>Enter the current code from your authenticator app. Admin access always requires this extra step.</p></> : <><span className="eyebrow"><Sparkles /> Welcome back</span><h1>Continue your learning story.</h1><p>Log in to see your classes, educators and next steps.</p></>}
      {notice && <div className="form-alert" role="alert">{notice}</div>}
      <form onSubmit={submit} noValidate>
        {!mfaRequired ? <>
          <label>Email address<div className={`input-wrap ${errors.email ? 'has-error' : ''}`}><Mail /><input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} placeholder="you@example.com" /></div>{errors.email && <small className="field-error">{errors.email}</small>}</label>
          <label>Password<div className={`input-wrap ${errors.password ? 'has-error' : ''}`}><LockKeyhole /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-invalid={Boolean(errors.password)} value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} placeholder="Your password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div>{errors.password && <small className="field-error">{errors.password}</small>}<Link className="forgot-link" to="/forgot-password">Forgot password?</Link></label>
        </> : <label>Authenticator code<div className={`input-wrap otp-input ${errors.mfaCode ? 'has-error' : ''}`}><ShieldCheck /><input inputMode="numeric" autoComplete="one-time-code" aria-invalid={Boolean(errors.mfaCode)} maxLength={6} value={values.mfaCode} onChange={event => setValues({ ...values, mfaCode: event.target.value.replace(/\D/g, '') })} placeholder="000000" /></div>{errors.mfaCode && <small className="field-error">{errors.mfaCode}</small>}</label>}
        <button className="button button--large button--full" disabled={pending}>{pending ? 'Please wait…' : mfaRequired ? 'Verify and continue' : 'Log in'}</button>
      </form>
      {!mfaRequired && <div className="auth-switch">New to IlmSaathi? <Link to="/register">Create your free account</Link></div>}
    </div>
  </AuthShell>;
}

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<'learner' | 'educator'>(() => searchParams.get('role') === 'educator' ? 'educator' : 'learner');
  const [showPassword, setShowPassword] = useState(false);
  const [values, setValues] = useState({ displayName: '', email: '', password: '', termsAccepted: false, ageConfirmed: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setErrors({}); setNotice('');
    const parsed = registerSchema.safeParse({ ...values, role });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))); return; }
    setPending(true);
    try {
      const { termsAccepted: _termsAccepted, ...registration } = parsed.data;
      await register(registration);
      const next = safeNext(searchParams.get('next'), role === 'educator' ? '/teach' : '/explore');
      navigate(`/onboarding?next=${encodeURIComponent(next)}`);
    }
    catch (error) { setNotice(error instanceof ApiError ? error.message : 'We could not create your account.'); }
    finally { setPending(false); }
  };

  return <AuthShell quote="The right lesson can change what you believe is possible for yourself.">
    <div className="auth-card auth-card--register"><Link className="auth-home" to="/">← Back to IlmSaathi</Link><span className="eyebrow"><Sparkles /> Join the circle</span><h1>What brings you here?</h1><p>Choose one to begin. You can add another learning role later.</p>
      <div className="role-toggle"><button type="button" aria-pressed={role === 'learner'} className={role === 'learner' ? 'is-selected' : ''} onClick={() => setRole('learner')}><span>✦</span><strong>I want to learn</strong><small>Find an educator and request one-to-one classes</small></button><button type="button" aria-pressed={role === 'educator'} className={role === 'educator' ? 'is-selected' : ''} onClick={() => setRole('educator')}><span>↗</span><strong>I want to teach</strong><small>Apply, get reviewed and build your teaching practice</small></button></div>
      {role === 'learner' && <p className="age-access-note"><ShieldCheck /> Learning is open at every age. Parent or guardian consent will protect under-18 accounts before public launch.</p>}
      {notice && <div className="form-alert" role="alert">{notice}</div>}
      <form onSubmit={submit} noValidate>
        <label>Your name<div className={`input-wrap ${errors.displayName ? 'has-error' : ''}`}><input value={values.displayName} autoComplete="name" onChange={event => setValues({ ...values, displayName: event.target.value })} placeholder="What should we call you?" /></div>{errors.displayName && <small className="field-error">{errors.displayName}</small>}</label>
        <label>Email address<div className={`input-wrap ${errors.email ? 'has-error' : ''}`}><Mail /><input type="email" autoComplete="email" value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} placeholder="you@example.com" /></div>{errors.email && <small className="field-error">{errors.email}</small>}</label>
        <label>Create a password<div className={`input-wrap ${errors.password ? 'has-error' : ''}`}><LockKeyhole /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" aria-invalid={Boolean(errors.password)} value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} placeholder="12+ characters with a letter and number" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button></div>{errors.password && <small className="field-error">{errors.password}</small>}</label>
        <label className="consent-row"><input type="checkbox" checked={values.termsAccepted} onChange={event => setValues({ ...values, termsAccepted: event.target.checked })} /><span>I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Notice</Link>.</span></label>{errors.termsAccepted && <small className="field-error">{errors.termsAccepted}</small>}
        {role === 'educator' && <><label className="consent-row"><input type="checkbox" checked={values.ageConfirmed} onChange={event => setValues({ ...values, ageConfirmed: event.target.checked })} /><span>I confirm that I am 18 or older.</span></label>{errors.ageConfirmed && <small className="field-error">{errors.ageConfirmed}</small>}</>}
        <button className="button button--large button--full" disabled={pending}>{pending ? 'Creating your space…' : role === 'learner' ? 'Create my learning space' : 'Start my educator application'}</button>
      </form><div className="auth-switch">Already have an account? <Link to="/login">Log in</Link></div>
    </div>
  </AuthShell>;
}
