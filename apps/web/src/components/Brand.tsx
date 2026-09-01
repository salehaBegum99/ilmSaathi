import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className="brand" to="/" aria-label="IlmSaathi home">
    <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect className="brand__mark-bg" x="1" y="1" width="62" height="62" rx="18" />
      <path className="brand__mark-page" d="M13.5 22.5c7.6-.2 13.3 2.1 17.5 6.8v19.2c-4.2-4.2-9.8-6.3-17.5-6.2V22.5Z" />
      <path className="brand__mark-page" d="M50.5 22.5c-7.6-.2-13.3 2.1-17.5 6.8v19.2c4.2-4.2 9.8-6.3 17.5-6.2V22.5Z" />
      <path className="brand__mark-path" d="M32 47.8V30.6c0-5.2 2.8-9.5 7.3-12.2" />
      <path className="brand__mark-star" d="m40.5 11.8 1.5 3.7 3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7-3.7-1.5 3.7-1.5 1.5-3.7Z" />
    </svg>
    {!compact && <span className="brand__word"><span className="brand__name"><strong>Ilm</strong><span>Saathi</span></span><small>learn · teach · rise</small></span>}
  </Link>;
}
