import React, { useMemo } from 'react';
import { Project, User } from './types';

interface ProjectUserGraphProps {
  projects: Project[];
  users: User[];
}

export const ProjectUserGraph: React.FC<ProjectUserGraphProps> = ({ projects, users }) => {
  const rows = useMemo(() => {
    const userNameMap = new Map(users.map((user) => [user.id, user.name]));

    return projects
      .map((project) => {
        const uniqueUserIds = new Set<string>(project.memberIds);
        if (project.leadId) {
          uniqueUserIds.add(project.leadId);
        }

        const userCount = uniqueUserIds.size;

        return {
          projectId: project.id,
          projectName: project.name,
          userCount,
          leadName: project.leadId ? userNameMap.get(project.leadId) || 'Unassigned' : 'Unassigned',
        };
      })
      .sort((a, b) => b.userCount - a.userCount);
  }, [projects, users]);

  const maxUserCount = rows.length > 0 ? Math.max(...rows.map((row) => row.userCount), 1) : 1;
  const totalUsersInProjects = rows.reduce((sum, row) => sum + row.userCount, 0);

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-white/60 dark:bg-slate-900/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">User Distribution by Project</h3>
          <p className="text-[11px] text-slate-500">Graph view for manager-level project staffing</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Total Users Mapped</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{totalUsersInProjects}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-[var(--border-color)] rounded-lg">
          No project user data available.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const width = (row.userCount / maxUserCount) * 100;
            return (
              <div key={row.projectId}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <p className="text-[var(--text-primary)] font-medium truncate pr-2">{row.projectName}</p>
                  <p className="text-slate-500 whitespace-nowrap">{row.userCount} users</p>
                </div>
                <div className="h-2 rounded-full bg-slate-200/60 dark:bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-teal-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Lead: {row.leadName}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
