# University Admission Exam System — Frontend

## Files

| File | Purpose |
|---|---|
| `index.html` | Student exam PWA (login + exam + submitted) |
| `dashboard.html` | Admin + Invigilator real-time dashboard |
| `sw.js` | Service worker (offline shell caching) |
| `manifest.json` | PWA manifest (add to home screen) |

---

## Setup

### 1. Configure API URL
Both HTML files use `window.location.origin` as the API base — meaning the FastAPI backend
must be served from the same domain. If you're running locally:

- Backend: `http://localhost:8000`
- Frontend: served by FastAPI's StaticFiles from `http://localhost:8000`

Everything works with zero configuration.

If frontend and backend are on separate domains, update `const API = '...'` in both files.

### 2. Place files in backend
```
/backend
  main.py
  ...
/frontend        ← place all 4 files here
  index.html
  dashboard.html
  sw.js
  manifest.json
```

FastAPI serves them via:
```python
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
```

### 3. Add icons (optional but recommended for PWA)
Add `icon-192.png` and `icon-512.png` to the frontend folder.
These are the app icons shown when students add the exam to their home screen.

---

## Excel Import — Column Mapping

Your Excel export from the application form maps as follows:

| Your Excel Column | System Field |
|---|---|
| Student's Name | name_en |
| Parent's Name | parent_name |
| Mobile Number* | mobile |
| Email address | email |
| Course * | course |
| Examination Center | examination_centre |
| Date of Birth * | dob |
| Gender * | gender |
| Admission Year * | admission_year |

**Roll numbers are auto-generated** as: `YYYY` + 4-digit index (e.g. `20250001`, `20250002`...)

**Paper sets are assigned by the backend** based on centre ID.

---

## How Import Works

1. Admin opens `dashboard.html` and logs in
2. Clicks **Import Students**
3. Uploads the `.xlsx` file from the application system
4. System parses and previews first 10 rows
5. Admin confirms → rows sent to `POST /api/admin/import`
6. Backend assigns centre IDs, paper sets, and generates roll numbers
7. Students now appear in the dashboard

---

## Anti-Cheat Events Detected

| Event | Trigger |
|---|---|
| `visibility_hidden` | Student switches app or presses home |
| `window_blur` | Browser loses focus |
| `exited_fullscreen` | Student exits fullscreen mode |
| `devtools_open` | DevTools detected (desktop) |

Each event is logged with timestamp and current question index.
After 3 strikes: student status changes to `flagged`, dashboard shows red alert.

---

## Dashboard Access

| Role | URL | Sees |
|---|---|---|
| Admin | `/dashboard.html` | All centres, import, export |
| Invigilator | `/dashboard.html` | Their centre only, read-only |

Roles and centre assignments are configured in the `admins` database table.

---

## Deployment (Production)

1. Run FastAPI with uvicorn behind nginx
2. Enable HTTPS (required for PWA fullscreen and service worker)
3. nginx config:
```nginx
server {
    listen 443 ssl;
    server_name yourexamdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

The `Upgrade` and `Connection` headers are required for WebSocket real-time updates.
