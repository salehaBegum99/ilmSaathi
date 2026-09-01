import { ArrowRight, BadgeCheck, BookOpen, CalendarCheck2, CirclePlay, HeartHandshake, Languages, Laptop2, ShieldCheck, Sparkles, Star, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/Layout';
import { EducatorCard } from '../components/EducatorCard';
import { useLocale } from '../contexts/LocaleContext';
import { educators, subjects } from '../data/demo';

const subjectIcons = { faith: BookOpen, academic: Sparkles, practical: Laptop2 } as const;

export function LandingPage() {
  const { t, locale } = useLocale();
  return <AppLayout>
    <section className="hero">
      <div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span>✦</span> A learning circle made for women</div>
          <h1>{t.headline}</h1>
          <p className="hero-lead">{t.subhead}</p>
          <div className="hero-actions">
            <Link className="button button--large" to="/explore">{t.explore}<ArrowRight size={18} /></Link>
            <Link className="button button--ghost button--large" to="/how-it-works"><CirclePlay size={19} />See how it works</Link>
          </div>
          <div className="hero-proof">
            <div className="mini-avatars"><span>SF</span><span>AK</span><span>MP</span><span>RS</span></div>
            <div><strong>4.9 <Star size={13} fill="currentColor" /></strong><small>Loved by our private-pilot learners</small></div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame"><img src="/images/ilmsaathi-hero.png" alt="Women learning together around a laptop and notebooks" /></div>
          <div className="floating-note floating-note--top"><span className="floating-icon"><ShieldCheck /></span><div><strong>Thoughtfully verified</strong><small>Identity and subject checks are shown separately</small></div></div>
          <div className="floating-note floating-note--bottom"><span className="live-dot" /><div><strong>1:1 live lessons</strong><small>At your pace, in your language</small></div></div>
        </div>
      </div>
      <div className="container trust-strip"><span>Private by design</span><i /><span>Women educators</span><i /><span>English · हिंदी · اردو</span><i /><span>Learning at every age</span></div>
    </section>

    <section className="section subject-section">
      <div className="container">
        <div className="section-heading section-heading--split"><div><span className="kicker">Begin with what matters to you</span><h2>One place. Many ways to grow.</h2></div><Link className="arrow-link" to="/explore">Explore all educators <ArrowRight /></Link></div>
        <div className="subject-grid">
          {subjects.slice(0, 6).map((subject, index) => {
            const Icon = subjectIcons[subject.category];
            return <Link className={`subject-tile subject-tile--${index + 1}`} to={`/explore?subject=${subject.slug}`} key={subject.id}>
              <span className="subject-icon"><Icon /></span><div><h3>{subject.localizedNames?.[locale] || subject.name}</h3><p>{subject.category === 'faith' ? 'Learn with care and clarity' : subject.category === 'academic' ? 'Build strong foundations' : 'Skills for everyday confidence'}</p></div><ArrowRight />
            </Link>;
          })}
        </div>
      </div>
    </section>

    <section className="section promise-section">
      <div className="container promise-grid">
        <div className="promise-art" aria-hidden="true"><div className="arch arch--one" /><div className="arch arch--two" /><div className="promise-quote"><span>“</span><p>I finally asked every question I was too shy to ask elsewhere.</p></div></div>
        <div className="promise-copy"><span className="kicker">A safer way to learn</span><h2>Built around your comfort, not an algorithm.</h2><p>IlmSaathi makes room for curiosity without judgement. You choose the educator, the time and the pace. We keep private details private and show exactly what has—and has not—been verified.</p>
          <div className="promise-list">
            <div><ShieldCheck /><span><strong>Layered verification</strong><small>Contact, identity and qualifications never become one vague badge.</small></span></div>
            <div><Languages /><span><strong>Your language, your pace</strong><small>Learn in English, Hindi or Urdu with timezone-aware scheduling.</small></span></div>
            <div><HeartHandshake /><span><strong>Respectful by design</strong><small>No public contact details, class recording or unrestricted messaging.</small></span></div>
          </div>
          <Link className="arrow-link" to="/safety">Read our trust promise <ArrowRight /></Link>
        </div>
      </div>
    </section>

    <section className="section featured-section">
      <div className="container">
        <div className="section-heading section-heading--split"><div><span className="kicker">Meet your next mentor</span><h2>Educators who teach the person, not just the subject.</h2></div><Link className="button button--outline" to="/explore">View everyone</Link></div>
        <div className="featured-grid">{educators.slice(0, 3).map(educator => <EducatorCard educator={educator} key={educator.id} />)}</div>
      </div>
    </section>

    <section className="section steps-section">
      <div className="container"><div className="section-heading section-heading--center"><span className="kicker">From “maybe someday” to your first lesson</span><h2>Starting is beautifully simple.</h2></div>
        <div className="steps-grid">
          <div className="step-card"><span>01</span><div className="step-icon"><UsersRound /></div><h3>Tell us what you need</h3><p>Choose a subject, language and learning goal. No long forms before you can browse.</p></div>
          <div className="step-card"><span>02</span><div className="step-icon"><BadgeCheck /></div><h3>Choose with confidence</h3><p>Compare teaching style, verification details, availability and transparent pricing.</p></div>
          <div className="step-card"><span>03</span><div className="step-icon"><CalendarCheck2 /></div><h3>Learn live, one-to-one</h3><p>Request a private lesson, receive your protected meeting link and learn at your pace.</p></div>
        </div>
      </div>
    </section>

    <section className="section educator-cta-section">
      <div className="container educator-cta"><div><span className="kicker kicker--light">Your knowledge can open a door</span><h2>Teach on your terms.<br />Earn with purpose.</h2><p>Create your educator profile, choose your hours and help another woman move forward.</p><Link className="button button--gold button--large" to="/teach">Start your application <ArrowRight /></Link></div><div className="earnings-card"><span>This is more than a listing</span><strong>Keep your voice.<br />Set your pace.<br />Build your practice.</strong><div><i>✓</i> Clear platform fees</div><div><i>✓</i> No lead-selling</div><div><i>✓</i> Support when a class needs help</div></div></div>
    </section>
  </AppLayout>;
}
