import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import UserAvatar from "../components/ui/UserAvatar";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";

const REASONS = [
  {
    id: "harassment",
    mark: "01",
    title: "Harassment or bullying",
    note: "Targeted abuse, intimidation, or repeated unwanted contact",
  },
  {
    id: "hate",
    mark: "02",
    title: "Hateful conduct",
    note: "Attacks based on identity, vulnerability, or protected traits",
  },
  {
    id: "threat",
    mark: "03",
    title: "Threat or physical harm",
    note: "Violence, credible threats, or encouragement of harm",
  },
  {
    id: "sexual",
    mark: "04",
    title: "Sexual or exploitative",
    note: "Unwanted sexual content, exploitation, or predatory behavior",
  },
  {
    id: "privacy",
    mark: "05",
    title: "Privacy or impersonation",
    note: "Personal information, doxxing, or pretending to be someone",
  },
  {
    id: "self_harm",
    mark: "06",
    title: "Self-harm concern",
    note: "Content promoting, planning, or describing immediate self-harm",
  },
  {
    id: "spam",
    mark: "07",
    title: "Spam or scam",
    note: "Deceptive links, fraud, manipulation, or repetitive promotion",
  },
  {
    id: "other",
    mark: "08",
    title: "Something else",
    note: "A concern that does not fit the signals above",
  },
] as const;

const AFFECTED = [
  { id: "me", label: "Me", detail: "I’m directly affected" },
  { id: "someone_else", label: "Someone else", detail: "I’m reporting for another person" },
  { id: "community", label: "The community", detail: "This could affect many people" },
] as const;

type Target = {
  avatar_url?: string | null;
  content: string;
  id: string;
  isReply: boolean;
  title?: string;
  userId?: string;
  username: string;
};

export default function ReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = getStoredUser();
  const type = searchParams.get("type");
  const targetId = searchParams.get("id");
  const postId = searchParams.get("postId");
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [reason, setReason] = useState("");
  const [affectedParty, setAffectedParty] = useState("");
  const [details, setDetails] = useState("");
  const [immediateRisk, setImmediateRisk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reportId, setReportId] = useState("");

  const returnPath = postId ? `/posts/${postId}` : "/";
  const selectedReason = useMemo(
    () => REASONS.find((item) => item.id === reason),
    [reason],
  );
  const targetLabel = target?.isReply
    ? "reply"
    : type === "post"
      ? "post"
      : "comment";

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const loadTarget = async () => {
      try {
        const token = getAuthToken();
        if (!targetId || !postId || !["post", "comment"].includes(type || "")) {
          throw new Error("This report link is incomplete.");
        }

        if (type === "post") {
          const res = await fetch(apiUrl(`/api/posts/${targetId}`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Post unavailable");
          setTarget({
            avatar_url: data.avatar_url,
            content: data.content || "",
            id: data.id,
            isReply: false,
            title: data.title,
            userId: data.is_anonymous ? undefined : data.user_id,
            username: data.username,
          });
        } else {
          const res = await fetch(apiUrl(`/api/posts/${postId}/comments`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          const comment = Array.isArray(data)
            ? data.find((item) => String(item.id) === targetId)
            : null;
          if (!res.ok || !comment) throw new Error("Comment unavailable");
          setTarget({
            avatar_url: comment.avatar_url,
            content: comment.content,
            id: comment.id,
            isReply: Boolean(comment.parent_comment_id),
            userId: comment.is_anonymous ? undefined : comment.user_id,
            username: comment.username,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Content unavailable");
      } finally {
        setLoading(false);
      }
    };

    loadTarget();
  }, [navigate, postId, targetId, type, user?.id]);

  const goToStep = (next: number) => {
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitReport = async () => {
    if (!targetId) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          affected_party: affectedParty,
          details,
          immediate_risk: immediateRisk,
          reason,
          target_id: targetId,
          target_type: type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit report");
      setReportId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="report-loading">
        <span className="report-loading-line" />
        <p>Opening a private case file…</p>
      </main>
    );
  }

  if (!target) {
    return (
      <main className="report-loading">
        <p>{error || "This content is no longer available."}</p>
        <button onClick={() => navigate(returnPath)} type="button">
          Return to discussion
        </button>
      </main>
    );
  }

  if (reportId) {
    return (
      <main className="report-success">
        <div className="report-success-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <section className="report-success-card">
          <p className="report-eyebrow">Signal received</p>
          <h1>Your report is in safe hands.</h1>
          <p>
            The original {targetLabel} and your context have been preserved for
            review. Your report is not shown to the author.
          </p>
          <div className="report-receipt">
            <span>Case reference</span>
            <strong>#{reportId.slice(0, 8).toUpperCase()}</strong>
          </div>
          <button onClick={() => navigate(returnPath)} type="button">
            Return to the conversation <span>→</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="report-page">
      <div className="report-ambient report-ambient-one" />
      <div className="report-ambient report-ambient-two" />
      <header className="report-topbar">
        <button
          className="report-exit"
          onClick={() => navigate(returnPath)}
          type="button"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          Back to conversation
        </button>
        <div className="report-privacy-note">
          <span aria-hidden="true">●</span>
          Private by design
        </div>
      </header>

      <div className="report-layout">
        <aside className="report-dossier">
          <div className="report-dossier-tab">NUSHub</div>
          <div className="report-dossier-rule">
            <span>CONTENT RECORD</span>
            <span>{targetLabel.toUpperCase()}</span>
          </div>
          <div className="report-author">
            {target.userId ? (
              <Link
                aria-label={`View ${target.username}'s profile`}
                className="report-author-avatar"
                to={`/users/${target.userId}`}
              >
                <UserAvatar
                  avatarUrl={target.avatar_url}
                  className="h-11 w-11"
                  name={target.username}
                  userId={target.userId}
                />
              </Link>
            ) : (
              <UserAvatar
                avatarUrl={target.avatar_url}
                className="h-11 w-11"
                name={target.username}
                userId={null}
              />
            )}
            <div>
              <span>Shared by</span>
              {target.userId ? (
                <Link
                  className="report-author-name"
                  to={`/users/${target.userId}`}
                >
                  {target.username}
                </Link>
              ) : (
                <strong>{target.username}</strong>
              )}
            </div>
          </div>
          {target.title && <h2>{target.title}</h2>}
          <blockquote>{target.content || "No additional text."}</blockquote>
          <div className="report-dossier-foot">
            <span>Captured automatically</span>
            <strong>Do not edit</strong>
          </div>
        </aside>

        <section className="report-workspace">
          <div className="report-progress" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((item) => (
              <span
                className={item <= step ? "is-active" : ""}
                key={item}
              >
                <i />
              </span>
            ))}
          </div>

          <div
            className={`report-scene ${
              direction === "back" ? "is-back" : ""
            }`}
            key={step}
          >
            {step === 0 && (
              <>
                <p className="report-eyebrow">01 — Read the signal</p>
                <h1>What crossed the line?</h1>
                <p className="report-intro">
                  Choose the closest match. We’ve already attached the content,
                  author, and conversation—no links to copy.
                </p>
                <div className="report-reason-grid">
                  {REASONS.map((item) => (
                    <button
                      aria-pressed={reason === item.id}
                      className={`report-reason ${
                        reason === item.id ? "is-selected" : ""
                      }`}
                      key={item.id}
                      onClick={() => setReason(item.id)}
                      type="button"
                    >
                      <span>{item.mark}</span>
                      <strong>{item.title}</strong>
                      <small>{item.note}</small>
                      <i aria-hidden="true">↗</i>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="report-eyebrow">02 — Add the missing context</p>
                <h1>Who feels the impact?</h1>
                <p className="report-intro">
                  A little context helps separate a bad take from genuine harm.
                  Share only what is useful for reviewing this {targetLabel}.
                </p>
                <div className="report-affected-grid">
                  {AFFECTED.map((item) => (
                    <button
                      aria-pressed={affectedParty === item.id}
                      className={`report-affected ${
                        affectedParty === item.id ? "is-selected" : ""
                      }`}
                      key={item.id}
                      onClick={() => setAffectedParty(item.id)}
                      type="button"
                    >
                      <i />
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </button>
                  ))}
                </div>
                <label className="report-detail-field">
                  <span>
                    <strong>What would a reviewer miss?</strong>
                    <small>{details.length} / 1500</small>
                  </span>
                  <textarea
                    maxLength={1500}
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Add context, patterns, or details that are not obvious from the content itself…"
                    value={details}
                  />
                </label>
                <button
                  aria-pressed={immediateRisk}
                  className={`report-risk ${immediateRisk ? "is-active" : ""}`}
                  onClick={() => setImmediateRisk((value) => !value)}
                  type="button"
                >
                  <span className="report-risk-switch"><i /></span>
                  <span>
                    <strong>Someone may be in immediate danger</strong>
                    <small>
                      Mark this only for urgent threats or immediate self-harm risk.
                    </small>
                  </span>
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="report-eyebrow">03 — Seal the file</p>
                <h1>One quiet check before it goes.</h1>
                <p className="report-intro">
                  Reports are private. Submitting won’t notify the author or
                  remove the content automatically.
                </p>
                <div className="report-review">
                  <div>
                    <span>Signal</span>
                    <strong>{selectedReason?.title}</strong>
                  </div>
                  <div>
                    <span>Impact</span>
                    <strong>
                      {AFFECTED.find((item) => item.id === affectedParty)?.label}
                    </strong>
                  </div>
                  <div>
                    <span>Urgency</span>
                    <strong>{immediateRisk ? "Immediate risk" : "Standard review"}</strong>
                  </div>
                  <div>
                    <span>Context</span>
                    <strong>{details.trim() || "No extra context added"}</strong>
                  </div>
                </div>
                <div className="report-confidentiality">
                  <span aria-hidden="true">✦</span>
                  <p>
                    <strong>Your identity stays with the report.</strong>
                    It is stored for review and is not shown to the reported author.
                  </p>
                </div>
              </>
            )}
          </div>

          {error && <p className="report-error">{error}</p>}

          <footer className="report-actions">
            <button
              className="report-back"
              onClick={() => (step === 0 ? navigate(returnPath) : goToStep(step - 1))}
              type="button"
            >
              {step === 0 ? "Cancel" : "Previous"}
            </button>
            {step < 2 ? (
              <button
                className="report-next"
                disabled={
                  (step === 0 && !reason) ||
                  (step === 1 &&
                    (!affectedParty || (reason === "other" && !details.trim())))
                }
                onClick={() => goToStep(step + 1)}
                type="button"
              >
                Continue <span>→</span>
              </button>
            ) : (
              <button
                className="report-submit"
                disabled={submitting}
                onClick={submitReport}
                type="button"
              >
                {submitting ? "Sealing report…" : "Submit private report"}
                <span>↗</span>
              </button>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}
