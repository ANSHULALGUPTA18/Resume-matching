"""
Migration Script: Clear Old 384-d Embeddings
Run this to clear incompatible embeddings from the old all-MiniLM-L6-v2 model
before switching to BAAI/bge-large-en-v1.5 (1024-d)
"""
import os
import sys
from pymongo import MongoClient

# MongoDB connection
MONGO_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/ats_resume_optimizer')

def clear_old_embeddings():
    """Remove all embeddings from jobs and candidates to prevent dimension mismatch"""
    try:
        client = MongoClient(MONGO_URI)
        db = client.get_database()
        
        print("=" * 60)
        print("Clearing old embeddings from database...")
        print("=" * 60)
        
        # Update jobs - remove embedding and keep everything else
        jobs_result = db.jobs.update_many(
            {},
            {"$unset": {"embedding": ""}}
        )
        print(f"✓ Cleared embeddings from {jobs_result.modified_count} job(s)")
        
        # Update candidates - remove embedding and semanticScore
        candidates_result = db.candidates.update_many(
            {},
            {"$unset": {"embedding": "", "semanticScore": ""}}
        )
        print(f"✓ Cleared embeddings from {candidates_result.modified_count} candidate(s)")
        
        print("=" * 60)
        print("Migration complete!")
        print("You can now upload new jobs and resumes with BGE-large embeddings.")
        print("=" * 60)
        
        client.close()
        
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    confirm = input("This will remove all existing embeddings. Continue? (yes/no): ")
    if confirm.lower() in ['yes', 'y']:
        clear_old_embeddings()
    else:
        print("Migration cancelled.")
