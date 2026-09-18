#!/usr/bin/env python3
"""
Initialize Database
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models import Base

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("✅ Database tables created successfully!")