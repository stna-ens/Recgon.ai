export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body {
          display: block !important;
          overflow: auto !important;
          min-height: 100vh;
          background: #000;
        }
      `}</style>
      {children}
    </>
  );
}
