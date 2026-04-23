import React from 'react';

interface DecorativeBackgroundProps {
  variation?: string;
}

const DecorativeBackground: React.FC<DecorativeBackgroundProps> = ({ variation }) => {
  // Use variation to shift positions slightly
  const getOffset = (seed: string, offset: number) => {
    const s = seed || 'default';
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    return (Math.abs(hash + offset) % 40) - 20; // -20 to 20
  };

  const x1 = getOffset(variation || '', 100);
  const y1 = getOffset(variation || '', 200);
  const x2 = getOffset(variation || '', 300);
  const y2 = getOffset(variation || '', 400);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <style>{`
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(3%, 5%) scale(1.05); }
          66% { transform: translate(-2%, 8%) scale(0.95); }
        }
        .animate-drift {
          animation: drift 25s ease-in-out infinite;
        }
        .animate-drift-slow {
          animation: drift 35s ease-in-out infinite reverse;
        }
        .animate-drift-slower {
          animation: drift 45s ease-in-out infinite;
        }
      `}</style>

      {/* Blob 1 - Maroon Deep */}
      <div 
        className="absolute w-[800px] h-[800px] bg-brand-700/8 rounded-full blur-[140px] transition-all duration-1000 ease-in-out animate-drift"
        style={{
          top: `${-5 + y1}%`,
          left: `${-15 + x1}%`,
        }}
      />
      
      {/* Blob 2 - Gold Glow */}
      <div 
        className="absolute w-[600px] h-[600px] bg-gold-400/10 rounded-full blur-[120px] transition-all duration-1000 ease-in-out animate-drift-slow"
        style={{
          top: `${40 + y2}%`,
          right: `${10 + x2}%`,
        }}
      />

      {/* Blob 3 - Tertiary Maroon */}
      <div 
        className="absolute w-[700px] h-[700px] bg-brand-900/10 rounded-full blur-[160px] transition-all duration-1000 ease-in-out animate-drift-slower"
        style={{
          bottom: `${-10 + y1}%`,
          right: `${-10 + x2}%`,
        }}
      />

      {/* Blob 4 - Soft Stone Accent */}
      <div 
        className="absolute w-[400px] h-[400px] bg-stone-200/5 rounded-full blur-[100px] animate-drift"
        style={{
          top: `20%`,
          left: `40%`,
        }}
      />
    </div>
  );
};

export default DecorativeBackground;
