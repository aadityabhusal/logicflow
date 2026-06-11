export function AppIcon({ className = "size-8" }: { className?: string }) {
  return (
    <img
      src="/icons/icon.svg"
      alt="Logicflow"
      className={`rounded-xs ${className}`}
      draggable={false}
    />
  );
}
