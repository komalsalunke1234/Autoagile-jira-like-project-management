// API Client for MongoDB Backend
// Defaults to API service on 8001. Can be overridden in .env.local using VITE_API_BASE_URL.
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8001';

// Generic API call function
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        let errorMessage = `API Error: ${response.status}`;
        try {
            const errorData = await response.json();
            // Handle FastAPI validation errors (422)
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    // Validation errors are arrays
                    errorMessage = errorData.detail.map((err: any) =>
                        `${err.loc?.join('.')}: ${err.msg}`
                    ).join(', ');
                } else if (typeof errorData.detail === 'string') {
                    errorMessage = errorData.detail;
                } else {
                    errorMessage = JSON.stringify(errorData.detail);
                }
            }
        } catch (e) {
            // If JSON parsing fails, use status text
            errorMessage = `${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

// ===== User API =====

export interface UserCreate {
    name: string;
    email: string;
    password: string;
    role: string;
    skills?: string[];
}

export interface UserLogin {
    email: string;
    password: string;
}

export const userAPI = {
    getAll: () => apiCall<any[]>('/api/users'),

    getById: (id: string) => apiCall<any>(`/api/users/${id}`),

    register: (userData: UserCreate) =>
        apiCall<any>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        }),

    login: (credentials: UserLogin) =>
        apiCall<any>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        }),

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    updateSkills: (id: string, skills: string[]) =>
        apiCall<any>(`/api/users/${id}/skills`, {
            method: 'PUT',
            body: JSON.stringify(skills),
        }),
};

// ===== Project API =====

export interface ProjectCreate {
    name: string;
    description: string;
    orgId?: string;
}

export const projectAPI = {
    getAll: (userId?: string) => {
        const params = userId ? `?user_id=${userId}` : '';
        return apiCall<any[]>(`/api/projects${params}`);
    },

    getById: (id: string) => apiCall<any>(`/api/projects/${id}`),

    create: (projectData: ProjectCreate, leadId?: string) => {
        const params = leadId ? `?lead_id=${leadId}` : '';
        return apiCall<any>(`/api/projects${params}`, {
            method: 'POST',
            body: JSON.stringify(projectData),
        });
    },

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    addMember: (projectId: string, userId: string) =>
        apiCall<any>(`/api/projects/${projectId}/members/${userId}`, {
            method: 'POST',
        }),

    removeMember: (projectId: string, userId: string) =>
        apiCall<any>(`/api/projects/${projectId}/members/${userId}`, {
            method: 'DELETE',
        }),
};

// ===== Task API =====

export interface TaskCreate {
    title: string;
    description: string;
    priority: string;
    deadline: number;
    teamId: string;
    deptId: string;
    orgId?: string;
    projectId?: string;
    sprintId?: string;
    requiredSkills?: string[];
    assigneeId?: string;
    milestone?: boolean;
}

export const taskAPI = {
    getAll: (userId?: string, projectId?: string) => {
        const params = new URLSearchParams();
        if (userId) params.append('user_id', userId);
        if (projectId) params.append('project_id', projectId);
        const queryString = params.toString();
        return apiCall<any[]>(`/api/tasks/${queryString ? '?' + queryString : ''}`);
    },

    getById: (id: string) => apiCall<any>(`/api/tasks/${id}`),

    create: (taskData: TaskCreate) =>
        apiCall<any>('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData),
        }),

    suggestPriority: (payload: { title: string; description?: string; deadline: number; requiredSkills?: string[] }) =>
        apiCall<any>('/api/tasks/ai-priority', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    update: (id: string, updates: any) =>
        apiCall<any>(`/api/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    updateStatus: (id: string, status: string) =>
        apiCall<any>(`/api/tasks/${id}/status?new_status=${status}`, {
            method: 'PUT',
        }),

    complete: (id: string, quality?: number, hoursSpent?: number) =>
        apiCall<any>(`/api/tasks/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ quality, hoursSpent }),
        }),

    addComment: (id: string, comment: { userId: string; userName: string; text: string }) =>
        apiCall<any>(`/api/tasks/${id}/comments`, {
            method: 'POST',
            body: JSON.stringify(comment),
        }),

    delete: (id: string) =>
        apiCall<any>(`/api/tasks/${id}`, {
            method: 'DELETE',
        }),
};

// ===== Health Check =====

export const healthAPI = {
    check: () => apiCall<any>('/health'),
};

// ===== Sprint API =====

export interface SprintCreate {
    name: string;
    goal?: string;
    projectId?: string;
    startDate: number;
    endDate: number;
    status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
}

export const sprintAPI = {
    getAll: (projectId?: string) => {
        const params = projectId ? `?project_id=${projectId}` : '';
        return apiCall<any[]>(`/api/sprints${params}`);
    },

    create: (payload: SprintCreate) =>
        apiCall<any>('/api/sprints', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    update: (id: string, updates: Partial<SprintCreate>) =>
        apiCall<any>(`/api/sprints/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        }),

    burndown: (id: string) => apiCall<any>(`/api/sprints/${id}/burndown`),
};

// ===== Activity API =====

export const analyticsAPI = {
    getDeveloperActivity: (days = 7) => apiCall<any[]>(`/api/activity?days=${days}`),
};
