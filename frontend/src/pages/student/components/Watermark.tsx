import React from "react";

export const Watermark = React.memo(function Watermark({ rollNumber }: { rollNumber?: string }) {
  if (!rollNumber) return null;
  
  return (
    <div
      className="pointer-events-none select-none overflow-hidden fixed inset-0"
      style={{ zIndex: 0, opacity: 0.04 }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: '-50%',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '60px 40px',
          transform: 'rotate(-25deg)',
        }}
      >
        {Array.from({ length: 100 }).map((_, i) => (
          <span key={i} className="text-stone-900/5 font-mono text-[10px] font-bold">
            {rollNumber}
          </span>
        ))}
      </div>
    </div>
  );
});
