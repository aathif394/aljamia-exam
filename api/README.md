# Exam System API

## Setup

### 1. Create the database
```bash
createdb examdb
psql -U postgres -d examdb -f schema.sql
```

### 2. Create first admin account
Generate a bcrypt hash first:
```python
from passlib.context import CryptContext
print(CryptContext(schemes=["bcrypt"]).hash("your_password"))
```
Then insert:
```sql
INSERT INTO centres (name_en) VALUES ('Main Centre');
INSERT INTO admins (username, password_hash, role, centre_id)
VALUES ('admin', '<bcrypt_hash_here>', 'admin', 1);
```

### 3. Environment variables
```bash
export DATABASE_URL="postgresql://user:pass@localhost/examdb"
export REDIS_URL="redis://localhost:6379"
export SECRET_KEY="your-very-long-random-secret-key"
```

### 4. Run
```bash
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Password Format
Generated as: `DDMMYYYY_last4phone`
Example: DOB 15/03/2005, Phone 9876543210 → password is `15032005_3210`
The invigilator announces the format on exam day.

## Anti-Cheat Measures
1. Exam start time lock
2. Tab switch / window blur detection (strike)
3. Fullscreen enforcement
4. DevTools size heuristic
5. Keyboard shortcut blocking
6. Right-click & copy disabled on questions
7. Randomized question order per student
8. 3 strikes → flagged (live dashboard alert)
9. Optional WiFi IP subnet check (admin Config tab)
