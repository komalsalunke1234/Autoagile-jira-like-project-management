"""
FastAPI Main Application - MongoDB Backend for AEIP
Replaces localStorage with permanent database storage
"""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from typing import List, Optional
import bcrypt
import time
from datetime import datetime

from database import (
    connect_to_mongo, close_mongo_connection, get_database,
    USERS_COLLECTION, PROJECTS_COLLECTION, TASKS_COLLECTION, SPRINTS_COLLECTION,
    USER_ACTIONS_COLLECTION, ESCALATIONS_COLLECTION
)
from models import (
    UserCreate, UserLogin, UserResponse,
    ProjectCreate, ProjectUpdate, ProjectResponse,
    TaskCreate, TaskUpdate, TaskResponse,
    TaskCommentCreate,
    UserActionCreate, UserActionResponse,
    PerformanceMetrics, TaskStatus, ActionType,
    SprintCreate, SprintUpdate, SprintResponse, SprintStatus,
    BurndownResponse, BurndownPoint,
    DeveloperActivityItem,
    TaskPrioritySuggestRequest, TaskPrioritySuggestResponse
)

# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()

# Initialize FastAPI app
app = FastAPI(
    title="AEIP API Service",
    description="MongoDB Backend for Agentic Execution Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== UTILITY FUNCTIONS ====================

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def generate_id(prefix: str) -> str:
    """Generate unique ID"""
    return f"{prefix}-{int(time.time() * 1000)}"

def normalize_task_doc(task_doc: dict) -> dict:
    """Backfill optional task fields required by frontend Gantt view."""
    now_ms = int(time.time() * 1000)
    normalized = dict(task_doc)
    normalized.setdefault("startDate", normalized.get("updatedAt", now_ms))
    normalized.setdefault("estimatedDuration", 60)
    normalized.setdefault("dependencies", [])
    normalized.setdefault("requiredSkills", [])
    normalized.setdefault("riskScore", 0)
    normalized.setdefault("lastAction", ActionType.NONE.value)
    normalized.setdefault("teamId", "UNASSIGNED")
    normalized.setdefault("deptId", "UNASSIGNED")
    normalized.setdefault("orgId", "ORG-001")
    normalized.setdefault("sprintId", None)
    normalized.setdefault("updatedAt", now_ms)
    normalized.setdefault("milestone", False)
    normalized.setdefault("comments", [])
    normalized.setdefault("history", [])
    return normalized

async def log_user_action(db, user_id: Optional[str], action_type: str, task_id: Optional[str] = None, details: Optional[dict] = None):
    """Best-effort action logging for activity analytics."""
    if not user_id:
        return
    actions_collection = db[USER_ACTIONS_COLLECTION]
    await actions_collection.insert_one({
        "id": generate_id("ACTION"),
        "userId": user_id,
        "actionType": action_type,
        "taskId": task_id,
        "timestamp": int(time.time() * 1000),
        "details": details or {}
    })

def append_task_history(task_doc: dict, action: str, actor_id: Optional[str] = None, actor_name: Optional[str] = None, metadata: Optional[dict] = None) -> dict:
    """Append history entry to a task document."""
    history = list(task_doc.get("history", []))
    history.append({
        "id": generate_id("HIST"),
        "action": action,
        "actorId": actor_id,
        "actorName": actor_name,
        "createdAt": int(time.time() * 1000),
        "metadata": metadata or {}
    })
    task_doc["history"] = history
    return task_doc

def skill_match_score(user_skills: list, required_skills: list) -> float:
    """Simple skill match score in [0,1] for auto-assignment."""
    if not required_skills:
        return 1.0
    if not user_skills:
        return 0.0

    normalized_user = {s.lower() for s in user_skills}
    normalized_required = [s.lower() for s in required_skills]
    matched = sum(1 for s in normalized_required if s in normalized_user)
    return matched / max(len(normalized_required), 1)

async def auto_assign_assignee(users_collection, task_data: TaskCreate):
    """Pick the best assignee using team/dept scope, role, skills, and reliability."""
    query = {"role": "ASSIGNEE"}
    if task_data.teamId and task_data.teamId != "UNASSIGNED":
        query["teamId"] = task_data.teamId
    elif task_data.deptId and task_data.deptId != "UNASSIGNED":
        query["deptId"] = task_data.deptId

    candidates = []
    async for user in users_collection.find(query):
        candidates.append(user)

    if not candidates and (task_data.teamId or task_data.deptId):
        async for user in users_collection.find({"role": "ASSIGNEE"}):
            candidates.append(user)

    if not candidates:
        return None

    required = task_data.requiredSkills or []
    best = max(
        candidates,
        key=lambda u: (skill_match_score(u.get("skills", []), required) * 0.7) + (u.get("reliabilityScore", 0.5) * 0.3)
    )
    return best

# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "AEIP API", "timestamp": int(time.time() * 1000)}

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user_data: UserCreate, db=Depends(get_database)):
    """Register a new user"""
    users_collection = db[USERS_COLLECTION]
    
    # Check if user already exists
    existing_user = await users_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    user_dict = {
        "id": generate_id("USER"),
        "name": user_data.name,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "role": user_data.role.value,
        "teamId": "UNASSIGNED",
        "deptId": "UNASSIGNED",
        "reliabilityScore": 0.5,
        "skills": user_data.skills or [],
        "createdAt": int(time.time() * 1000)
    }
    
    await users_collection.insert_one(user_dict)
    
    # Return user without password
    user_response = {k: v for k, v in user_dict.items() if k != "password" and k != "_id"}
    return UserResponse(**user_response)

@app.post("/api/auth/login", response_model=UserResponse)
async def login_user(credentials: UserLogin, db=Depends(get_database)):
    """Login user"""
    users_collection = db[USERS_COLLECTION]
    
    # Find user by email
    user = await users_collection.find_one({"email": credentials.email})
    
    if not user or not verify_password(credentials.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Log login action
    actions_collection = db[USER_ACTIONS_COLLECTION]
    await actions_collection.insert_one({
        "id": generate_id("ACTION"),
        "userId": user["id"],
        "actionType": "login",
        "timestamp": int(time.time() * 1000),
        "details": {}
    })
    
    # Return user without password
    user_response = {k: v for k, v in user.items() if k != "password" and k != "_id"}
    return UserResponse(**user_response)

# ==================== USER ENDPOINTS ====================

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(db=Depends(get_database)):
    """Get all users"""
    users_collection = db[USERS_COLLECTION]
    users = []
    
    async for user in users_collection.find():
        user_dict = {k: v for k, v in user.items() if k != "password" and k != "_id"}
        users.append(UserResponse(**user_dict))
    
    return users

@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db=Depends(get_database)):
    """Get user by ID"""
    users_collection = db[USERS_COLLECTION]
    user = await users_collection.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_dict = {k: v for k, v in user.items() if k != "password" and k != "_id"}
    return UserResponse(**user_dict)

# ==================== PROJECT ENDPOINTS ====================

@app.post("/api/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(project_data: ProjectCreate, lead_id: Optional[str] = None, db=Depends(get_database)):
    """Create a new project"""
    projects_collection = db[PROJECTS_COLLECTION]
    
    project_dict = {
        "id": generate_id("PROJ"),
        "name": project_data.name,
        "description": project_data.description,
        "orgId": "ORG-001",  # Default org for now
        "leadId": lead_id or project_data.leadId,
        "memberIds": [],
        "status": "ACTIVE",
        "createdAt": int(time.time() * 1000)
    }
    
    await projects_collection.insert_one(project_dict)
    
    response = {k: v for k, v in project_dict.items() if k != "_id"}
    return ProjectResponse(**response)

@app.get("/api/projects", response_model=List[ProjectResponse])
async def get_projects(user_role: Optional[str] = None, user_id: Optional[str] = None, db=Depends(get_database)):
    """Get projects (filtered by role if specified)"""
    projects_collection = db[PROJECTS_COLLECTION]
    projects = []
    
    async for project in projects_collection.find():
        project_dict = {k: v for k, v in project.items() if k != "_id"}
        projects.append(ProjectResponse(**project_dict))
    
    return projects

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db=Depends(get_database)):
    """Get project by ID"""
    projects_collection = db[PROJECTS_COLLECTION]
    project = await projects_collection.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**{k: v for k, v in project.items() if k != "_id"})

@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project_update: ProjectUpdate, db=Depends(get_database)):
    """Update project metadata"""
    projects_collection = db[PROJECTS_COLLECTION]
    update_data = {k: v for k, v in project_update.dict(exclude_unset=True).items()}

    if update_data:
        result = await projects_collection.update_one({"id": project_id}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project not found")

    project = await projects_collection.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**{k: v for k, v in project.items() if k != "_id"})

@app.post("/api/projects/{project_id}/members/{user_id}", response_model=ProjectResponse)
async def add_project_member(project_id: str, user_id: str, db=Depends(get_database)):
    """Add a member to project"""
    projects_collection = db[PROJECTS_COLLECTION]
    result = await projects_collection.update_one({"id": project_id}, {"$addToSet": {"memberIds": user_id}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    project = await projects_collection.find_one({"id": project_id})
    return ProjectResponse(**{k: v for k, v in project.items() if k != "_id"})

@app.delete("/api/projects/{project_id}/members/{user_id}", response_model=ProjectResponse)
async def remove_project_member(project_id: str, user_id: str, db=Depends(get_database)):
    """Remove a member from project"""
    projects_collection = db[PROJECTS_COLLECTION]
    result = await projects_collection.update_one({"id": project_id}, {"$pull": {"memberIds": user_id}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    project = await projects_collection.find_one({"id": project_id})
    return ProjectResponse(**{k: v for k, v in project.items() if k != "_id"})

@app.put("/api/projects/{project_id}/assign-lead")
async def assign_lead(project_id: str, lead_id: str, db=Depends(get_database)):
    """Assign team lead to project"""
    projects_collection = db[PROJECTS_COLLECTION]
    
    result = await projects_collection.update_one(
        {"id": project_id},
        {"$set": {"leadId": lead_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"status": "success", "message": "Lead assigned"}

@app.put("/api/projects/{project_id}/add-member")
async def add_member(project_id: str, member_id: str, db=Depends(get_database)):
    """Add employee to project"""
    projects_collection = db[PROJECTS_COLLECTION]
    
    result = await projects_collection.update_one(
        {"id": project_id},
        {"$addToSet": {"memberIds": member_id}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"status": "success", "message": "Member added"}

# ==================== TASK ENDPOINTS ====================

@app.post("/api/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(task_data: TaskCreate, db=Depends(get_database)):
    """Create a new task"""
    tasks_collection = db[TASKS_COLLECTION]
    users_collection = db[USERS_COLLECTION]

    assignee = None
    assignee_id = task_data.assigneeId

    if assignee_id:
        assignee = await users_collection.find_one({"id": assignee_id})
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee not found")
    else:
        assignee = await auto_assign_assignee(users_collection, task_data)
        if not assignee:
            raise HTTPException(status_code=400, detail="No eligible assignee found")
        assignee_id = assignee["id"]

    now_ms = int(time.time() * 1000)
    
    task_dict = {
        "id": generate_id("TASK"),
        "title": task_data.title,
        "description": task_data.description,
        "status": TaskStatus.CREATED.value,
        "priority": task_data.priority.value,
        "deadline": task_data.deadline,
        "startDate": task_data.startDate or now_ms,
        "estimatedDuration": task_data.estimatedDuration or 60,
        "dependencies": task_data.dependencies or [],
        "assigneeId": assignee_id,
        "teamId": task_data.teamId or assignee.get("teamId", "UNASSIGNED"),
        "deptId": task_data.deptId or assignee.get("deptId", "UNASSIGNED"),
        "orgId": task_data.orgId or "ORG-001",
        "projectId": task_data.projectId,
        "sprintId": task_data.sprintId,
        "milestone": False,
        "requiredSkills": task_data.requiredSkills or [],
        "comments": [],
        "history": [],
        "riskScore": 0,
        "lastAction": ActionType.NONE.value,
        "updatedAt": now_ms
    }

    append_task_history(task_dict, "TASK_CREATED", assignee_id, assignee.get("name"), {
        "priority": task_data.priority.value,
        "deadline": task_data.deadline
    })
    
    await tasks_collection.insert_one(task_dict)
    
    # Log task creation action
    actions_collection = db[USER_ACTIONS_COLLECTION]
    await actions_collection.insert_one({
        "id": generate_id("ACTION"),
        "userId": assignee_id,
        "actionType": "task_created",
        "taskId": task_dict["id"],
        "timestamp": now_ms,
        "details": {"deadline": task_data.deadline}
    })
    
    response = {k: v for k, v in task_dict.items() if k != "_id"}
    return TaskResponse(**response)

@app.get("/api/tasks", response_model=List[TaskResponse])
async def get_tasks(
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
    project_id: Optional[str] = None,
    sprint_id: Optional[str] = None,
    db=Depends(get_database)
):
    """Get tasks with optional filtering"""
    tasks_collection = db[TASKS_COLLECTION]
    
    # Build query
    query = {}
    if user_id:
        query["assigneeId"] = user_id
    if team_id:
        query["teamId"] = team_id
    if project_id:
        query["projectId"] = project_id
    if sprint_id:
        query["sprintId"] = sprint_id
    
    tasks = []
    async for task in tasks_collection.find(query):
        task_dict = normalize_task_doc({k: v for k, v in task.items() if k != "_id"})
        tasks.append(TaskResponse(**task_dict))
    
    return tasks

@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db=Depends(get_database)):
    """Get task by ID"""
    tasks_collection = db[TASKS_COLLECTION]
    task = await tasks_collection.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse(**normalize_task_doc({k: v for k, v in task.items() if k != "_id"}))

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task_update: TaskUpdate, db=Depends(get_database)):
    """Update task"""
    tasks_collection = db[TASKS_COLLECTION]
    
    # Build update dict
    update_data = {k: v for k, v in task_update.dict(exclude_unset=True).items()}
    if update_data:
        update_data["updatedAt"] = int(time.time() * 1000)

        existing_task = await tasks_collection.find_one({"id": task_id})
        if not existing_task:
            raise HTTPException(status_code=404, detail="Task not found")

        merged = normalize_task_doc({k: v for k, v in existing_task.items() if k != "_id"})
        append_task_history(merged, "TASK_UPDATED", merged.get("assigneeId"), None, {
            "updatedFields": list(update_data.keys())
        })
        update_data["history"] = merged.get("history", [])

        
        result = await tasks_collection.update_one(
            {"id": task_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # Log update action if status changed
        if "status" in update_data:
            actions_collection = db[USER_ACTIONS_COLLECTION]
            task = await tasks_collection.find_one({"id": task_id})
            await actions_collection.insert_one({
                "id": generate_id("ACTION"),
                "userId": task["assigneeId"],
                "actionType": f"task_status_changed",
                "taskId": task_id,
                "timestamp": int(time.time() * 1000),
                "details": {"new_status": update_data["status"]}
            })
    
    # Return updated task
    task = await tasks_collection.find_one({"id": task_id})
    task_dict = normalize_task_doc({k: v for k, v in task.items() if k != "_id"})
    return TaskResponse(**task_dict)

@app.put("/api/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(task_id: str, new_status: TaskStatus, db=Depends(get_database)):
    """Update only task status"""
    tasks_collection = db[TASKS_COLLECTION]
    now_ms = int(time.time() * 1000)
    task = await tasks_collection.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dict = normalize_task_doc({k: v for k, v in task.items() if k != "_id"})
    append_task_history(task_dict, "STATUS_CHANGED", task_dict.get("assigneeId"), None, {
        "newStatus": new_status.value
    })

    result = await tasks_collection.update_one(
        {"id": task_id},
        {"$set": {"status": new_status.value, "updatedAt": now_ms, "history": task_dict.get("history", [])}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    await log_user_action(db, task_dict.get("assigneeId"), "task_status_changed", task_id, {"newStatus": new_status.value})

    task = await tasks_collection.find_one({"id": task_id})
    return TaskResponse(**normalize_task_doc({k: v for k, v in task.items() if k != "_id"}))

@app.post("/api/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(task_id: str, db=Depends(get_database)):
    """Mark task as completed"""
    tasks_collection = db[TASKS_COLLECTION]
    now_ms = int(time.time() * 1000)

    existing_task = await tasks_collection.find_one({"id": task_id})
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dict = normalize_task_doc({k: v for k, v in existing_task.items() if k != "_id"})
    append_task_history(task_dict, "TASK_COMPLETED", task_dict.get("assigneeId"), None, {})

    result = await tasks_collection.update_one(
        {"id": task_id},
        {"$set": {"status": TaskStatus.COMPLETED.value, "lastAction": ActionType.NONE.value, "riskScore": 0, "updatedAt": now_ms, "history": task_dict.get("history", [])}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    await log_user_action(db, task_dict.get("assigneeId"), "task_completed", task_id, {})

    task = await tasks_collection.find_one({"id": task_id})
    return TaskResponse(**normalize_task_doc({k: v for k, v in task.items() if k != "_id"}))

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, db=Depends(get_database)):
    """Delete task"""
    tasks_collection = db[TASKS_COLLECTION]
    result = await tasks_collection.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "success", "message": "Task deleted"}

@app.post("/api/tasks/{task_id}/comments", response_model=TaskResponse)
async def add_task_comment(task_id: str, comment_data: TaskCommentCreate, db=Depends(get_database)):
    """Add a comment to a task"""
    tasks_collection = db[TASKS_COLLECTION]

    task = await tasks_collection.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dict = normalize_task_doc({k: v for k, v in task.items() if k != "_id"})
    comments = list(task_dict.get("comments", []))
    comments.append({
        "id": generate_id("COMM"),
        "userId": comment_data.userId,
        "userName": comment_data.userName,
        "text": comment_data.text,
        "createdAt": int(time.time() * 1000)
    })
    task_dict["comments"] = comments
    append_task_history(task_dict, "COMMENT_ADDED", comment_data.userId, comment_data.userName, {})

    await tasks_collection.update_one(
        {"id": task_id},
        {"$set": {"comments": comments, "history": task_dict.get("history", []), "updatedAt": int(time.time() * 1000)}}
    )

    await log_user_action(db, comment_data.userId, "task_comment_added", task_id, {"commentLength": len(comment_data.text)})

    updated = await tasks_collection.find_one({"id": task_id})
    return TaskResponse(**normalize_task_doc({k: v for k, v in updated.items() if k != "_id"}))

# ==================== SPRINT ENDPOINTS ====================

@app.post("/api/sprints", response_model=SprintResponse, status_code=status.HTTP_201_CREATED)
async def create_sprint(sprint_data: SprintCreate, db=Depends(get_database)):
    """Create sprint for a project/team."""
    sprints_collection = db[SPRINTS_COLLECTION]

    sprint_dict = {
        "id": generate_id("SPRINT"),
        "name": sprint_data.name,
        "goal": sprint_data.goal,
        "projectId": sprint_data.projectId,
        "startDate": sprint_data.startDate,
        "endDate": sprint_data.endDate,
        "status": sprint_data.status.value,
        "createdAt": int(time.time() * 1000)
    }

    await sprints_collection.insert_one(sprint_dict)
    return SprintResponse(**{k: v for k, v in sprint_dict.items() if k != "_id"})

@app.get("/api/sprints", response_model=List[SprintResponse])
async def get_sprints(project_id: Optional[str] = None, status_filter: Optional[SprintStatus] = None, db=Depends(get_database)):
    """List sprints with optional filtering."""
    sprints_collection = db[SPRINTS_COLLECTION]
    query = {}
    if project_id:
        query["projectId"] = project_id
    if status_filter:
        query["status"] = status_filter.value

    sprints = []
    async for sprint in sprints_collection.find(query).sort("startDate", -1):
        sprints.append(SprintResponse(**{k: v for k, v in sprint.items() if k != "_id"}))
    return sprints

@app.put("/api/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(sprint_id: str, sprint_update: SprintUpdate, db=Depends(get_database)):
    """Update sprint metadata and status."""
    sprints_collection = db[SPRINTS_COLLECTION]
    update_data = {k: v for k, v in sprint_update.dict(exclude_unset=True).items()}
    if "status" in update_data and isinstance(update_data["status"], SprintStatus):
        update_data["status"] = update_data["status"].value

    if update_data:
        result = await sprints_collection.update_one({"id": sprint_id}, {"$set": update_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Sprint not found")

    sprint = await sprints_collection.find_one({"id": sprint_id})
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return SprintResponse(**{k: v for k, v in sprint.items() if k != "_id"})

@app.get("/api/sprints/{sprint_id}/burndown", response_model=BurndownResponse)
async def get_sprint_burndown(sprint_id: str, db=Depends(get_database)):
    """Return ideal vs actual remaining work for sprint days."""
    sprints_collection = db[SPRINTS_COLLECTION]
    tasks_collection = db[TASKS_COLLECTION]

    sprint = await sprints_collection.find_one({"id": sprint_id})
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    sprint_tasks = []
    async for task in tasks_collection.find({"sprintId": sprint_id}):
        sprint_tasks.append(normalize_task_doc({k: v for k, v in task.items() if k != "_id"}))

    total_tasks = len(sprint_tasks)
    start = int(sprint["startDate"])
    end = int(sprint["endDate"])
    day_ms = 24 * 60 * 60 * 1000
    total_days = max(1, int((end - start) / day_ms) + 1)

    points = []
    for day in range(total_days):
        date_mark = start + day * day_ms
        ideal_remaining = max(0, round(total_tasks * (1 - (day / max(total_days - 1, 1)))))

        completed_by_day = 0
        for task in sprint_tasks:
            if task.get("status") == TaskStatus.COMPLETED.value:
                completed_timestamp = task.get("updatedAt", 0)
                for event in task.get("history", []):
                    if event.get("action") == "TASK_COMPLETED":
                        completed_timestamp = event.get("createdAt", completed_timestamp)
                        break
                if completed_timestamp <= date_mark + day_ms:
                    completed_by_day += 1

        actual_remaining = max(0, total_tasks - completed_by_day)
        points.append(BurndownPoint(date=date_mark, idealRemaining=ideal_remaining, actualRemaining=actual_remaining))

    return BurndownResponse(sprintId=sprint_id, totalTasks=total_tasks, points=points)

# ==================== AI ASSIST ENDPOINTS ====================

@app.post("/api/tasks/ai-priority", response_model=TaskPrioritySuggestResponse)
async def suggest_task_priority(payload: TaskPrioritySuggestRequest):
    """Heuristic AI-style priority recommendation for task creation."""
    now_ms = int(time.time() * 1000)
    minutes_left = max(1, int((payload.deadline - now_ms) / 60000))
    urgency_score = 0.0

    title_blob = f"{payload.title} {payload.description}".lower()
    if any(token in title_blob for token in ["critical", "prod", "blocker", "outage", "security", "urgent"]):
        urgency_score += 0.55
    if minutes_left <= 240:
        urgency_score += 0.35
    elif minutes_left <= 24 * 60:
        urgency_score += 0.2
    if len(payload.requiredSkills) >= 4:
        urgency_score += 0.15

    urgency_score = min(1.0, urgency_score)
    if urgency_score >= 0.65:
        priority = "HIGH"
    elif urgency_score >= 0.35:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    reason = f"Time left: {minutes_left} min, required skills: {len(payload.requiredSkills)}, context score: {urgency_score:.2f}"
    return TaskPrioritySuggestResponse(priority=priority, confidence=round(0.6 + urgency_score * 0.35, 2), reason=reason)

# ==================== ACTIVITY ANALYTICS ENDPOINTS ====================

@app.get("/api/activity", response_model=List[DeveloperActivityItem])
async def get_developer_activity(days: int = 7, db=Depends(get_database)):
    """Developer activity tracking by actions and task events."""
    users_collection = db[USERS_COLLECTION]
    actions_collection = db[USER_ACTIONS_COLLECTION]
    tasks_collection = db[TASKS_COLLECTION]

    users = []
    async for user in users_collection.find():
        users.append(user)

    min_timestamp = int(time.time() * 1000) - (max(1, days) * 24 * 60 * 60 * 1000)
    activity_by_user = {
        u["id"]: {
            "userId": u["id"],
            "userName": u.get("name", "Unknown"),
            "actions": 0,
            "completedTasks": 0,
            "commentsAdded": 0,
            "statusChanges": 0,
            "score": 0.0,
        }
        for u in users
    }

    async for action in actions_collection.find({"timestamp": {"$gte": min_timestamp}}):
        uid = action.get("userId")
        if uid not in activity_by_user:
            continue
        activity_by_user[uid]["actions"] += 1
        action_type = action.get("actionType", "")
        if action_type == "task_completed":
            activity_by_user[uid]["completedTasks"] += 1
        elif action_type == "task_comment_added":
            activity_by_user[uid]["commentsAdded"] += 1
        elif action_type in ["task_status_changed", "task_status_change"]:
            activity_by_user[uid]["statusChanges"] += 1

    async for task in tasks_collection.find({"updatedAt": {"$gte": min_timestamp}}):
        task_doc = normalize_task_doc({k: v for k, v in task.items() if k != "_id"})
        for event in task_doc.get("history", []):
            if event.get("createdAt", 0) < min_timestamp:
                continue
            uid = event.get("actorId") or task_doc.get("assigneeId")
            if uid not in activity_by_user:
                continue
            action_name = event.get("action", "")
            if action_name == "TASK_COMPLETED":
                activity_by_user[uid]["completedTasks"] += 1
            elif action_name == "COMMENT_ADDED":
                activity_by_user[uid]["commentsAdded"] += 1
            elif action_name == "STATUS_CHANGED":
                activity_by_user[uid]["statusChanges"] += 1

    result = []
    for item in activity_by_user.values():
        item["score"] = round(item["actions"] * 0.2 + item["completedTasks"] * 1.2 + item["commentsAdded"] * 0.4 + item["statusChanges"] * 0.5, 2)
        result.append(DeveloperActivityItem(**item))

    result.sort(key=lambda x: x.score, reverse=True)
    return result

# ==================== USER ACTIONS ENDPOINTS ====================

@app.post("/api/actions/log", response_model=UserActionResponse)
async def log_action(action_data: UserActionCreate, db=Depends(get_database)):
    """Log a user action"""
    actions_collection = db[USER_ACTIONS_COLLECTION]
    
    action_dict = {
        "id": generate_id("ACTION"),
        "userId": action_data.userId,
        "actionType": action_data.actionType,
        "taskId": action_data.taskId,
        "timestamp": int(time.time() * 1000),
        "details": action_data.details or {}
    }
    
    await actions_collection.insert_one(action_dict)
    
    response = {k: v for k, v in action_dict.items() if k != "_id"}
    return UserActionResponse(**response)

@app.get("/api/actions/{user_id}", response_model=List[UserActionResponse])
async def get_user_actions(user_id: str, limit: int = 100, db=Depends(get_database)):
    """Get user actions"""
    actions_collection = db[USER_ACTIONS_COLLECTION]
    
    actions = []
    async for action in actions_collection.find({"userId": user_id}).sort("timestamp", -1).limit(limit):
        action_dict = {k: v for k, v in action.items() if k != "_id"}
        actions.append(UserActionResponse(**action_dict))
    
    return actions

# ==================== PERFORMANCE ENDPOINTS ====================

@app.get("/api/performance/{user_id}", response_model=PerformanceMetrics)
async def get_performance_metrics(user_id: str, db=Depends(get_database)):
    """Get user performance metrics"""
    tasks_collection = db[TASKS_COLLECTION]
    
    # Get all tasks for user
    all_tasks = await tasks_collection.count_documents({"assigneeId": user_id})
    completed = await tasks_collection.count_documents({
        "assigneeId": user_id,
        "status": TaskStatus.COMPLETED.value
    })
    
    # Calculate on-time vs late completions (simplified)
    on_time = 0
    late = 0
    
    async for task in tasks_collection.find({
        "assigneeId": user_id,
        "status": TaskStatus.COMPLETED.value
    }):
        if task.get("updatedAt", 0) <= task.get("deadline", 0):
            on_time += 1
        else:
            late += 1
    
    # Calculate reliability score
    if all_tasks > 0:
        reliability = (completed / all_tasks) * 0.7 + (on_time / max(completed, 1)) * 0.3
    else:
        reliability = 0.5
    
    # Update user's reliability score
    users_collection = db[USERS_COLLECTION]
    await users_collection.update_one(
        {"id": user_id},
        {"$set": {"reliabilityScore": reliability}}
    )
    
    return PerformanceMetrics(
        userId=user_id,
        totalTasksAssigned=all_tasks,
        tasksCompleted=completed,
        tasksCompletedOnTime=on_time,
        tasksCompletedLate=late,
        reliabilityScore=reliability
    )

# ==================== MAIN ====================

if __name__ == "__main__":
    import uvicorn
    # Disable reload for stable execution from batch scripts on Windows paths with spaces.
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
