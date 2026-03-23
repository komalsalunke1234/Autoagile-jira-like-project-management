import React, { useState } from 'react';
import { Project, Sprint } from './types';
import { sprintAPI } from './api/client';

interface SprintManagerProps {
  projects: Project[];
  sprints: Sprint[];
  selectedSprintId: string | null;
  onSelectSprint: (id: string) => void;
  onSprintCreated: (sprint: Sprint) => void;
}

export const SprintManager: React.FC<SprintManagerProps> = ({
  projects,
  sprints,
  selectedSprintId,
  onSelectSprint,
  onSprintCreated,
}) => {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const createSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;

    setLoading(true);
    try {
      const created = await sprintAPI.create({
        name,
        goal,
        projectId: projectId || undefined,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        status: 'PLANNED',
      });
      onSprintCreated(created);
      onSelectSprint(created.id);
      setName('');
      setGoal('');
      setProjectId('');
      setStartDate('');
      setEndDate('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-5 rounded-2xl mb-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-3">Sprint Management</h3>
          <form onSubmit={createSprint} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input-field" placeholder="Sprint Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <select className="input-field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <input className="input-field md:col-span-2" placeholder="Sprint Goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
            <input className="input-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            <input className="input-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            <button className="btn-primary rounded-lg py-2 text-sm font-semibold md:col-span-2" disabled={loading}>
              {loading ? 'Creating...' : 'Create Sprint'}
            </button>
          </form>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-3">Active Sprints</h3>
          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {sprints.length === 0 ? (
              <p className="text-xs text-slate-500">No sprints yet.</p>
            ) : (
              sprints.map((sprint) => (
                <button
                  key={sprint.id}
                  type="button"
                  onClick={() => onSelectSprint(sprint.id)}
                  className={`w-full text-left rounded-lg border p-3 transition ${selectedSprintId === sprint.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-[var(--border-color)] bg-white/70 dark:bg-slate-900/30'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{sprint.name}</p>
                    <span className="text-[10px] uppercase text-slate-500">{sprint.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}</p>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
