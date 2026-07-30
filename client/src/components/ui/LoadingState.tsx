type LoadingStateProps = {
  detail?: string;
  label: string;
  rows?: number;
  variant?: "page" | "panel" | "feed";
};

export function LoadingLabel({ children }: { children: string }) {
  return (
    <span className="nus-loading-label">
      <span aria-hidden="true" className="nus-loading-label-spinner" />
      {children}
    </span>
  );
}

export default function LoadingState({
  detail,
  label,
  rows = 3,
  variant = "page",
}: LoadingStateProps) {
  return (
    <section
      aria-live="polite"
      className={`nus-loading-state is-${variant}`}
      role="status"
    >
      <div className="nus-loading-intro">
        <span aria-hidden="true" className="nus-loading-mark">
          <i />
          <i />
          <i />
        </span>
        <span className="nus-loading-copy">
          <strong>{label}</strong>
          {detail && <span>{detail}</span>}
        </span>
      </div>

      {variant === "page" && (
        <div aria-hidden="true" className="nus-loading-page-preview">
          <div className="nus-skeleton-avatar" />
          <div className="nus-loading-page-lines">
            <i />
            <i />
            <i />
          </div>
          <div className="nus-skeleton-signal" />
        </div>
      )}

      {variant === "feed" && (
        <div aria-hidden="true" className="nus-loading-feed">
          {Array.from({ length: rows }, (_, index) => (
            <div className="nus-loading-feed-row" key={index}>
              <div className="nus-skeleton-avatar" />
              <div className="nus-loading-feed-lines">
                <i />
                <i />
                <i />
              </div>
              <div className="nus-skeleton-signal" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
