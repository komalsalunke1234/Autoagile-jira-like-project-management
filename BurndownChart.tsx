import React, { useMemo } from 'react';
import { BurndownData } from './types';

interface BurndownChartProps {
  data: BurndownData | null;
}

export const BurndownChart: React.FC<BurndownChartProps> = ({ data }) => {
  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null;

    const w = 560;
    const h = 220;
    const pad = 28;
    const maxRemaining = Math.max(1, ...data.points.map((p) => Math.max(p.idealRemaining, p.actualRemaining)));

    const x = (idx: number) => pad + (idx / Math.max(1, data.points.length - 1)) * (w - pad * 2);
    const y = (value: number) => h - pad - (value / maxRemaining) * (h - pad * 2);

    const mkPath = (values: number[]) =>
      values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');

    return {
      w,
      h,
      idealPath: mkPath(data.points.map((p) => p.idealRemaining)),
      actualPath: mkPath(data.points.map((p) => p.actualRemaining)),
      labels: data.points.map((p) => new Date(p.date).toLocaleDateString([], { month: 'short', day: 'numeric' })),
      maxRemaining,
    };
  }, [data]);

  if (!chart) {
    return (
      <div className="glass-card p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Burndown</p>
        <p className="text-xs text-slate-500 mt-2">Create or select a sprint to see burndown trend.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Burndown</p>
        <p className="text-xs text-slate-500">Total tasks: {data?.totalTasks ?? 0}</p>
      </div>
      <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="w-full h-[220px] rounded-lg bg-white/70 dark:bg-slate-900/30 border border-[var(--border-color)]">
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const yy = 220 - 28 - r * (220 - 56);
          return <line key={r} x1="28" y1={yy} x2="532" y2={yy} stroke="currentColor" className="text-slate-300 dark:text-slate-700" strokeDasharray="3 3" />;
        })}

        <path d={chart.idealPath} fill="none" stroke="#0f172a" strokeWidth="2" strokeDasharray="6 4" />
        <path d={chart.actualPath} fill="none" stroke="#f97316" strokeWidth="3" />

        {data?.points.map((p, i) => {
          const cx = 28 + (i / Math.max(1, data.points.length - 1)) * (560 - 56);
          const cy = 220 - 28 - (p.actualRemaining / chart.maxRemaining) * (220 - 56);
          return <circle key={p.date} cx={cx} cy={cy} r="3.5" fill="#f97316" />;
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-slate-900 inline-block"></span> Ideal</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-orange-500 inline-block"></span> Actual</span>
      </div>
    </div>
  );
};
