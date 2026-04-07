/**
 * Pure SVG bar chart showing weekly new subscriptions vs churned.
 *
 * Usage:
 *   <SubscriptionTimeline series={revenue.weeklySeries} />
 */

interface WeekPoint {
  weekLabel: string;
  newSubs: number;
  churned: number;
}

interface SubscriptionTimelineProps {
  series: WeekPoint[];
}

const VIEW_W = 800;
const VIEW_H = 260;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 40;

const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

const BAR_GAP = 2;
const GROUP_GAP_RATIO = 0.3; // 30% of slot width as gap between groups

export function SubscriptionTimeline({ series }: SubscriptionTimelineProps) {
  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No data available
      </div>
    );
  }

  const maxVal = Math.max(
    ...series.map((d) => Math.max(d.newSubs, d.churned)),
    1
  );

  // Round up max to a "nice" number for y-axis
  const yMax = Math.ceil(maxVal / 5) * 5 || 5;
  const yTickCount = 4;

  // Slot width per week group
  const slotW = CHART_W / series.length;
  const groupGap = slotW * GROUP_GAP_RATIO;
  const barW = Math.max(2, (slotW - groupGap - BAR_GAP) / 2);

  function barX(i: number, barIndex: 0 | 1): number {
    const groupStart = PAD_LEFT + i * slotW + groupGap / 2;
    return groupStart + barIndex * (barW + BAR_GAP);
  }

  function barY(val: number): number {
    return PAD_TOP + CHART_H - (val / yMax) * CHART_H;
  }

  function barH(val: number): number {
    return (val / yMax) * CHART_H;
  }

  // Y-axis ticks
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round((yMax * i) / yTickCount)
  );

  // Show x-axis label every 3rd week, always show last
  const showLabel = (i: number) =>
    i % 3 === 0 || i === series.length - 1;

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3" aria-hidden="true">
        <div className="flex items-center gap-1.5">
          <span className="block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <span className="text-xs text-gray-500">New</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="block h-2.5 w-2.5 rounded-sm bg-rose-400" />
          <span className="text-xs text-gray-500">Churned</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label="Subscription timeline bar chart"
        style={{ display: "block" }}
      >
        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick) => {
          const y = barY(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={VIEW_W - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#9ca3af"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* X axis baseline */}
        <line
          x1={PAD_LEFT}
          x2={VIEW_W - PAD_RIGHT}
          y1={PAD_TOP + CHART_H}
          y2={PAD_TOP + CHART_H}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {/* Bars */}
        {series.map((d, i) => {
          const x0 = barX(i, 0);
          const x1 = barX(i, 1);
          const baseY = PAD_TOP + CHART_H;

          return (
            <g key={d.weekLabel + i}>
              {/* newSubs bar */}
              {d.newSubs > 0 && (
                <rect
                  x={x0}
                  y={barY(d.newSubs)}
                  width={barW}
                  height={barH(d.newSubs)}
                  fill="#10b981"
                  rx={2}
                >
                  <title>{`${d.weekLabel}: ${d.newSubs} new`}</title>
                </rect>
              )}
              {/* churned bar */}
              {d.churned > 0 && (
                <rect
                  x={x1}
                  y={barY(d.churned)}
                  width={barW}
                  height={barH(d.churned)}
                  fill="#fb7185"
                  rx={2}
                >
                  <title>{`${d.weekLabel}: ${d.churned} churned`}</title>
                </rect>
              )}

              {/* X label */}
              {showLabel(i) && (
                <text
                  x={x0 + barW + BAR_GAP / 2}
                  y={baseY + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {d.weekLabel.length > 7
                    ? d.weekLabel.slice(0, 7)
                    : d.weekLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
