import React, { useState } from 'react';
import { User, UserRole } from './types';
import { ALL_SKILLS } from './constants';
import { userAPI } from './api/client';

interface AuthProps {
    onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: UserRole.ASSIGNEE,
    });
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError(null);
    };

    const handleSkillToggle = (skill: string) => {
        setSelectedSkills(prev =>
            prev.includes(skill)
                ? prev.filter(s => s !== skill)
                : [...prev, skill]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isLogin) {
                // Login using MongoDB API
                const user = await userAPI.login({
                    email: formData.email,
                    password: formData.password
                });
                onLogin(user);
            } else {
                // Register using MongoDB API
                const newUser = await userAPI.register({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    role: formData.role,
                    skills: selectedSkills.length > 0 ? selectedSkills : ['General']
                });
                onLogin(newUser);
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred. Make sure MongoDB backend is running.');
            console.error('Auth error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_12%_12%,rgba(37,99,235,0.22),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(15,23,42,0.12),transparent_42%),linear-gradient(135deg,#f8fbff,#e6edf7)] flex items-center justify-center p-6">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-sm p-8 shadow-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Agile Command Center</p>
                    <h1 className="mt-3 text-4xl font-extrabold text-slate-900 leading-tight">
                        Manage Sprints With AI-powered Execution Intelligence
                    </h1>
                    <p className="mt-4 text-slate-600 leading-relaxed">
                        Plan sprint goals, assign owners, and track execution risk in real time across your teams.
                    </p>
                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Sprint Focus</p>
                            <p className="text-lg font-bold text-slate-900">Delivery + Risk</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Cadence</p>
                            <p className="text-lg font-bold text-slate-900">15 sec monitor loop</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Escalation</p>
                            <p className="text-lg font-bold text-slate-900">Assignee to Admin</p>
                        </div>
                    </div>
                </section>

                <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-slate-900 mb-1">
                            {isLogin ? 'Sign In' : 'Create Workspace Account'}
                        </h2>
                        <p className="text-slate-600">
                            {isLogin ? 'Access sprint dashboards and delivery controls' : 'Set up your profile for sprint planning and execution'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    placeholder="John Doe"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                placeholder="••••••••"
                            />
                        </div>

                        {!isLogin && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Role
                                    </label>
                                    <select
                                        name="role"
                                        value={formData.role}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    >
                                        <option value={UserRole.ASSIGNEE}>Team Member</option>
                                        <option value={UserRole.TEAM_LEAD}>Team Lead</option>
                                        <option value={UserRole.MANAGER}>Project Manager</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Skills (Select all that apply)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-lg">
                                        {ALL_SKILLS.slice(0, 20).map(skill => (
                                            <label key={skill} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSkills.includes(skill)}
                                                    onChange={() => handleSkillToggle(skill)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm text-slate-700">{skill}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Selected: {selectedSkills.length > 0 ? selectedSkills.join(', ') : 'None'}
                                    </p>
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>

                    <p className="mt-4 text-xs text-slate-500">
                        API expected at <code className="font-mono">http://localhost:8001</code>. If login fails, ensure <code className="font-mono">api_service/main.py</code> is running.
                    </p>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setError(null);
                            }}
                            className="text-blue-700 hover:text-blue-800 font-semibold text-sm"
                        >
                            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
