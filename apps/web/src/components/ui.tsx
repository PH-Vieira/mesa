"use client";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="fieldset p-0">
      <legend className="fieldset-legend">{label}</legend>
      {children}
    </fieldset>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input input-bordered w-full ${props.className ?? ""}`} />;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "secondary";
}) {
  const styles = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    danger: "btn-error",
    secondary: "btn-secondary",
  }[variant];
  return (
    <button {...props} className={`btn ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Sheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle" open>
      <div className="modal-box max-w-lg">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-display text-2xl font-bold">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    on_hold: "Em espera",
    in_progress: "Em jogo",
    dead: "Encerrada",
    seated: "Sentado",
    sitting_out: "Levantado",
    spectator: "Assistindo",
    suspended: "Suspenso",
    folded: "Fold",
    busted: "Quebrado",
  };
  const color: Record<string, string> = {
    on_hold: "badge-warning",
    in_progress: "badge-success",
    dead: "badge-ghost",
    folded: "badge-ghost",
    suspended: "badge-error",
    sitting_out: "badge-info",
    busted: "badge-error",
  };
  return (
    <span className={`badge badge-sm badge-soft ${color[status] ?? "badge-neutral"}`}>
      {map[status] ?? status}
    </span>
  );
}
