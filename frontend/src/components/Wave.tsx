/** Onde sonore animée décorative. */
export default function Wave({ bars = 28, height = 48, className = "" }: { bars?: number; height?: number; className?: string }) {
  return (
    <div className={`wave-anim flex items-center gap-[3px] ${className}`} style={{ height }} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const h = 30 + Math.round(70 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)));
        return <span key={i} style={{ height: `${h}%`, animationDelay: `${(i % 9) * 0.11}s` }} />;
      })}
    </div>
  );
}
