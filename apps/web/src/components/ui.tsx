"use client";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.16em] text-gold-soft/70">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-base text-gold-soft outline-none placeholder:text-white/25 focus:border-gold/60 ${props.className ?? ""}`}
    />
  );
}

export function Button({
  children,
  variant = "gold",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "ghost" | "danger" | "felt";
}) {
  const styles = {
    gold: "bg-gold text-felt-deep shadow-[0_4px_0_#a67c2d] active:translate-y-0.5 active:shadow-none",
    ghost: "bg-white/5 text-gold-soft border border-white/10",
    danger: "bg-[#c23b3b] text-white shadow-[0_4px_0_#7a1f1f] active:translate-y-0.5 active:shadow-none",
    felt: "bg-felt-rim text-gold-soft border border-white/10",
  }[variant];
  return (
    <button
      {...props}
      className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold tracking-wide disabled:opacity-40 ${styles} ${className}`}
    >
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
    <div className="fixed inset-0 z-40 flex items-end bg-black/55 p-3 safe-bottom" onClick={onClose}>
      <div
        className="w-full rounded-[28px] border border-white/10 bg-felt-deep p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl text-gold-soft">{title}</h3>
          <button className="text-sm text-white/50" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
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
    on_hold: "bg-amber-400/15 text-amber-200",
    in_progress: "bg-emerald-400/15 text-emerald-200",
    dead: "bg-white/10 text-white/50",
    folded: "bg-white/10 text-white/45",
    suspended: "bg-red-400/15 text-red-200",
    sitting_out: "bg-sky-400/15 text-sky-200",
    busted: "bg-red-400/20 text-red-200",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${color[status] ?? "bg-white/10 text-white/70"}`}>
      {map[status] ?? status}
    </span>
  );
}
