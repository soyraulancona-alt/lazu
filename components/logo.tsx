export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-extrabold tracking-tight ${className}`}>
      LAZU<span className="text-orange">.</span>
    </span>
  );
}
