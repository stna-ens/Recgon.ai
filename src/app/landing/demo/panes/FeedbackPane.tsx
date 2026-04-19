'use client';

import FeedbackPanel from '@/components/FeedbackPanel';
import { demoFeedback } from '../mockData';

export default function FeedbackPane() {
  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>feedback center</h2>
        <p>Recgon reads what your users are really saying and turns it into something you can act on</p>
      </div>
      <FeedbackPanel
        sentiment={demoFeedback.sentiment}
        sentimentBreakdown={demoFeedback.sentimentBreakdown}
        themes={demoFeedback.themes}
        featureRequests={demoFeedback.featureRequests}
        bugs={demoFeedback.bugs}
        praises={demoFeedback.praises}
        developerPrompts={demoFeedback.developerPrompts}
      />
    </div>
  );
}
