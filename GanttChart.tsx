import React, { useMemo } from 'react';
import { Task, User } from './types';

interface GanttChartProps {
    tasks: Task[];
    users: User[];
    onTaskUpdate?: (task: Task) => void;
}

const CELL_WIDTH = 40; // Pixels per hour
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 50;
const LABEL_WIDTH = 192; // w-48 in Tailwind

export const GanttChart: React.FC<GanttChartProps> = ({ tasks, users }) => {
    // 1. Calculate Time Range
    // 1. Calculate Time Range & Auto-Schedule
    const { visualTasks, minTime, maxTime, totalHours } = useMemo(() => {
        if (tasks.length === 0) return { visualTasks: [], minTime: Date.now(), maxTime: Date.now() + 86400000, totalHours: 24 };

        const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));
        const visualStartDates = new Map<string, number>();

        // Recursive function to calculate start time based on dependencies
        const getVisualStart = (taskId: string, visited: Set<string> = new Set()): number => {
            if (visited.has(taskId)) return Date.now(); // Cycle detection fallback
            if (visualStartDates.has(taskId)) return visualStartDates.get(taskId)!;

            visited.add(taskId);
            const task = taskMap.get(taskId);
            if (!task) return Date.now();

            // Default to task's own start or creation time (ensure number)
            let startTime = typeof task.startDate === 'number' ? task.startDate : (task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now());

            // If dependencies exist, start AFTER the max end time of dependencies
            if (task.dependencies && task.dependencies.length > 0) {
                let maxDependencyEnd = 0;
                task.dependencies.forEach(depId => {
                    const depTask = taskMap.get(depId);
                    if (depTask) {
                        const depStart = getVisualStart(depId, new Set(visited));
                        const depDuration = (depTask.estimatedDuration || 60) * 60000;
                        maxDependencyEnd = Math.max(maxDependencyEnd, depStart + depDuration);
                    }
                });

                if (maxDependencyEnd > 0) {
                    // Add a small buffer (e.g., 30 mins) between tasks for visual clarity
                    startTime = Math.max(startTime, maxDependencyEnd + 30 * 60000);
                }
            }

            visualStartDates.set(taskId, startTime);
            return startTime;
        };

        // Calculate all start times
        const processedTasks = tasks.map(t => {
            const vStart = getVisualStart(t.id);
            return { ...t, startDate: vStart };
        });

        const min = Math.min(...processedTasks.map(t => t.startDate));
        const max = Math.max(...processedTasks.map(t =>
            Math.max(t.deadline, t.startDate + (t.estimatedDuration || 60) * 60000)
        ));

        console.log('📊 Gantt Calc:', {
            tasksCount: tasks.length,
            minTime: new Date(min).toISOString(),
            maxTime: new Date(max).toISOString(),
            rawMin: min,
            rawMax: max
        });

        // Add buffer
        const start = min - 3600000 * 2; // -2 hours
        const end = max + 3600000 * 4; // +4 hours
        const hours = Math.ceil((end - start) / 3600000);

        return { visualTasks: processedTasks, minTime: start, maxTime: end, totalHours: hours };
    }, [tasks]);

    // 2. Generate Time Helpers
    const timeToX = (time: number) => {
        return ((time - minTime) / 3600000) * CELL_WIDTH;
    };

    const hoursArray = Array.from({ length: totalHours }, (_, i) => {
        const time = minTime + i * 3600000;
        return new Date(time);
    });

    return (
        <div className="glass-panel p-0 rounded-2xl overflow-hidden flex flex-col h-full border border-[var(--border-color)] shadow-sm">
            <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)] backdrop-blur-md">
                <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <span className="tracking-wide text-sm uppercase">Temporal Execution Matrix</span>
                </h3>
                <div className="flex gap-4 text-[10px] uppercase font-bold tracking-wider">
                    <div className="flex items-center gap-1.5 text-slate-400"><div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div> Planned</div>
                    <div className="flex items-center gap-1.5 text-slate-400"><div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div> Actual</div>
                    <div className="flex items-center gap-1.5 text-slate-400"><div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse"></div> Critical</div>
                </div>
            </div>

            <div className="flex-1 overflow-auto relative custom-scrollbar bg-[var(--bg-app)]">
                <div style={{ minWidth: `${totalHours * CELL_WIDTH + LABEL_WIDTH + 8}px` }}>
                    {/* Header */}
                    <div className="flex sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--bg-card)] backdrop-blur-xl" style={{ height: HEADER_HEIGHT }}>
                        <div className="w-48 shrink-0 border-r border-[var(--border-color)] p-2 font-bold text-[10px] uppercase tracking-wider text-slate-500 flex items-center bg-[var(--bg-card)] sticky left-0 z-30 shadow-[4px_0_10px_var(--shadow-color)]">
                            Operation Phase
                        </div>
                        {hoursArray.map((date, i) => (
                            <div key={i} className="border-r border-[var(--border-color)] text-[9px] text-slate-500 font-bold p-1 flex items-center justify-center font-mono" style={{ width: CELL_WIDTH }}>
                                {date.getHours()}:00
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="relative">
                        {/* Grid Lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                            <div className="w-48 shrink-0 border-r border-[var(--border-color)] bg-transparent"></div>
                            {hoursArray.map((_, i) => (
                                <div key={i} className="border-r border-[var(--border-color)] h-full" style={{ width: CELL_WIDTH }}></div>
                            ))}
                        </div>

                        {visualTasks.map(task => {
                            const start = task.startDate || Date.now();
                            const duration = task.estimatedDuration || 60; // minutes
                            const width = (duration / 60) * CELL_WIDTH;
                            const left = timeToX(start) + LABEL_WIDTH;
                            const assignee = users.find(u => u.id === task.assigneeId);

                            // Check if critical (simplified logic for UI)
                            const isCritical = task.priority === 'HIGH' && task.deadline - (start + duration * 60000) < 3600000 * 4;

                            return (
                                <div key={task.id} className="flex border-b border-[var(--border-color)] hover:bg-black/5 dark:hover:bg-white/5 relative group transition-colors" style={{ height: ROW_HEIGHT }}>
                                    {/* Label */}
                                    <div className="w-48 shrink-0 border-r border-[var(--border-color)] p-3 flex flex-col justify-center sticky left-0 bg-[var(--bg-card)] z-10 shadow-[4px_0_10px_var(--shadow-color)] transition-colors">
                                        <p className="text-xs font-bold text-[var(--text-primary)] truncate transition-colors">{task.title}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                                            <p className="text-[9px] text-slate-500 truncate font-mono">{assignee?.name || 'UNASSIGNED'}</p>
                                        </div>
                                    </div>

                                    {/* Bar */}
                                    <div className={`
                                        absolute top-3 h-6 rounded border cursor-pointer transition-all hover:scale-y-110 z-0 text-[9px] flex items-center px-2 font-bold text-white overflow-hidden whitespace-nowrap shadow-lg
                                        ${isCritical
                                            ? 'bg-gradient-to-r from-red-600 to-red-500 border-red-400/30 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                                            : 'bg-gradient-to-r from-indigo-600 to-indigo-500 border-indigo-400/30 shadow-[0_0_10px_rgba(99,102,241,0.3)]'}
                                    `}
                                        style={{
                                            left: `${left}px`,
                                            width: `${Math.max(width, 2)}px`,
                                        }}
                                        title={`${task.title} (${duration}m)`}
                                    >
                                        {width > 30 && <span className="drop-shadow-md">{task.title}</span>}
                                    </div>

                                    {/* Deadline Indicator */}
                                    <div className="absolute top-0 bottom-0 w-px bg-red-500/50 border-l border-red-500/50 border-dashed z-0 opacity-50 group-hover:opacity-100 transition-opacity"
                                        style={{ left: `${timeToX(task.deadline) + LABEL_WIDTH}px` }}
                                        title="Deadline"
                                    >
                                        <div className="absolute -top-1 -translate-x-1/2 text-[8px] text-red-500 font-mono">⚠️</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* SVG Overlay for Dependencies */}
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 opacity-40">
                        {visualTasks.map((task, rowIndex) => (
                            task.dependencies?.map(depId => {
                                const depTask = visualTasks.find(t => t.id === depId);
                                const depIndex = visualTasks.findIndex(t => t.id === depId);
                                if (!depTask || depIndex === -1) return null;

                                // Simple S-curve connection
                                const startX = timeToX((depTask.startDate || 0) + (depTask.estimatedDuration || 0) * 60000) + LABEL_WIDTH;
                                const startY = HEADER_HEIGHT + depIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                                const endX = timeToX(task.startDate || 0) + LABEL_WIDTH;
                                const endY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                                return (
                                    <path
                                        key={`${depId}-${task.id}`}
                                        d={`M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`}
                                        fill="none"
                                        stroke="#64748b"
                                        strokeWidth="1"
                                        markerEnd="url(#arrowhead)"
                                        strokeDasharray="4 2"
                                    />
                                );
                            })
                        ))}
                        <defs>
                            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                <polygon points="0 0, 6 2, 0 4" fill="#64748b" />
                            </marker>
                        </defs>
                    </svg>
                </div>
            </div>
        </div>
    );
};