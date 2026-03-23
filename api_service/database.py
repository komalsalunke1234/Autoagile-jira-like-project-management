"""
Database configuration and connection management for MongoDB
"""
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "aeip_db")

# Async Motor client for FastAPI
class Database:
    client: AsyncIOMotorClient = None
    
db = Database()

async def get_database():
    return db.client[DATABASE_NAME]

async def connect_to_mongo():
    """Connect to MongoDB"""
    db.client = AsyncIOMotorClient(MONGODB_URL)
    print(f"✅ Connected to MongoDB at {MONGODB_URL}")
    print(f"✅ Using database: {DATABASE_NAME}")

async def close_mongo_connection():
    """Close MongoDB connection"""
    db.client.close()
    print("❌ Closed MongoDB connection")

# Collection names
USERS_COLLECTION = "users"
PROJECTS_COLLECTION = "projects"
TASKS_COLLECTION = "tasks"
SPRINTS_COLLECTION = "sprints"
USER_ACTIONS_COLLECTION = "user_actions"
ESCALATIONS_COLLECTION = "escalations"
