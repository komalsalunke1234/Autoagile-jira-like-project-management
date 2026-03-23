import React, { useState, useEffect } from 'react';
import { User, UserRole, Project } from './types';
import { USERS, MOCK_ORG_ID } from './mockData';
import { userAPI, projectAPI } from './api/client';
import { ProjectUserGraph } from './ProjectUserGraph';

interface ProjectManagerProps {
    currentUser: User;
    onProjectsChange?: (projects: Project[]) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ currentUser, onProjectsChange }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', description: '' });
    const [pendingMembers, setPendingMembers] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // Load users from MongoDB
                const loadedUsers = await userAPI.getAll();
                setUsers(loadedUsers);

                // Load projects from MongoDB
                const loadedProjects = await projectAPI.getAll();
                setProjects(loadedProjects);
                console.log('📁 ProjectManager loaded:', loadedProjects.length, 'projects');
            } catch (error) {
                console.error('Failed to load data:', error);
                // Fallback to mock data
                setUsers(USERS);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const refreshProjects = async () => {
        try {
            const loadedProjects = await projectAPI.getAll();
            setProjects(loadedProjects);
            if (onProjectsChange) {
                onProjectsChange(loadedProjects);
            }
        } catch (error) {
            console.error('Failed to refresh projects:', error);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const leadId = currentUser.role === UserRole.TEAM_LEAD ? currentUser.id : undefined;
            const newProj = await projectAPI.create({
                name: newProject.name,
                description: newProject.description,
                orgId: MOCK_ORG_ID
            }, leadId);

            console.log('✅ Project created:', newProj);
            await refreshProjects();
            setShowCreateModal(false);
            setNewProject({ name: '', description: '' });
        } catch (error: any) {
            console.error('Failed to create project:', error);
            alert(`Failed to create project: ${error.message}`);
        }
    };

    const handleAssignLead = async (projectId: string, leadId: string) => {
        if (!leadId) return;
        try {
            await projectAPI.update(projectId, { leadId });
            await refreshProjects();
        } catch (error: any) {
            console.error('Failed to assign lead:', error);
            alert(`Failed to assign lead: ${error.message}`);
        }
    };

    const handleAddMember = async (projectId: string, memberId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (project && !project.memberIds.includes(memberId)) {
            try {
                await projectAPI.addMember(projectId, memberId);
                await refreshProjects();
            } catch (error: any) {
                console.error('Failed to add member:', error);
                alert(`Failed to add member: ${error.message}`);
            }
        }
    };

    // Filter projects based on role
    const visibleProjects = projects.filter(p => {
        if (currentUser.role === UserRole.ADMIN) return true;
        if (currentUser.role === UserRole.MANAGER) return true;
        if (currentUser.role === UserRole.TEAM_LEAD) return p.leadId === currentUser.id;
        return p.memberIds.includes(currentUser.id);
    });

    const availableLeads = users.filter(u => u.role === UserRole.TEAM_LEAD || u.role === UserRole.MANAGER);
    const availableEmployees = users.filter(u => u.role === UserRole.ASSIGNEE);
    const activeProjectsCount = visibleProjects.filter(p => p.status === 'ACTIVE').length;
    const teamLeadAssignedCount = visibleProjects.filter(p => !!p.leadId).length;
    const totalContributors = visibleProjects.reduce((count, p) => count + p.memberIds.length, 0);
    const canViewProjectGraph = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.TEAM_LEAD;

    return (
        <div className="glass-panel p-6 rounded-2xl mb-8 border-indigo-500/20">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <div className="w-1.5 h-6 bg-teal-600 rounded-full"></div>
                        Sprint Portfolio
                    </h2>
                    <p className="text-[11px] text-slate-400 uppercase tracking-widest pl-3.5">
                        {currentUser.role === UserRole.ADMIN ? 'Organization Delivery Control' :
                            currentUser.role === UserRole.TEAM_LEAD ? 'Team Sprint Command' : 'Assigned Sprint Streams'}
                    </p>
                </div>
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_LEAD) && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-teal-700/20 flex items-center gap-2 group"
                    >
                        <span>+ CREATE SPRINT PROJECT</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="rounded-xl border border-[var(--border-color)] bg-white/60 dark:bg-slate-900/30 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Active Projects</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{activeProjectsCount}</p>
                </div>
                <div className="rounded-xl border border-[var(--border-color)] bg-white/60 dark:bg-slate-900/30 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Lead Assigned</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{teamLeadAssignedCount}</p>
                </div>
                <div className="rounded-xl border border-[var(--border-color)] bg-white/60 dark:bg-slate-900/30 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Contributors</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{totalContributors}</p>
                </div>
            </div>

            {canViewProjectGraph && (
                <div className="mb-6">
                    <ProjectUserGraph projects={visibleProjects} users={users} />
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="glass-panel p-6 rounded-xl w-96 shadow-2xl border border-[var(--border-color)]">
                        <h3 className="font-bold mb-4 text-[var(--text-primary)] text-lg">Create New Sprint Project</h3>
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <input
                                placeholder="Project Name"
                                required
                                className="input-field"
                                value={newProject.name}
                                onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                            />
                            <textarea
                                placeholder="Sprint Scope / Description"
                                className="input-field min-h-[100px]"
                                value={newProject.description}
                                onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                            />
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">CANCEL</button>
                                <button type="submit" className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-teal-700/20">CREATE</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {loading ? (
                    <div className="col-span-full py-10 text-center text-slate-500 text-sm">Loading sprint projects...</div>
                ) : visibleProjects.length === 0 ? (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
                        <p className="text-slate-500 text-sm font-mono">No sprint projects created yet.</p>
                        {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_LEAD) && (
                            <button onClick={() => setShowCreateModal(true)} className="mt-4 text-teal-500 text-xs font-bold hover:underline">
                                Create Your First Sprint Project
                            </button>
                        )}
                    </div>
                ) : (
                    visibleProjects.map(project => (
                        <div key={project.id} className="group relative bg-white/50 dark:bg-slate-900/40 hover:bg-white/80 dark:hover:bg-slate-800/60 border border-[var(--border-color)] hover:border-indigo-500/50 rounded-xl p-5 transition-all duration-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] hover:-translate-y-1">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <div className="flex justify-between items-start mb-3 relative z-10">
                                <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 text-indigo-400 group-hover:text-white group-hover:bg-indigo-600 transition-colors duration-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                                </div>
                                <span className="text-[9px] px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold uppercase tracking-wider">
                                    {project.status}
                                </span>
                            </div>

                            <h3 className="font-bold text-[var(--text-primary)] group-hover:text-indigo-500 dark:group-hover:text-white mb-2 text-lg truncate pr-2">{project.name}</h3>
                            <p className="text-xs text-slate-500 mb-6 h-10 overflow-hidden leading-relaxed line-clamp-2 group-hover:text-slate-400 transition-colors">
                                {project.description}
                            </p>

                            <div className="space-y-4 border-t border-slate-800 pt-4">
                                {/* Team Lead Section */}
                                <div>
                                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1.5 flex items-center gap-1.5">
                                        <div className="w-1 h-1 rounded-full bg-teal-500"></div> Sprint Lead
                                    </label>
                                    {currentUser.role === UserRole.ADMIN ? (
                                        <select
                                            className="w-full text-xs p-2 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:border-indigo-500 outline-none"
                                            value={project.leadId || ''}
                                            onChange={(e) => handleAssignLead(project.id, e.target.value)}
                                        >
                                            <option value="">Select Lead...</option>
                                            {availableLeads.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px]">{users.find(u => u.id === project.leadId)?.name.charAt(0)}</div>
                                            {users.find(u => u.id === project.leadId)?.name || 'Unassigned'}
                                        </div>
                                    )}
                                </div>

                                {/* Members Section */}
                                <div>
                                    <label className="text-[9px] uppercase font-bold text-slate-500 block mb-1.5 flex justify-between">
                                        <span>Sprint Team ({project.memberIds.length})</span>
                                        {currentUser.role === UserRole.TEAM_LEAD && project.leadId === currentUser.id && <span className="text-teal-500">Manage</span>}
                                    </label>
                                    <div className="flex -space-x-2 overflow-hidden mb-2 items-center h-7">
                                        {project.memberIds.length > 0 ? project.memberIds.map(mid => {
                                            const m = users.find(u => u.id === mid);
                                            return m ? (
                                                <div key={mid} title={m.name} className="w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-[8px] font-bold text-slate-300 relative hover:z-10 hover:scale-110 transition-transform cursor-help">
                                                    {m.name.charAt(0)}
                                                </div>
                                            ) : null;
                                        }) : <span className="text-[10px] text-slate-600 italic">No contributors assigned</span>}
                                    </div>

                                    {(currentUser.role === UserRole.TEAM_LEAD && project.leadId === currentUser.id) && (
                                        <div className="flex gap-2 mt-2">
                                            <select
                                                className="flex-1 text-xs p-2 bg-slate-950 border border-slate-700 rounded text-slate-300 focus:border-indigo-500 outline-none"
                                                value={pendingMembers[project.id] || ''}
                                                onChange={(e) => setPendingMembers(prev => ({ ...prev, [project.id]: e.target.value }))}
                                            >
                                                <option value="">Select employee...</option>
                                                {availableEmployees.filter(u => !project.memberIds.includes(u.id)).map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded"
                                                onClick={() => {
                                                    const selected = pendingMembers[project.id];
                                                    if (!selected) return;
                                                    handleAddMember(project.id, selected);
                                                    setPendingMembers(prev => ({ ...prev, [project.id]: '' }));
                                                }}
                                            >
                                                Add
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
