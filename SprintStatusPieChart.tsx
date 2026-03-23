import React, { useMemo } from 'react';
import { Sprint } from './types';

interface SprintStatusPieChartProps {
  sprints: Sprint[];
}

const STATUS_META = {
  PLANNED: { label: 'Planned', color: '#6366f1' },
  ACTIVE: { label: 'Active', color: '#f97316' },
  COMPLETED: { label: 'Completed', color: '#10b981' },
} as const;

export const SprintStatusPieChart: React.FC<SprintStatusPieChartProps> = ({ sprints }) => {
  const chartData = useMemo(() => {
    const counts = {
      PLANNED: 0,
      ACTIVE: 0,
      COMPLETED: 0,
    };

    for (const sprint of sprints) {
      if (sprint.status in counts) {
        counts[sprint.status as keyof typeof counts] += 1;
      }
    }

    const total = counts.PLANNED + counts.ACTIVE + counts.COMPLETED;

    const segments = (Object.keys(counts) as Array<keyof typeof counts>).map((status) => ({
      status,
      label: STATUS_META[status].label,
      color: STATUS_META[status].color,
      value: counts[status],
      percent: total > 0 ? Math.round((counts[status] / total) * 100) : 0,
    }));

    return { total, segments };
  }, [sprints]);

  const radius = 68;
  const center = 90;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Sprint Status Distribution</p>
        <p className="text-xs text-slate-500">Total sprints: {chartData.total}</p>
      </div>

      {chartData.total === 0 ? (
        <p className="text-xs text-slate-500 mt-2">Create sprints to view status distribution.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="22" />
            {chartData.segments.map((segment) => {
              const segmentLength = (segment.percent / 100) * circumference;
              const dashArray = `${segmentLength} ${circumference - segmentLength}`;
              const dashOffset = -((cumulativePercent / 100) * circumference);
              cumulativePercent += segment.percent;

              return (
                <circle
                  key={segment.status}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="22"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                  strokeLinecap="butt"
                />
              );
            })}
            <circle cx={center} cy={center} r={42} fill="var(--card-bg, rgba(255,255,255,0.8))" />
            <text x={center} y={center - 2} textAnchor="middle" className="fill-current text-[18px] font-bold text-[var(--text-primary)]">
              {chartData.total}
            </text>
            <text x={center} y={center + 14} textAnchor="middle" className="fill-current text-[10px] text-slate-500 uppercase tracking-wide">
              Sprints
            </text>
          </svg>

          <div className="space-y-2 w-full">
            {chartData.segments.map((segment) => (
              <div key={segment.status} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                  <span className="text-[var(--text-primary)]">{segment.label}</span>
                </div>
                <span className="text-slate-500">{segment.value} ({segment.percent}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
