'use client';

import type { Campaign, ContentCalendarItem, GeneratedContentEntry } from './types';
import { getPlatformKey, platformBadgeColor } from './utils';

interface Props {
  campaign: Campaign;
  generatedContents: Record<string, GeneratedContentEntry>;
  generatingContent: string | null;
  contentErrors: Record<string, string>;
  onGenerate: (item: ContentCalendarItem, itemKey: string) => void;
  onPreview: (entry: GeneratedContentEntry) => void;
}

export default function CampaignCalendar({
  campaign,
  generatedContents,
  generatingContent,
  contentErrors,
  onGenerate,
  onPreview,
}: Props) {
  const plan = campaign.plan;
  const weeks = Array.from(new Set(plan.contentCalendar.map((item) => item.week))).sort(
    (a, b) => a - b,
  );

  return (
    <div className="v2-m-tab-body v2-m-calendar">
      {weeks.map((week) => {
        const items = plan.contentCalendar.filter((item) => item.week === week);
        return (
          <div key={week} className="v2-m-week">
            <div className="v2-m-week-label">
              <span className="v2-m-week-label-text">week_{week}</span>
              <span className="v2-m-week-rule" />
            </div>
            <div className="v2-m-cal-items">
              {items.map((item, idx) => {
                const itemKey = `${campaign.id}-w${week}-${idx}`;
                const supported = getPlatformKey(item.platform);
                const generated = generatedContents[itemKey];
                const isGenerating = generatingContent === itemKey;
                const err = contentErrors[itemKey];

                return (
                  <article key={itemKey} className="glass-card is-static v2-m-cal-item">
                    <div className="v2-m-cal-row">
                      <div className="v2-m-cal-body">
                        <div className="v2-m-cal-tag-row">
                          <span
                            className="v2-m-platform-badge"
                            style={{ background: platformBadgeColor(item.platform) }}
                          >
                            {item.platform}
                          </span>
                          <span className="v2-m-tag">{item.contentType}</span>
                          <span className="v2-m-tag v2-m-tag-pink">{item.suggestedFormat}</span>
                        </div>
                        <p className="v2-m-cal-topic">{item.topic}</p>
                        <p className="v2-m-cal-angle">{item.angle}</p>
                        <p className="v2-m-cal-cta">
                          <span className="v2-m-cal-cta-label">cta:</span> {item.cta}
                        </p>
                      </div>
                      <div className="v2-m-cal-actions">
                        {generated && (
                          <button
                            type="button"
                            className="v2-m-btn-preview"
                            onClick={() => onPreview(generated)}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            preview
                          </button>
                        )}
                        {supported ? (
                          <button
                            type="button"
                            className={generated ? 'v2-m-btn-regen' : 'v2-m-btn-generate'}
                            disabled={isGenerating}
                            onClick={() => onGenerate(item, itemKey)}
                          >
                            {isGenerating ? (
                              <>
                                <span className="v2-m-spinner" aria-hidden="true" />
                                generating…
                              </>
                            ) : generated ? (
                              <>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                regenerate
                              </>
                            ) : (
                              'generate'
                            )}
                          </button>
                        ) : (
                          <span className="v2-m-cal-manual">manual</span>
                        )}
                      </div>
                    </div>
                    {err && (
                      <div className="v2-m-cal-err" role="alert">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>{err}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
