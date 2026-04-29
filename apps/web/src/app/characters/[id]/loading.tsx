export default function CharacterDetailLoading() {
  return (
    <div className="container" style={{ padding: '2rem' }}>
      <div
        style={{
          height: '80px',
          background:
            'linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
        }}
      />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '60px',
            background:
              'linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.75rem',
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
