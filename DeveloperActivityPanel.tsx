import React from 'react';
import { DeveloperActivity } from './types';

interface DeveloperActivityPanelProps {
  items: DeveloperActivity[];
}

export const DeveloperActivityPanel: React.FC<DeveloperActivityPanelProps> = ({ items }) => {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Developer Activity</p>
        <p className="text-xs text-slate-500">Last 7 days</p>
      </div>

      <div className="space-y-2 max-h-64 overflow-auto pr-1">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">No tracked activity yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.userId} className="rounded-lg border border-[var(--border-color)] bg-white/70 dark:bg-slate-900/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.userName}</p>
                <span className="text-xs font-semibold text-orange-600">Score {item.score.toFixed(1)}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <div><span className="block text-slate-500">Actions</span>{item.actions}</div>
                <div><span className="block text-slate-500">Done</span>{item.completedTasks}</div>
                <div><span className="block text-slate-500">Comments</span>{item.commentsAdded}</div>
                <div><span className="block text-slate-500">Status</span>{item.statusChanges}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
