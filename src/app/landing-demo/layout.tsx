export default function LandingDemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html,
        body {
          display: block !important;
          overflow: auto !important;
          min-height: 100vh;
          background: #f5f5f7 !important;
        }
      `}</style>
      {children}
    </>
  );
}
