"""
Pydantic models for API request/response validation
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ASSIGNEE = "ASSIGNEE"
    TEAM_MEMBER = "ASSIGNEE"
    TEAM_LEAD = "TEAM_LEAD"
    MANAGER = "MANAGER"
    PROJECT_MANAGER = "MANAGER"
    ADMIN = "ADMIN"

class TaskStatus(str, Enum):
    CREATED = "CREATED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    COMPLETED = "COMPLETED"
    AT_RISK = "AT_RISK"
    OVERDUE = "OVERDUE"
    ESCALATED = "ESCALATED"

class TaskPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class ActionType(str, Enum):
    REMIND = "REMIND"
    RISK_ALERT = "RISK_ALERT"
    ESCALATE = "ESCALATE"
    CRITICAL_ESCALATE = "CRITICAL_ESCALATE"
    NONE = "NONE"

class SprintStatus(str, Enum):
    PLANNED = "PLANNED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"

# User Models
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.ASSIGNEE
    skills: List[str] = []

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    teamId: str = "UNASSIGNED"
    deptId: str = "UNASSIGNED"
    reliabilityScore: float = 0.5
    skills: List[str] = []
    
    class Config:
        from_attributes = True

# Project Models
class ProjectCreate(BaseModel):
    name: str
    description: str
    leadId: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    leadId: Optional[str] = None
    status: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    orgId: str
    leadId: Optional[str] = None
    memberIds: List[str] = []
    status: str = "ACTIVE"
    createdAt: int
    
    class Config:
        from_attributes = True

# Task Models
class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: TaskPriority = TaskPriority.MEDIUM
    deadline: int  # timestamp in milliseconds
    assigneeId: Optional[str] = None
    teamId: Optional[str] = None
    deptId: Optional[str] = None
    orgId: Optional[str] = "ORG-001"
    projectId: Optional[str] = None
    sprintId: Optional[str] = None
    requiredSkills: List[str] = []
    startDate: Optional[int] = None
    estimatedDuration: Optional[int] = 60
    dependencies: List[str] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    deadline: Optional[int] = None
    assigneeId: Optional[str] = None
    sprintId: Optional[str] = None
    startDate: Optional[int] = None
    estimatedDuration: Optional[int] = None
    dependencies: Optional[List[str]] = None
    milestone: Optional[bool] = None

class TaskCommentCreate(BaseModel):
    userId: str
    userName: str
    text: str

class TaskCommentResponse(BaseModel):
    id: str
    userId: str
    userName: str
    text: str
    createdAt: int

class TaskHistoryItem(BaseModel):
    id: str
    action: str
    actorId: Optional[str] = None
    actorName: Optional[str] = None
    createdAt: int
    metadata: Optional[dict] = {}

class TaskResponse(BaseModel):
    id: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    deadline: int
    startDate: int
    estimatedDuration: int
    dependencies: List[str] = []
    actualStartDate: Optional[int] = None
    assigneeId: str
    teamId: str
    deptId: str
    orgId: str
    projectId: Optional[str] = None
    sprintId: Optional[str] = None
    milestone: bool = False
    requiredSkills: List[str] = []
    comments: List[TaskCommentResponse] = []
    history: List[TaskHistoryItem] = []
    riskScore: int = 0
    lastAction: ActionType = ActionType.NONE
    updatedAt: int
    
    class Config:
        from_attributes = True

# User Action Models
class UserActionCreate(BaseModel):
    userId: str
    actionType: str  # "login", "logout", "task_created", "task_updated", "task_completed"
    taskId: Optional[str] = None
    details: Optional[dict] = {}

class UserActionResponse(BaseModel):
    id: str
    userId: str
    actionType: str
    taskId: Optional[str] = None
    timestamp: int
    details: dict = {}
    
    class Config:
        from_attributes = True

class SprintCreate(BaseModel):
    name: str
    goal: Optional[str] = ""
    projectId: Optional[str] = None
    startDate: int
    endDate: int
    status: SprintStatus = SprintStatus.PLANNED

class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    projectId: Optional[str] = None
    startDate: Optional[int] = None
    endDate: Optional[int] = None
    status: Optional[SprintStatus] = None

class SprintResponse(BaseModel):
    id: str
    name: str
    goal: Optional[str] = ""
    projectId: Optional[str] = None
    startDate: int
    endDate: int
    status: SprintStatus
    createdAt: int

    class Config:
        from_attributes = True

class BurndownPoint(BaseModel):
    date: int
    idealRemaining: int
    actualRemaining: int

class BurndownResponse(BaseModel):
    sprintId: str
    totalTasks: int
    points: List[BurndownPoint]

class DeveloperActivityItem(BaseModel):
    userId: str
    userName: str
    actions: int = 0
    completedTasks: int = 0
    commentsAdded: int = 0
    statusChanges: int = 0
    score: float = 0

class TaskPrioritySuggestRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    deadline: int
    requiredSkills: List[str] = []

class TaskPrioritySuggestResponse(BaseModel):
    priority: TaskPriority
    confidence: float
    reason: str

# Performance Models
class PerformanceMetrics(BaseModel):
    userId: str
    totalTasksAssigned: int = 0
    tasksCompleted: int = 0
    tasksCompletedOnTime: int = 0
    tasksCompletedLate: int = 0
    averageCompletionTime: float = 0.0
    reliabilityScore: float = 0.5
    
    class Config:
        from_attributes = True

# Escalation Models
class EscalationCreate(BaseModel):
    taskId: str
    userId: str
    leadId: str
    reason: str
    aiAnalysis: str
    riskScore: int

class EscalationResponse(BaseModel):
    id: str
    taskId: str
    userId: str
    leadId: str
    reason: str
    aiAnalysis: str
    riskScore: int
    timestamp: int
    resolved: bool = False
    
    class Config:
        from_attributes = True
