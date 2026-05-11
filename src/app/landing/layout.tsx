export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        body {
          display: block !important;
          overflow: auto !important;
          height: auto !important;
          min-height: 100vh;
        }
      `}</style>
      {children}
    </>
  );
}
