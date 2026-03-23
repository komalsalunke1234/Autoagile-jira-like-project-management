
import React, { useState, useEffect, useMemo } from 'react';
import {
  Task, TaskStatus, User, DecisionLog, ActionType, UserRole, Project, Sprint, BurndownData, DeveloperActivity
} from './types';
import {
  INITIAL_TASKS, USERS, DEPARTMENTS, TEAMS
} from './mockData';
import { runMonitoringCycle } from './agentService';
import { Icons, ALL_SKILLS } from './constants';
import { Auth } from './Auth';
import { ProjectManager } from './ProjectManager';
import { initMemories } from './vectorStore';
import { autoAssignTask, getSkillMatchPercentage } from './assignmentService';
import { SkillManager } from './SkillManager';
import { GanttChart } from './GanttChart';
import { userAPI, taskAPI, projectAPI, sprintAPI, analyticsAPI } from './api/client';
import { SprintManager } from './SprintManager';
import { BurndownChart } from './BurndownChart';
import { DeveloperActivityPanel } from './DeveloperActivityPanel';
import { SprintStatusPieChart } from './SprintStatusPieChart';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<'LIST' | 'BOARD' | 'GANTT'>('BOARD');
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DecisionLog[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastRun, setLastRun] = useState<number>(Date.now());
  const [showSkillManager, setShowSkillManager] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [burndown, setBurndown] = useState<BurndownData | null>(null);
  const [activity, setActivity] = useState<DeveloperActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [aiPriorityHint, setAiPriorityHint] = useState<string>('');

  const [darkMode, setDarkMode] = useState(false);

  const roleLabel = (role: UserRole) => {
    const normalizedRole = String(role);
    if (role === UserRole.ADMIN) return 'Admin';
    if (normalizedRole === 'MANAGER') return 'Project Manager';
    if (role === UserRole.TEAM_LEAD) return 'Team Lead';
    return 'Team Member';
  };

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('AEIP_CURRENT_USER', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('AEIP_CURRENT_USER');
  };

  // Load data from MongoDB API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Restore session from localStorage
        const savedUser = localStorage.getItem('AEIP_CURRENT_USER');
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }

        // Load users from MongoDB
        const loadedUsers = await userAPI.getAll();
        setUsers(loadedUsers);
        console.log('👥 Loaded users from MongoDB:', loadedUsers.length, 'users');

        // Load tasks from MongoDB
        const loadedTasks = await taskAPI.getAll();
        setTasks(loadedTasks);
        console.log('📋 Loaded tasks from MongoDB:', loadedTasks.length, 'tasks');

        // Load projects from MongoDB
        const loadedProjects = await projectAPI.getAll();
        setProjects(loadedProjects);
        console.log('📁 Loaded projects from MongoDB:', loadedProjects.length, 'projects');

        const loadedSprints = await sprintAPI.getAll();
        setSprints(loadedSprints);
        if (loadedSprints.length > 0) {
          setSelectedSprintId(loadedSprints[0].id);
        }

        const loadedActivity = await analyticsAPI.getDeveloperActivity(7);
        setActivity(loadedActivity);

      } catch (error) {
        console.error('Failed to load data from MongoDB:', error);
        console.log('⚠️ Using fallback mock data');
        // Fallback to mock data if API fails
        setUsers(USERS);
        setTasks(INITIAL_TASKS);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Initialize RAG Service with mock data
    initMemories();
  }, []);

  // Autonomous loop simulator
  const isMonitoringRef = React.useRef(false);
  const tasksRef = React.useRef<Task[]>([]);
  const usersRef = React.useRef<User[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      if (isMonitoringRef.current) {
        console.log('⏳ Skipping monitoring cycle - previous cycle still active');
        return;
      }

      try {
        isMonitoringRef.current = true;
        setIsMonitoring(true);

        await runMonitoringCycle(
          tasksRef.current,
          usersRef.current,
          (log) => setLogs(prev => [log, ...prev]),
          (updatedTasks) => {
            setTasks(updatedTasks);
            localStorage.setItem('AEIP_TASKS', JSON.stringify(updatedTasks));
          }
        );

        setLastRun(Date.now());
      } catch (err) {
        console.error("Monitoring cycle error:", err);
      } finally {
        setIsMonitoring(false);
        isMonitoringRef.current = false;
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const loadBurndown = async () => {
      if (!selectedSprintId) {
        setBurndown(null);
        return;
      }
      try {
        const data = await sprintAPI.burndown(selectedSprintId);
        setBurndown(data);
      } catch {
        setBurndown(null);
      }
    };

    loadBurndown();
  }, [selectedSprintId, tasks]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const loadedActivity = await analyticsAPI.getDeveloperActivity(7);
        setActivity(loadedActivity);
      } catch {
        // Ignore transient refresh errors
      }
    }, 60000);

    return () => clearInterval(id);
  }, []);

  // Filter tasks based on role
  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];
    switch (currentUser.role) {
      case UserRole.ADMIN:
        return tasks;
      case UserRole.MANAGER:
      case UserRole.PROJECT_MANAGER:
      case UserRole.TEAM_LEAD:
        // Show tasks for team or if lead is explicitly assigned
        return tasks.filter(t => t.teamId === currentUser.teamId);
      case UserRole.ASSIGNEE:
      case UserRole.TEAM_MEMBER:
        // Show tasks assigned to user OR belonging to projects user is a member of
        const userProjectIds = projects
          .filter(p => p.memberIds.includes(currentUser.id))
          .map(p => p.id);

        return tasks.filter(t =>
          t.assigneeId === currentUser.id ||
          (t.projectId && userProjectIds.includes(t.projectId))
        );
      default:
        return [];
    }
  }, [tasks, currentUser, projects]);

  const selectedTask = useMemo(() =>
    tasks.find(t => t.id === selectedTaskId),
    [tasks, selectedTaskId]
  );

  const selectedLogs = useMemo(() =>
    logs.filter(l => l.taskId === selectedTaskId),
    [logs, selectedTaskId]
  );

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.COMPLETED: return 'bg-green-100 text-green-700';
      case TaskStatus.AT_RISK: return 'bg-yellow-100 text-yellow-700';
      case TaskStatus.OVERDUE: return 'bg-red-100 text-red-700';
      case TaskStatus.ESCALATED: return 'bg-black text-white';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  const getActionIcon = (action: ActionType) => {
    switch (action) {
      case ActionType.REMIND: return '🔔';
      case ActionType.RISK_ALERT: return '⚠️';
      case ActionType.ESCALATE: return '⬆️';
      case ActionType.CRITICAL_ESCALATE: return '🚨';
      default: return '✅';
    }
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentUser) return;
    const formData = new FormData(e.currentTarget);

    // Get selected skills from form
    const skillsSelect = e.currentTarget.querySelector('select[name="requiredSkills"]') as HTMLSelectElement;
    const selectedSkills = skillsSelect ? Array.from(skillsSelect.selectedOptions).map(opt => opt.value) : [];

    // Get assignee from dropdown (optional - backend will auto-assign if not provided)
    const manualAssigneeId = formData.get('assigneeId') as string;

    try {
      // Prepare task data
      const taskData = {
        title: formData.get('title') as string,
        description: (formData.get('description') as string) || 'Task created via workflow delegation',
        priority: formData.get('priority') as string,
        deadline: Date.now() + parseInt(formData.get('deadline') as string) * 60 * 1000,
        teamId: currentUser.teamId,
        deptId: currentUser.deptId,
        orgId: 'ORG-001',
        projectId: formData.get('projectId') as string || undefined,
        sprintId: formData.get('sprintId') as string || undefined,
        requiredSkills: selectedSkills.length > 0 ? selectedSkills : undefined,
        assigneeId: manualAssigneeId || undefined // Let backend auto-assign if empty
      };

      console.log('📤 Creating task with data:', taskData);

      // Create task via MongoDB API (backend handles auto-assignment)
      const newTask = await taskAPI.create(taskData);

      console.log('✅ Task created:', newTask);

      // Add to local state
      setTasks([newTask, ...tasks]);
      // Reset form safely
      const form = e.currentTarget;
      if (form) form.reset();
    } catch (error: any) {
      console.error('Failed to create task:', error);
      alert(`Failed to create task: ${error.message}`);
    }
  };

  const handleSuggestPriority = async (form: HTMLFormElement) => {
    try {
      const fd = new FormData(form);
      const skillsSelect = form.querySelector('select[name="requiredSkills"]') as HTMLSelectElement;
      const selectedSkills = skillsSelect ? Array.from(skillsSelect.selectedOptions).map(opt => opt.value) : [];
      const deadlineMinutes = parseInt((fd.get('deadline') as string) || '60', 10);

      const suggestion = await taskAPI.suggestPriority({
        title: (fd.get('title') as string) || 'Untitled task',
        description: (fd.get('description') as string) || '',
        deadline: Date.now() + deadlineMinutes * 60 * 1000,
        requiredSkills: selectedSkills,
      });

      const prioritySelect = form.querySelector('select[name="priority"]') as HTMLSelectElement;
      if (prioritySelect && suggestion?.priority) {
        prioritySelect.value = suggestion.priority;
      }

      setAiPriorityHint(`AI Priority: ${suggestion.priority} (${Math.round((suggestion.confidence || 0) * 100)}%) - ${suggestion.reason}`);
    } catch (error: any) {
      setAiPriorityHint(`AI priority failed: ${error.message}`);
    }
  };

  const handleSprintCreated = (sprint: Sprint) => {
    setSprints(prev => [sprint, ...prev]);
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      console.log(`📝 Completing task ${taskId} automatically...`);

      // Complete task via API (no args - let backend auto-calculate)
      const completedTask = await taskAPI.complete(taskId);

      console.log('✅ Task completed:', completedTask);

      // Update local state
      setTasks(prev => prev.map(t => t.id === taskId ? completedTask : t));

      alert(`Task completed automatically!\n\nUse: Time spent has been calculated based on assignment duration.`);
    } catch (error: any) {
      console.error('Failed to complete task:', error);
      alert(`Failed to complete task: ${error.message}`);
    }
  };

  const handleUpdateSkills = (updatedUser: User) => {
    setCurrentUser(updatedUser);
  };

  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const updated = await taskAPI.updateStatus(taskId, status);
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    } catch (error: any) {
      alert(`Failed to update status: ${error.message}`);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !currentUser || !newComment.trim()) return;
    try {
      const updated = await taskAPI.addComment(selectedTask.id, {
        userId: currentUser.id,
        userName: currentUser.name,
        text: newComment.trim()
      });
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? updated : t));
      setNewComment('');
    } catch (error: any) {
      alert(`Failed to add comment: ${error.message}`);
    }
  };

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  const userDept = DEPARTMENTS.find(d => d.id === currentUser.deptId);
  const canManage = currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.PROJECT_MANAGER || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.TEAM_LEAD;
  const canUpdateTask = (task: Task) => canManage || task.assigneeId === currentUser.id;
  const visibleTeamMembers = users.filter(u =>
    currentUser.role === UserRole.ADMIN ||
    u.teamId === currentUser.teamId ||
    u.id === currentUser.id
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen font-sans selection:bg-indigo-500/30 transition-colors duration-300">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-72 glass-panel border-r-0 border-r border-[var(--border-color)] p-6 shrink-0 flex flex-col relative overflow-hidden rounded-none">
        {/* Decorative Glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-50"></div>
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>

        <div className="flex items-center gap-4 mb-10 relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30 border border-white/10">
            <span className="text-xl">AE</span>
          </div>
          <div>
            <h1 className="text-xl font-bold leading-none tracking-tight text-[var(--text-primary)]">AEIP</h1>
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Enterprise Intelligence</span>
          </div>
        </div>

        <nav className="space-y-2 flex-1 relative z-10">
          <div className="nav-item bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Icons.Dashboard />
            <span className="font-medium">Overview</span>
          </div>
          <div className="nav-item group">
            <Icons.Task />
            <span className="group-hover:translate-x-1 transition-transform">{currentUser.role === UserRole.ASSIGNEE ? 'My Workflows' : 'Team Execution'}</span>
            {filteredTasks.some(t => t.priority === 'HIGH') && (
              <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse box-shadow-red"></span>
            )}
          </div>
          <div className="nav-item group">
            <Icons.Alert />
            <span className="group-hover:translate-x-1 transition-transform">Risk Center</span>
          </div>

          {/* User Skills Section */}
          <div className="mt-8 pt-6 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Skills</p>
              <button
                onClick={() => setShowSkillManager(true)}
                className="text-[10px] text-indigo-500 hover:text-indigo-400 font-bold uppercase tracking-wide hover:underline transition-all"
              >
                Manage
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {currentUser.skills && currentUser.skills.length > 0 ? (
                currentUser.skills.slice(0, 8).map(skill => (
                  <span key={skill} className="text-[9px] px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded border border-[var(--border-color)] transition-colors">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-slate-500 italic">No skills registered</span>
              )}
            </div>
          </div>
        </nav>

        <div className="mt-auto pt-6 border-t border-[var(--border-color)] relative z-10">
          <div className="flex items-center gap-3 mb-6 p-3 bg-white/50 dark:bg-slate-800/40 rounded-xl border border-[var(--border-color)] backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-slate-700 dark:text-white font-bold border border-[var(--border-color)] shadow-inner">
              {currentUser.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-[var(--text-primary)]">{currentUser.name}</p>
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{roleLabel(currentUser.role)}</p>
            </div>
          </div>

          <div className="text-[10px] uppercase text-slate-500 mb-2 font-bold tracking-widest flex justify-between items-center">
            <span>System Status</span>
            <span className="text-emerald-500">98% UP</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] mb-1">
            <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.6)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'}`}></div>
            <span className="text-slate-500 dark:text-slate-400 font-mono">{isMonitoring ? 'PROCESSING_AGENTS...' : 'OPERATIONAL'}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Cycle ID: {lastRun.toString().slice(-8)}</div>

          <button
            onClick={handleLogout}
            className="w-full mt-6 py-2.5 border border-[var(--border-color)] rounded-lg text-xs font-bold text-slate-500 hover:bg-red-500/10 hover:text-red-500 transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            <span>Terminate Session</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-10 overflow-y-auto relative z-0">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
              <span>{userDept?.name || 'GLOBAL_ADMIN'}</span>
              <span className="text-slate-400">///</span>
              <span>{TEAMS.find(t => t.id === currentUser.teamId)?.name || 'GENERAL_OPS'}</span>
            </div>
            <h2 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-2">Operational Intelligence Console</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Welcome, {currentUser.name}. Monitoring <span className="text-[var(--text-primary)] font-bold">{filteredTasks.length}</span> active execution threads.</p>
          </div>

          <div className="flex gap-3">
            {/* Theme Toggle */}
            <div className="bg-white/50 dark:bg-slate-900/80 p-1.5 rounded-xl border border-[var(--border-color)] flex items-center backdrop-blur-md">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-lg transition-all ${darkMode ? 'text-slate-400 hover:text-white' : 'text-amber-500 bg-amber-100'}`}
                title={darkMode ? "Switch into Light Mode" : "Switch into Dark Mode"}
              >
                {darkMode ? '🌙' : '☀️'}
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="bg-white/50 dark:bg-slate-900/80 p-1.5 rounded-xl border border-[var(--border-color)] flex items-center backdrop-blur-md">
              <button
                onClick={() => setViewMode('BOARD')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === 'BOARD' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <span>🧩</span>
                  <span>BOARD</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === 'LIST' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <Icons.Task />
                  <span>LIST_VIEW</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('GANTT')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${viewMode === 'GANTT' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <span>📊</span>
                  <span>GANTT.VISUAL</span>
                </div>
              </button>
            </div>

            <div className="bg-white/50 dark:bg-slate-900/80 px-4 py-2 rounded-xl border border-[var(--border-color)] flex items-center gap-4 backdrop-blur-md">
              <div className="text-right">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Reliability Score</p>
                <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{(currentUser.reliabilityScore * 10).toFixed(1)}<span className="text-slate-400 text-sm">/10</span></p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border-2 ${currentUser.reliabilityScore >= 0.9 ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : 'border-amber-500 text-amber-500 bg-amber-500/10'}`}>
                {currentUser.reliabilityScore >= 0.9 ? 'S' : currentUser.reliabilityScore >= 0.7 ? 'A' : 'B'}
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <div className="glass-card p-4">
            <p className="text-xs uppercase text-slate-500 tracking-wider">Active Projects</p>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">{projects.filter(p => p.status === 'ACTIVE').length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase text-slate-500 tracking-wider">Open Tasks</p>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">{filteredTasks.filter(t => t.status !== TaskStatus.COMPLETED).length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase text-slate-500 tracking-wider">At Risk</p>
            <p className="text-2xl font-semibold text-red-600">{filteredTasks.filter(t => t.status === TaskStatus.AT_RISK || t.status === TaskStatus.OVERDUE).length}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs uppercase text-slate-500 tracking-wider">Sprint Progress</p>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">
              {filteredTasks.length === 0 ? '0%' : `${Math.round((filteredTasks.filter(t => t.status === TaskStatus.COMPLETED).length / filteredTasks.length) * 100)}%`}
            </p>
          </div>
        </section>

        <ProjectManager
          currentUser={currentUser}
          onProjectsChange={(updatedProjects) => setProjects(updatedProjects)}
        />

        <SprintManager
          projects={projects}
          sprints={sprints}
          selectedSprintId={selectedSprintId}
          onSelectSprint={setSelectedSprintId}
          onSprintCreated={handleSprintCreated}
        />

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-8">
          <BurndownChart data={burndown} />
          <DeveloperActivityPanel items={activity} />
          <SprintStatusPieChart sprints={sprints} />
        </section>

        <section className="glass-panel p-5 rounded-2xl mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-primary)]">Team Management</h3>
            <span className="text-xs text-slate-500">Members: {visibleTeamMembers.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {visibleTeamMembers.map(member => {
              const memberTasks = tasks.filter(t => t.assigneeId === member.id && t.status !== TaskStatus.COMPLETED);
              const workload = memberTasks.length;
              return (
                <div key={member.id} className="glass-card p-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{member.name}</p>
                  <p className="text-[11px] text-slate-500">{roleLabel(member.role)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Open tasks</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${workload >= 6 ? 'bg-red-100 text-red-700' : workload >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {workload}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Column: Actions & Tasks */}
          <div className="xl:col-span-2 space-y-8">

            {/* Context-Aware Action Panel */}
            {canManage ? (
              <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Icons.Brain />
                </div>
                <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-3 uppercase tracking-widest border-b border-white/5 pb-4">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></span>
                  Command Center <span className="text-slate-600">//</span> Delegate New Workflow
                </h3>
                <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">Objective / Task Context</label>
                    <input
                      name="title"
                      required
                      className="input-field"
                      placeholder="e.g. Critical Bug Fix: Payment Gateway Integration"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">Task Description</label>
                    <input
                      name="description"
                      className="input-field"
                      placeholder="Describe scope, acceptance, and risk context"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">Urgency Level</label>
                    <select name="priority" className="input-field cursor-pointer">
                      <option value="LOW">Low Latency</option>
                      <option value="MEDIUM">Standard Optimization</option>
                      <option value="HIGH">CRITICAL PATH (Immediate)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">TTL (Minutes)</label>
                    <input name="deadline" type="number" defaultValue="10" className="input-field font-mono" />
                  </div>

                  <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">
                      Project Linkage
                    </label>
                    <select
                      name="projectId"
                      className="input-field cursor-pointer"
                    >
                      <option value="">No Project (General Directive)</option>
                      {projects.filter(p =>
                        currentUser.role === UserRole.ADMIN ||
                        p.leadId === currentUser.id ||
                        p.memberIds.includes(currentUser.id)
                      ).map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name} {project.leadId === currentUser.id ? '(Owner)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">Sprint Linkage</label>
                    <select name="sprintId" className="input-field cursor-pointer">
                      <option value="">No sprint</option>
                      {sprints.map(sprint => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name} ({new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider ml-1">
                      Required Capabilities (Auto-Match)
                    </label>
                    <select
                      name="requiredSkills"
                      multiple
                      className="input-field min-h-[80px]"
                    >
                      {ALL_SKILLS.slice(0, 15).map(skill => (
                        <option key={skill} value={skill}>{skill}</option>
                      ))}
                    </select>
                    <p className="text-[9px] text-slate-500 font-mono pl-1">
                      &gt; Selecting skills triggers heuristic matching algorithm against employee registry.
                    </p>
                  </div>

                  <div className="md:col-span-4 flex gap-4 pt-2">
                    <button
                      type="button"
                      onClick={(e) => handleSuggestPriority((e.currentTarget.form as HTMLFormElement))}
                      className="px-4 py-3 rounded-lg border border-blue-300/40 text-blue-600 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition"
                    >
                      Suggest Priority (AI)
                    </button>
                    <div className="flex-1 relative">
                      <select name="assigneeId" className="input-field appearance-none">
                        <option value="">[AUTO] AI Agentic Assignment</option>
                        {users.filter(u =>
                            (u.deptId === currentUser.deptId || currentUser.role === UserRole.ADMIN) &&
                            u.role === UserRole.ASSIGNEE &&
                          u.role !== UserRole.ADMIN
                        ).map(u => (
                          <option key={u.id} value={u.id}>{u.name} [{u.role}] - Rel: {(u.reliabilityScore * 10).toFixed(1)}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-3.5 pointer-events-none text-slate-500 text-xs">▼</div>
                    </div>
                    <button type="submit" className="btn-primary glass-button px-8 flex items-center gap-2 group">
                      <span>INITIALIZE</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>
                  {aiPriorityHint && (
                    <p className="md:col-span-4 text-xs text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-500/20 rounded-lg px-3 py-2">
                      {aiPriorityHint}
                    </p>
                  )}
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Workflow Load</p>
                  <div className="flex items-end gap-2 mt-2">
                    <p className="text-3xl font-bold text-white leading-none">{filteredTasks.length}</p>
                    <span className="text-xs text-slate-400 mb-1">active threads</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[45%]"></div>
                  </div>
                  <p className="text-[10px] text-emerald-400 font-mono mt-2">CAPACITY_OPTIMAL</p>
                </div>
                <div className="glass-panel p-6 rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pending Alerts</p>
                  <div className="flex items-end gap-2 mt-2">
                    <p className="text-3xl font-bold text-white leading-none">{filteredTasks.filter(t => t.lastAction === ActionType.REMIND).length}</p>
                    <span className="text-xs text-slate-400 mb-1">signals</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full w-[10%]"></div>
                  </div>
                  <p className="text-[10px] text-indigo-400 font-mono mt-2">SYSTEM_STABLE</p>
                </div>
                <div className="glass-panel p-6 rounded-2xl bg-indigo-900/10 border-indigo-500/20">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Recovery Confidence</p>
                  <div className="flex items-end gap-2 mt-2">
                    <p className="text-3xl font-bold text-indigo-300 leading-none">94.2%</p>
                  </div>
                  <div className="w-full bg-slate-800 h-1 mt-4 rounded-full overflow-hidden">
                    <div className="bg-indigo-400 h-full w-[94%]"></div>
                  </div>
                  <p className="text-[10px] text-indigo-400/70 font-mono mt-2">PREDICTIVE_MODEL_V2</p>
                </div>
              </div>
            )}

            {/* Main Task Feed */}
            {viewMode === 'BOARD' ? (
              <div className="glass-panel p-6 rounded-2xl min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <span>🧩</span>
                    <span className="uppercase tracking-widest text-sm">Sprint Board</span>
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[TaskStatus.CREATED, TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED, TaskStatus.COMPLETED].map(status => (
                    <div key={status} className="rounded-xl border border-[var(--border-color)] bg-white/70 dark:bg-slate-900/40 p-3">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold tracking-wide text-[var(--text-primary)]">{status.replace('_', ' ')}</p>
                        <span className="text-[10px] text-slate-500">{filteredTasks.filter(t => t.status === status).length}</span>
                      </div>
                      <div className="space-y-2 min-h-[80px]">
                        {filteredTasks.filter(t => t.status === status).map(task => (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="glass-card p-3 cursor-pointer hover:border-indigo-400"
                          >
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{task.title}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{users.find(u => u.id === task.assigneeId)?.name || 'Unassigned'}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className={`badge ${task.priority === 'HIGH' ? 'bg-red-500/10 text-red-500 border-red-300/40' : task.priority === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-700 border-yellow-300/40' : 'bg-green-500/10 text-green-700 border-green-300/40'}`}>
                                {task.priority}
                              </span>
                              {canUpdateTask(task) && task.status !== TaskStatus.COMPLETED && (
                                <select
                                  value={task.status}
                                  onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                                  className="text-[10px] px-2 py-1 rounded border border-slate-300 bg-white dark:bg-slate-800 text-[var(--text-primary)]"
                                >
                                  <option value={TaskStatus.CREATED}>Created</option>
                                  <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                                  <option value={TaskStatus.SUBMITTED}>Submitted</option>
                                  <option value={TaskStatus.COMPLETED}>Completed</option>
                                </select>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : viewMode === 'LIST' ? (
              <div className="glass-panel p-6 rounded-2xl min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-white flex items-center gap-3">
                    <Icons.Task />
                    <span className="uppercase tracking-widest text-sm">Live Monitoring Feed</span>
                  </h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded uppercase tracking-wider animate-pulse">
                      ● Stream Active
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredTasks.map(task => {
                    const isSelected = selectedTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`
                            glass-card p-4 cursor-pointer hover:bg-slate-800/60
                            ${isSelected ? 'border-indigo-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(99,102,241,0.15)] scale-[1.01]' : 'hover:scale-[1.005]'}
                          `}
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: Indicator & Title */}
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`mt-1.5 w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${task.status === 'COMPLETED' ? 'text-emerald-500 bg-emerald-500' :
                              task.status === 'AT_RISK' ? 'text-amber-500 bg-amber-500' :
                                'text-indigo-500 bg-indigo-500'
                              }`}></div>

                            <div>
                              <h4 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                {task.title}
                              </h4>
                              <div className="flex items-center gap-3 mt-2">
                                <span className={`badge ${task.priority === 'HIGH' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-700/50 text-slate-400 border-slate-700'}`}>
                                  {task.priority}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                                  <span className="opacity-50">BY</span>
                                  {users.find(u => u.id === task.assigneeId)?.name || 'Unassigned'}
                                </span>
                                {task.projectId && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                    {projects.find(p => p.id === task.projectId)?.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center: Risk Meter */}
                          <div className="flex flex-col items-end gap-1 w-32 shrink-0">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Risk Metric</div>
                            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${task.riskScore > 75 ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' :
                                  task.riskScore > 40 ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' :
                                    'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                                  }`}
                                style={{ width: `${task.riskScore}%` }}
                              ></div>
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">{task.riskScore}% / 100%</div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex flex-col items-end justify-between self-stretch gap-2">
                            <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${getStatusColor(task.status)}`}>
                              {task.status}
                            </span>

                            {task.status !== 'COMPLETED' && task.assigneeId === currentUser.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCompleteTask(task.id); }}
                                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded transition-colors flex items-center gap-1.5"
                              >
                                <span>✓</span> Resolve
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanded Details (Simple Slide Down) */}
                        {isSelected && (
                          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Time To Live</div>
                              <div className={`font-mono text-sm ${task.deadline < Date.now() ? 'text-red-400' : 'text-slate-300'}`}>
                                {task.deadline < Date.now() ? 'EXPIRED' : `${Math.ceil((task.deadline - Date.now()) / (1000 * 60))} Mins`}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Latest Agent Action</div>
                              <div className="flex items-center gap-2 text-indigo-300 text-xs">
                                <span>{getActionIcon(task.lastAction)}</span>
                                <span>{task.lastAction === ActionType.NONE ? 'System Scanning...' : task.lastAction}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredTasks.length === 0 && (
                    <div className="py-20 text-center">
                      <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                        <Icons.Task />
                      </div>
                      <p className="text-slate-500 text-sm">All systems nominal. No active threads in this vector.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <GanttChart tasks={filteredTasks} users={users} />
            )}
          </div>

          {/* Right Column: AI Trace Panel */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl min-h-[600px] sticky top-8 border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.05)]">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3 text-indigo-400">
                  <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                    <Icons.Brain />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white">Decision Trace</h3>
                    <p className="text-[9px] text-indigo-500/60 font-mono">NEURAL_LAYER_v4</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>
                </div>
              </div>

              {!selectedTaskId ? (
                <div className="flex flex-col items-center justify-center py-32 text-center opacity-50">
                  <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center text-slate-600 mb-6 border border-dashed border-slate-700">
                    <Icons.Task />
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Awaiting Selection</p>
                  <p className="text-[11px] text-slate-500 mt-2 font-mono max-w-[200px]">Select an execution thread to inspect agent reasoning logic.</p>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">

                  {/* Visual Escalation Path (Timeline) */}
                  <section>
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-4 block flex justify-between">
                      <span>Execution Chain</span>
                      <span className="text-indigo-500">LIVE</span>
                    </label>
                    <div className="relative pl-4 pt-2 ml-2">
                      {/* Vertical Line */}
                      <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-emerald-500 via-indigo-500 to-slate-800"></div>

                      {(selectedLogs[0]?.escalationPath || [users.find(u => u.id === selectedTask?.assigneeId)?.name || 'Unassigned']).map((step, idx, arr) => (
                        <div key={idx} className="relative mb-8 last:mb-0 flex items-center gap-4 group">
                          {/* Node */}
                          <div className={`
                            absolute -left-[4px] w-3 h-3 rounded-full border-2 z-10 shadow-[0_0_10px_currentColor] transition-all duration-300
                            ${idx === 0 ? 'bg-black border-emerald-500 text-emerald-500 scale-125' : idx < arr.length - 1 ? 'bg-slate-900 border-indigo-500 text-indigo-500' : 'bg-slate-900 border-slate-600 text-slate-600'}
                          `}></div>

                          <div className={`
                              ml-6 p-3 rounded-lg border w-full transition-all duration-300
                              ${idx === 0
                              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                              : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80'}
                          `}>
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-[10px] uppercase font-bold tracking-wider ${idx === 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {idx === 0 ? 'Active Executor' : idx === arr.length - 1 ? 'Target Node' : 'Escalation Node'}
                              </span>
                              {idx === 0 && <span className="text-[9px] text-emerald-500 font-mono animate-pulse">Running...</span>}
                            </div>
                            <span className={`text-xs font-bold block ${idx === 0 ? 'text-white' : 'text-slate-300'}`}>
                              {step}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="h-px bg-slate-800 w-full"></div>

                  <section>
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-3 block">RAG Memory Context</label>
                    <div className="space-y-2">
                      {selectedLogs[0]?.retrievedMemories.map((m, idx) => (
                        <div key={idx} className="p-3 text-[10px] bg-indigo-900/20 text-indigo-300 border-l-2 border-indigo-500/50 rounded-r-lg font-mono leading-relaxed hover:bg-indigo-900/30 transition-colors">
                          <span className="opacity-50 mr-2 select-none">[{idx}]</span> {m}
                        </div>
                      )) || <div className="text-[11px] text-slate-600 italic font-mono pl-2">Using zero-shot reasoning (No historical context)...</div>}
                    </div>
                  </section>

                  <section>
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-3 block">Logic Kernel Output</label>
                    <div className="p-4 bg-black/50 border border-slate-800 rounded-xl text-[11px] leading-relaxed font-mono relative overflow-hidden group shadow-inner">
                      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition">
                        <Icons.Brain />
                      </div>
                      <span className="text-emerald-500 mr-2 animate-pulse">root@agent:~#</span>
                      <span className="text-slate-300">
                        {selectedLogs[0]?.explanation || "Initializing neural explanation layer..."}
                      </span>
                      <span className="inline-block w-1.5 h-3 bg-emerald-500 ml-1 animate-pulse align-middle"></span>
                    </div>
                  </section>

                  <section>
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-3 block">Task Comments</label>
                    <div className="space-y-2 max-h-44 overflow-auto pr-1">
                      {(selectedTask?.comments || []).length === 0 ? (
                        <div className="text-[11px] text-slate-500 italic">No comments yet.</div>
                      ) : (selectedTask?.comments || []).map(comment => (
                        <div key={comment.id} className="p-2 rounded border border-[var(--border-color)] bg-white/50 dark:bg-slate-900/40">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-[var(--text-primary)]">{comment.userName}</p>
                            <p className="text-[10px] text-slate-500">{new Date(comment.createdAt).toLocaleString()}</p>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write an update..."
                        className="input-field py-2"
                      />
                      <button onClick={handleAddComment} className="btn-primary px-3 py-2 rounded text-xs font-semibold">Post</button>
                    </div>
                  </section>

                  <section>
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-3 block">Task History</label>
                    <div className="space-y-2 max-h-40 overflow-auto pr-1">
                      {(selectedTask?.history || []).slice().reverse().slice(0, 8).map(entry => (
                        <div key={entry.id} className="text-[11px] p-2 rounded border border-[var(--border-color)] bg-white/40 dark:bg-slate-900/30">
                          <p className="font-semibold text-[var(--text-primary)]">{entry.action.replace('_', ' ')}</p>
                          <p className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                </div>
              )}
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-[10px] text-amber-500/80 flex gap-3 items-start">
              <div className="shrink-0 text-lg">🛡️</div>
              <p className="leading-relaxed font-medium">
                <strong>Compliance Protocol:</strong> Reasoning is performed on tokenized behavioral abstractions. No direct user content is exposed to third-party LLM providers.
              </p>
            </div>
          </div>
        </div>
      </main >

      {/* Skill Manager Modal */}
      {
        showSkillManager && (
          <SkillManager
            currentUser={currentUser}
            onUpdateSkills={handleUpdateSkills}
            onClose={() => setShowSkillManager(false)}
          />
        )
      }
    </div >
  );
};

export default App;
