import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface PdfAnalysis {
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];
  analyzedAt: string;
  problemStatement?: string;
  marketOpportunity?: string;
  competitors?: { name: string; url?: string; differentiator: string }[];
  competitorInsights?: {
    name: string;
    url?: string;
    summary: string;
    positioning: string;
    messagingTone: string;
    keyFeatures: string[];
    weaknesses: string[];
    differentiator: string;
  }[];
  businessModel?: string;
  revenueStreams?: string[];
  pricingSuggestion?: string;
  currentStage?: string;
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  topRisks?: string[];
  prioritizedNextSteps?: string[];
  gtmStrategy?: string;
  earlyAdopterChannels?: string[];
  growthMetrics?: string[];
  improvements?: string[];
  nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];
}

/* ─── Palette ────────────────────────────────────────────────────────────── */

const C = {
  bg:      '#09090b',
  surface: '#111113',
  border:  '#1f1f23',
  txt1:    '#f4f4f5',
  txt2:    '#a1a1aa',
  txt3:    '#52525b',
  brand:   '#e8a8c4',
  success: '#34d399',
  danger:  '#f87171',
  warning: '#fbbf24',
  blue:    '#60a5fa',
} as const;

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    paddingHorizontal: 44,
    paddingTop: 44,
    paddingBottom: 52,
    fontFamily: 'Helvetica',
    color: C.txt1,
  },

  /* Header */
  logoBox: {
    width: 22,
    height: 22,
    backgroundColor: C.brand,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: '#000',
    marginTop: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 36,
  },
  brandLabel: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: C.txt3,
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  briefLabel: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: C.txt3,
    textTransform: 'uppercase',
    marginLeft: 'auto',
  },

  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    color: C.txt1,
    lineHeight: 1.2,
    marginBottom: 12,
    letterSpacing: -0.5,
  },

  stagePill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  stagePillText: {
    fontFamily: 'Courier',
    fontSize: 7,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  metaDate: {
    fontSize: 10,
    color: C.txt3,
  },

  /* Section */
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 24,
    marginTop: 8,
  },
  sectionBlock: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: C.txt3,
    marginBottom: 10,
  },
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: C.txt1,
    marginBottom: 10,
  },

  /* Body text */
  body: {
    fontSize: 10,
    color: C.txt2,
    lineHeight: 1.7,
  },
  bodyDim: {
    fontSize: 10,
    color: C.txt3,
    lineHeight: 1.7,
  },

  /* Two-column */
  row: {
    flexDirection: 'row',
  },
  col: {
    flex: 1,
  },
  colLeft: {
    flex: 1,
    marginRight: 16,
  },

  /* Bullet list */
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    marginRight: 8,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 10,
    color: C.txt2,
    lineHeight: 1.65,
    flex: 1,
  },

  /* Numbered list */
  numBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: C.surface,
    borderWidth: 0.75,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    marginTop: 1,
  },
  numBadgeText: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    color: C.txt2,
  },

  /* Tech stack pills */
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  pill: {
    borderRadius: 5,
    borderWidth: 0.75,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  pillText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: C.txt2,
  },

  /* Card */
  card: {
    backgroundColor: C.surface,
    borderWidth: 0.75,
    borderColor: C.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },

  /* Table */
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 0.75,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tableHeaderText: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.txt3,
  },
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.75,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  tableRowLast: {
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },
  tableCellName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: C.txt1,
    width: '32%',
    lineHeight: 1.5,
  },
  tableCellValue: {
    fontSize: 10,
    color: C.txt2,
    flex: 1,
    lineHeight: 1.55,
  },

  /* SWOT */
  swotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swotCell: {
    width: '49%',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  swotCellRight: {
    marginLeft: '2%',
  },
  swotLabel: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  /* Execution progress */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 0.75,
    padding: 10,
    marginBottom: 7,
  },
  stepCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    marginTop: 1,
  },
  stepCheckText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  stepText: {
    fontSize: 10,
    lineHeight: 1.6,
    flex: 1,
  },
  stepEvidence: {
    fontSize: 9,
    color: C.txt3,
    marginTop: 3,
    lineHeight: 1.5,
  },

  /* Footer */
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.75,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  footerText: {
    fontSize: 8,
    color: C.txt3,
  },
  footerRight: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: C.txt3,
    marginLeft: 'auto',
  },
  footerLogoBox: {
    width: 14,
    height: 14,
    backgroundColor: C.brand,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  footerLogoText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: '#000',
  },
});

/* ─── Primitive helpers ─────────────────────────────────────────────────── */

function Divider() {
  return <View style={s.divider} />;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function SectionHeading({ children }: { children: string }) {
  return <Text style={s.sectionHeading}>{children}</Text>;
}

function Body({ children, dim }: { children: string; dim?: boolean }) {
  return <Text style={dim ? s.bodyDim : s.body}>{children}</Text>;
}

function BulletItem({ children, color }: { children: string; color?: string }) {
  return (
    <View style={s.bulletItem}>
      <View style={[s.bulletDot, { backgroundColor: color ?? C.txt3 }]} />
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function BulletList({ items, color }: { items: string[]; color?: string }) {
  return (
    <View>
      {items.map((item, i) => (
        <BulletItem key={i} color={color}>{item}</BulletItem>
      ))}
    </View>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' }}>
          <View style={s.numBadge}>
            <Text style={s.numBadgeText}>{i + 1}</Text>
          </View>
          <Text style={[s.bulletText, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <View style={s.pillRow}>
      {items.map((t) => (
        <View key={t} style={s.pill}>
          <Text style={s.pillText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={s.colLeft}>{left}</View>
      <View style={s.col}>{right}</View>
    </View>
  );
}

/* ─── Stage meta ─────────────────────────────────────────────────────────── */

const STAGE_COLORS: Record<string, string> = {
  idea:   C.warning,
  mvp:    C.brand,
  beta:   C.blue,
  growth: C.success,
  mature: C.txt3,
};

/* ─── Main Document ──────────────────────────────────────────────────────── */

export function ProjectPdfDocument({ analysis: a }: { analysis: PdfAnalysis }) {
  const date = new Date(a.analyzedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const stageColor = a.currentStage ? (STAGE_COLORS[a.currentStage] ?? C.txt3) : null;

  return (
    <Document
      title={`${a.name} — Product Strategy Brief`}
      author="Recgon"
      subject="Product Strategy Brief"
    >
      <Page size="A4" style={s.page}>

        {/* ── Brand row ── */}
        <View style={s.brandRow} fixed>
          <View style={s.logoBox}>
            <Text style={s.logoText}>R</Text>
          </View>
          <Text style={s.brandLabel}>Recgon</Text>
          <Text style={s.briefLabel}>Product Strategy Brief</Text>
        </View>

        {/* ── Title + Meta ── */}
        <Text style={s.title}>{a.name}</Text>
        <View style={s.metaRow}>
          <Text style={s.metaDate}>Analyzed {date}</Text>
          {stageColor && a.currentStage && (
            <View style={[s.stagePill, {
              backgroundColor: `${stageColor}18`,
              borderWidth: 0.75,
              borderColor: `${stageColor}40`,
            }]}>
              <Text style={[s.stagePillText, { color: stageColor }]}>
                {a.currentStage}
              </Text>
            </View>
          )}
        </View>

        {/* ── Product Overview ── */}
        <View style={s.sectionBlock}>
          <SectionLabel>Product Overview</SectionLabel>
          <Body>{a.description}</Body>

          <View style={{ height: 16 }} />

          <TwoCol
            left={
              <>
                <SectionLabel>Target Audience</SectionLabel>
                <Body>{a.targetAudience}</Body>
              </>
            }
            right={
              a.problemStatement ? (
                <>
                  <SectionLabel>Problem Statement</SectionLabel>
                  <Body>{a.problemStatement}</Body>
                </>
              ) : <View />
            }
          />

          {a.techStack.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <SectionLabel>Tech Stack</SectionLabel>
              <Pills items={a.techStack} />
            </View>
          )}
        </View>

        <Divider />

        {/* ── Features & USPs ── */}
        <View style={s.sectionBlock}>
          <SectionHeading>Features & Differentiators</SectionHeading>
          <TwoCol
            left={
              <>
                <SectionLabel>Key Features</SectionLabel>
                <BulletList items={a.features} />
              </>
            }
            right={
              <>
                <SectionLabel>Unique Selling Points</SectionLabel>
                <BulletList items={a.uniqueSellingPoints} color={C.brand} />
              </>
            }
          />
        </View>

        {/* ── Market Opportunity ── */}
        {a.marketOpportunity && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Market Opportunity</SectionHeading>
              <Body>{a.marketOpportunity}</Body>
            </View>
          </>
        )}

        {/* ── Competitive Landscape (table) ── */}
        {(a.competitors?.length ?? 0) > 0 && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Competitive Landscape</SectionHeading>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderText, { width: '32%' }]}>Competitor</Text>
                <Text style={[s.tableHeaderText, { flex: 1 }]}>Our Differentiator</Text>
              </View>
              {a.competitors!.map((c, i) => (
                <View
                  key={i}
                  style={[
                    s.tableRow,
                    i === a.competitors!.length - 1 ? s.tableRowLast : {},
                  ]}
                >
                  <Text style={s.tableCellName}>{c.name}</Text>
                  <Text style={s.tableCellValue}>{c.differentiator}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Competitor Intelligence (cards) ── */}
        {(a.competitorInsights?.length ?? 0) > 0 && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Competitor Intelligence</SectionHeading>
              {a.competitorInsights!.map((ci, i) => (
                <View key={i} style={s.card} wrap={false}>
                  {/* Name + tone */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.txt1 }}>
                      {ci.name}
                    </Text>
                    {ci.messagingTone && (
                      <View style={{
                        marginLeft: 8,
                        paddingHorizontal: 6, paddingVertical: 2,
                        borderRadius: 10, borderWidth: 0.75, borderColor: C.border,
                        backgroundColor: C.bg,
                      }}>
                        <Text style={{ fontFamily: 'Courier', fontSize: 7, color: C.txt3, letterSpacing: 0.5 }}>
                          {ci.messagingTone}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={s.bodyDim}>{ci.summary}</Text>

                  <View style={{ height: 10 }} />

                  <View style={s.row}>
                    <View style={s.colLeft}>
                      <SectionLabel>Positioning</SectionLabel>
                      <Body>{ci.positioning}</Body>
                    </View>
                    {ci.keyFeatures.length > 0 && (
                      <View style={s.colLeft}>
                        <SectionLabel>Key Features</SectionLabel>
                        <BulletList items={ci.keyFeatures.slice(0, 4)} />
                      </View>
                    )}
                    {ci.weaknesses.length > 0 && (
                      <View style={s.col}>
                        <SectionLabel>Weaknesses</SectionLabel>
                        <BulletList items={ci.weaknesses.slice(0, 4)} color={C.danger} />
                      </View>
                    )}
                  </View>

                  {ci.differentiator && (
                    <View style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 6,
                      backgroundColor: C.bg,
                      borderWidth: 0.75,
                      borderColor: C.border,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}>
                      <Text style={{ fontFamily: 'Courier', fontSize: 7.5, color: C.txt1, letterSpacing: 0.8, flexShrink: 0, paddingTop: 1.5 }}>
                        OUR EDGE
                      </Text>
                      <Text style={[s.body, { flex: 1 }]}>{ci.differentiator}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Business Model ── */}
        {(a.businessModel || (a.revenueStreams?.length ?? 0) > 0 || a.pricingSuggestion) && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Business Model</SectionHeading>
              {a.businessModel && (
                <View style={{ marginBottom: 14 }}>
                  <Body>{a.businessModel}</Body>
                </View>
              )}
              <TwoCol
                left={
                  (a.revenueStreams?.length ?? 0) > 0 ? (
                    <>
                      <SectionLabel>Revenue Streams</SectionLabel>
                      <BulletList items={a.revenueStreams!} color={C.success} />
                    </>
                  ) : <View />
                }
                right={
                  a.pricingSuggestion ? (
                    <>
                      <SectionLabel>Pricing Suggestion</SectionLabel>
                      <Body>{a.pricingSuggestion}</Body>
                    </>
                  ) : <View />
                }
              />
            </View>
          </>
        )}

        {/* ── SWOT ── */}
        {a.swot && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>SWOT Analysis</SectionHeading>
              <View style={s.swotGrid}>
                {([
                  ['strengths',    'Strengths',     C.success],
                  ['weaknesses',   'Weaknesses',    C.danger],
                  ['opportunities','Opportunities', C.blue],
                  ['threats',      'Threats',       C.warning],
                ] as [keyof typeof a.swot, string, string][]).map(([key, label, color], idx) => (
                  <View
                    key={key}
                    style={[
                      s.swotCell,
                      idx % 2 === 1 ? s.swotCellRight : {},
                      {
                        backgroundColor: `${color}08`,
                        borderWidth: 0.75,
                        borderColor: `${color}25`,
                        borderTopWidth: 2,
                        borderTopColor: color,
                      },
                    ]}
                    wrap={false}
                  >
                    <Text style={[s.swotLabel, { color }]}>{label}</Text>
                    <BulletList items={(a.swot![key] ?? [])} color={color} />
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Action Plan ── */}
        {((a.prioritizedNextSteps?.length ?? 0) > 0 || (a.topRisks?.length ?? 0) > 0) && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Action Plan</SectionHeading>
              <TwoCol
                left={
                  (a.prioritizedNextSteps?.length ?? 0) > 0 ? (
                    <>
                      <SectionLabel>Prioritized Next Steps</SectionLabel>
                      <NumberedList items={a.prioritizedNextSteps!} />
                    </>
                  ) : <View />
                }
                right={
                  (a.topRisks?.length ?? 0) > 0 ? (
                    <>
                      <SectionLabel>Top Risks</SectionLabel>
                      <BulletList items={a.topRisks!} color={C.danger} />
                    </>
                  ) : <View />
                }
              />
            </View>
          </>
        )}

        {/* ── GTM Strategy ── */}
        {(a.gtmStrategy || (a.earlyAdopterChannels?.length ?? 0) > 0 || (a.growthMetrics?.length ?? 0) > 0) && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Go-to-Market Strategy</SectionHeading>
              {a.gtmStrategy && (
                <View style={{ marginBottom: 14 }}>
                  <Body>{a.gtmStrategy}</Body>
                </View>
              )}
              <TwoCol
                left={
                  (a.earlyAdopterChannels?.length ?? 0) > 0 ? (
                    <>
                      <SectionLabel>Early Adopter Channels</SectionLabel>
                      <BulletList items={a.earlyAdopterChannels!} color={C.blue} />
                    </>
                  ) : <View />
                }
                right={
                  (a.growthMetrics?.length ?? 0) > 0 ? (
                    <>
                      <SectionLabel>Growth Metrics</SectionLabel>
                      <BulletList items={a.growthMetrics!} color={C.success} />
                    </>
                  ) : <View />
                }
              />
            </View>
          </>
        )}

        {/* ── Improvements ── */}
        {(a.improvements?.length ?? 0) > 0 && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Recommended Improvements</SectionHeading>
              <BulletList items={a.improvements!} color={C.warning} />
            </View>
          </>
        )}

        {/* ── Execution Progress ── */}
        {(a.nextStepsTaken?.length ?? 0) > 0 && (
          <>
            <Divider />
            <View style={s.sectionBlock}>
              <SectionHeading>Execution Progress</SectionHeading>
              {a.nextStepsTaken!.map((ns, i) => (
                <View
                  key={i}
                  style={[
                    s.stepRow,
                    {
                      backgroundColor: ns.taken ? `${C.success}08` : C.surface,
                      borderColor: ns.taken ? `${C.success}25` : C.border,
                    },
                  ]}
                  wrap={false}
                >
                  <View style={[
                    s.stepCheck,
                    {
                      backgroundColor: ns.taken ? `${C.success}20` : 'transparent',
                      borderColor: ns.taken ? C.success : C.txt3,
                    },
                  ]}>
                    {ns.taken && (
                      <Text style={[s.stepCheckText, { color: C.success }]}>✓</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.stepText, { color: ns.taken ? C.txt1 : C.txt2 }]}>
                      {ns.step}
                    </Text>
                    {ns.evidence && (
                      <Text style={s.stepEvidence}>{ns.evidence}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Footer (fixed) ── */}
        <View style={s.footer} fixed>
          <View style={s.footerLogoBox}>
            <Text style={s.footerLogoText}>R</Text>
          </View>
          <Text style={s.footerText}>Generated by Recgon</Text>
          <Text style={s.footerRight}>recgon.ai</Text>
        </View>

      </Page>
    </Document>
  );
}
