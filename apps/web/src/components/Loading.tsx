export function PageLoading() {
  return <div className="page-loading" role="status"><span /><p>Preparing your learning space…</p></div>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><div>✦</div><h3>{title}</h3><p>{message}</p></div>;
}
