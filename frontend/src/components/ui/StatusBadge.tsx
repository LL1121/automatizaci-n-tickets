type Variant = "verified" | "pending" | "late";

const STYLES: Record<Variant, string> = {
  verified: "bg-status-verifiedBg text-status-verifiedText",
  pending: "bg-status-pendingBg text-status-pendingText",
  late: "bg-status-lateBg text-status-lateText",
};

export function StatusBadge({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
