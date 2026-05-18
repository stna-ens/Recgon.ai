'use client';

import CampaignIcon from './CampaignIcon';
import type { CampaignType } from './types';
import { CAMPAIGN_TYPES, DURATIONS } from './utils';

interface Props {
  campaignType: CampaignType | null;
  campaignGoal: string;
  websiteUrl: string;
  duration: string;
  isPlanning: boolean;
  planError: string;
  onChangeType: (t: CampaignType) => void;
  onChangeGoal: (v: string) => void;
  onChangeWebsite: (v: string) => void;
  onChangeDuration: (v: string) => void;
  onPlan: () => void;
}

export default function MarketingSetup({
  campaignType,
  campaignGoal,
  websiteUrl,
  duration,
  isPlanning,
  planError,
  onChangeType,
  onChangeGoal,
  onChangeWebsite,
  onChangeDuration,
  onPlan,
}: Props) {
  const typeConfig = CAMPAIGN_TYPES.find((t) => t.id === campaignType) ?? null;

  return (
    <section className="glass-card is-static v2-m-setup">
      <div className="v2-m-field">
        <span className="v2-m-field-label">campaign type</span>
        <div className="v2-m-type-grid">
          {CAMPAIGN_TYPES.map((t) => {
            const selected = campaignType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeType(t.id)}
                className={`v2-m-type-card ${selected ? 'is-active' : ''}`}
              >
                <div className="v2-m-type-card-icon">
                  <CampaignIcon type={t.id} size={17} />
                </div>
                <div className="v2-m-type-card-label">{t.label}</div>
                <p className="v2-m-type-card-desc">{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="v2-m-field">
        <span className="v2-m-field-label">campaign goal</span>
        <textarea
          className="v2-m-textarea"
          placeholder="e.g. Get 500 signups in the first month, reach 1000 Instagram followers, generate 50 qualified leads…"
          value={campaignGoal}
          onChange={(e) => onChangeGoal(e.target.value)}
          rows={2}
        />
      </div>

      <div className="v2-m-field">
        <span className="v2-m-field-label">
          website url <span className="v2-m-field-help">optional — crawls your site for richer AI context</span>
        </span>
        <input
          className="v2-m-input"
          type="url"
          placeholder="https://yourproduct.com"
          value={websiteUrl}
          onChange={(e) => onChangeWebsite(e.target.value)}
        />
      </div>

      <div className="v2-m-field">
        <span className="v2-m-field-label">duration</span>
        <div className="v2-m-duration-row">
          {DURATIONS.map((d) => {
            const selected = duration === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => onChangeDuration(d.value)}
                className={`v2-m-duration-pill ${selected ? 'is-active' : ''}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {planError && (
        <div className="v2-m-error-inline" role="alert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>! {planError}</span>
        </div>
      )}

      <button
        type="button"
        className="v2-m-plan-btn"
        onClick={onPlan}
        disabled={isPlanning || !campaignType}
      >
        {isPlanning ? (
          <>
            <span className="v2-m-spinner is-lg" aria-hidden="true" />
            planning campaign…
          </>
        ) : (
          <>
            {campaignType && <CampaignIcon type={campaignType} size={14} color="currentColor" />}
            {typeConfig ? `plan ${typeConfig.label.toLowerCase()} campaign` : 'select a campaign type'}
          </>
        )}
      </button>
    </section>
  );
}
