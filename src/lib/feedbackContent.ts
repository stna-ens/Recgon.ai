export interface FeedbackActionLane {
  id: 'fix' | 'build' | 'protect';
  title: string;
  items: string[];
  tone: 'danger' | 'accent' | 'success';
}

export interface FeedbackDetailGroup {
  id: 'bugs' | 'requests' | 'praise';
  title: string;
  items: string[];
}

interface FeedbackSignals {
  sentiment?: string;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  bugs: string[];
  featureRequests: string[];
  praises: string[];
  themes?: string[];
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function trimFeedbackLabel(value: string, maxLength = 68) {
  const compact = compactWhitespace(value).replace(/[.,:;!?]+$/, '');
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function capitalize(value: string) {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function buildFeedbackActionLanes(
  { bugs, featureRequests, praises }: FeedbackSignals,
  limit = 3,
): FeedbackActionLane[] {
  const lanes: FeedbackActionLane[] = [
    {
      id: 'fix',
      title: 'Fix now',
      items: bugs.slice(0, limit),
      tone: 'danger',
    },
    {
      id: 'build',
      title: 'Build next',
      items: featureRequests.slice(0, limit),
      tone: 'accent',
    },
    {
      id: 'protect',
      title: 'Protect what works',
      items: praises.slice(0, limit),
      tone: 'success',
    },
  ];

  return lanes.filter((lane) => lane.items.length > 0);
}

export function buildFeedbackDetailGroups({
  bugs,
  featureRequests,
  praises,
}: FeedbackSignals): FeedbackDetailGroup[] {
  const groups: FeedbackDetailGroup[] = [
    {
      id: 'bugs',
      title: 'Bugs',
      items: bugs,
    },
    {
      id: 'requests',
      title: 'Requests',
      items: featureRequests,
    },
    {
      id: 'praise',
      title: 'Praise',
      items: praises,
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}

export function buildFeedbackRunLabel({
  sentiment,
  bugs,
  featureRequests,
  praises,
  themes = [],
}: FeedbackSignals): string {
  const themeLabel = trimFeedbackLabel(themes[0] ?? '');
  if (themeLabel) return themeLabel;

  const firstBug = trimFeedbackLabel(bugs[0] ?? '');
  if (firstBug) return `Fix: ${firstBug}`;

  const firstRequest = trimFeedbackLabel(featureRequests[0] ?? '');
  if (firstRequest) return `Build: ${firstRequest}`;

  const firstPraise = trimFeedbackLabel(praises[0] ?? '');
  if (firstPraise) return `Protect: ${firstPraise}`;

  return sentiment ? `${capitalize(sentiment)} feedback run` : 'Feedback run';
}
