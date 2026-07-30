import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon";
import { LoadingLabel } from "./LoadingState";

type ContentActionMenuProps = {
  isAuthor: boolean;
  label: string;
  onDelete?: () => Promise<void>;
  postId: string;
  targetId: string;
};

export default function ContentActionMenu({
  isAuthor,
  label,
  onDelete,
  postId,
  targetId,
}: ContentActionMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const deleteContent = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
      setConfirming(false);
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="relative ml-auto shrink-0" ref={menuRef}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`More actions for this ${label}`}
          className={`group/more relative flex h-10 w-10 items-center justify-center rounded-full border text-xl font-black leading-none shadow-sm ring-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${
            open
              ? "rotate-180 border-primary bg-primary text-white ring-primary/20"
              : "border-slate-200 bg-white text-app-muted ring-slate-900/5 hover:-translate-y-0.5 hover:rotate-90 hover:border-primary/30 hover:text-primary"
          }`}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span aria-hidden="true" className="-translate-y-px">⋮</span>
          <span className="absolute inset-1 -z-10 rounded-full bg-primary-fixed opacity-0 blur-md transition-opacity group-hover/more:opacity-100" />
        </button>

        <div
          aria-hidden={!open}
          className={`absolute bottom-12 right-0 z-30 w-48 origin-bottom-right overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-1.5 shadow-[0_20px_60px_rgba(0,39,84,0.20)] ring-1 ring-slate-900/10 backdrop-blur-xl transition-all duration-200 ${
            open
              ? "visible translate-y-0 scale-100 opacity-100"
              : "invisible translate-y-2 scale-90 opacity-0"
          }`}
          role="menu"
        >
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-app-text transition-all hover:translate-x-0.5 hover:bg-primary-fixed/60 hover:text-primary"
            onClick={() => {
              setOpen(false);
              const targetType = label === "post" ? "post" : "comment";
              const params = new URLSearchParams({
                type: targetType,
                id: targetId,
                postId,
              });
              navigate(`/report?${params}`);
            }}
            role="menuitem"
            type="button"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed text-primary">
              <Icon name="flag" className="h-4 w-4" />
            </span>
            Report
          </button>
          {isAuthor && (
            <button
              className="group/delete flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-app-danger transition-all hover:translate-x-0.5 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              role="menuitem"
              type="button"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 transition-transform group-hover/delete:-rotate-6 group-hover/delete:scale-110">
                <Icon name="trash" className="h-4 w-4" />
              </span>
              Delete {label}
            </button>
          )}
        </div>
      </div>

      {confirming && createPortal(
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-primary/25 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
        >
          <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/70 bg-white p-6 shadow-[0_30px_100px_rgba(0,39,84,0.35)]">
            <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-red-100 blur-2xl" />
            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-app-danger shadow-inner">
                <Icon name="trash" className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-xl font-black text-app-text">
                Let this {label} go?
              </h2>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                This disappears for everyone and cannot be restored.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-app-text transition hover:-translate-y-0.5 hover:bg-surface-low"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                  type="button"
                >
                  Keep it
                </button>
                <button
                  className="rounded-xl bg-app-danger px-4 py-3 text-sm font-black text-white shadow-[0_10px_25px_rgba(185,28,28,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  disabled={deleting}
                  onClick={deleteContent}
                  type="button"
                >
                  {deleting ? (
                    <LoadingLabel>Removing</LoadingLabel>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
