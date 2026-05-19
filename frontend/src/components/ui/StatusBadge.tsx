type Variant = "verified" | "pending";

export function StatusBadge({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  const styles =
    variant === "verified"
      ? "bg-status-verifiedBg text-status-verifiedText"
      : "bg-status-pendingBg text-status-pendingText";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>
  );
}
