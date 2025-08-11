export default function BackgroundMesh() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* place radial light behind everything so mesh stays visible */}
      <div className="absolute inset-0 bg-[radial-gradient(75%_55%_at_50%_0%,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.78)_45%,rgba(250,250,249,1)_100%)]" />

      {/* animated color bands */}
      <div
        className="absolute -inset-[35%] blur-[110px] opacity-70"
        style={{
          background:
            'radial-gradient(30% 40% at 15% 15%, rgba(56,189,248,0.32) 0%, rgba(56,189,248,0) 70%),\
               radial-gradient(28% 38% at 85% 10%, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0) 70%),\
               radial-gradient(26% 40% at 50% 90%, rgba(96,165,250,0.26) 0%, rgba(96,165,250,0) 70%)',
          animation: 'meshGlide 30s ease-in-out infinite',
        }}
      />

      {/* visible square grid mesh with radial fade at sides */}
      <div
        className="absolute inset-0 opacity-[0.30]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(15,23,42,0.18) 0 1px, transparent 1px 48px), repeating-linear-gradient(to bottom, rgba(15,23,42,0.18) 0 1px, transparent 1px 48px)',
          maskImage:
            'radial-gradient(closest-side at 50% 50%, black 70%, rgba(0,0,0,0.7) 88%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(closest-side at 50% 50%, black 70%, rgba(0,0,0,0.7) 88%, transparent 100%)',
        }}
      />

      {/* fine dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,0.22) 0.8px, transparent 0.8px)',
          backgroundSize: '18px 18px',
        }}
      />

      {/* soft accent shape in corner */}
      <div
        className="absolute -top-24 right-[-20%] h-[360px] w-[720px] rounded-full opacity-50 blur-3xl"
        style={{
          background: 'linear-gradient(120deg, rgba(56,189,248,0.26), rgba(99,102,241,0.26))',
          transform: 'rotate(12deg)',
        }}
      />
    </div>
  );
}


