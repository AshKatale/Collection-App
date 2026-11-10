# 💰 Daily Money Collection App (Siddhivinayak Mandal)

A full-stack, multi-tenant daily money collection and accounting system built with **React (JavaScript)** and **Express.js (Node.js)** with **PostgreSQL (Neon)** and **Prisma ORM**.

---

## 🚀 System Architecture

```
Collectors-App/
├── backend/                   # Express.js REST API
│   ├── prisma/                # Prisma schema & seed script
│   │   ├── schema.prisma      # Multi-tenant data models
│   │   └── seed.js            # Initial admin seed script
│   ├── src/
│   │   ├── controllers/       # Auth, Customers, Collectors, Entries, Reports, Admin
│   │   ├── middleware/        # JWT verification & role scoping
│   │   ├── routes/            # REST API route handlers
│   │   ├── utils/             # ExcelJS report generator & financial year helpers
│   │   └── index.js           # Server entry point
│   ├── .env                   # Database URL, JWT secret, Port
│   └── package.json
│
└── frontend/                  # React 19 + Vite + Tailwind CSS
    ├── src/
    │   ├── api/               # Axios services with automatic JWT injection
    │   ├── components/        # Layout (Sidebar, Navbar), Forms, Tables, Modals
    │   ├── context/           # AuthContext (login, logout, session management)
    │   ├── pages/             # All application views
    │   │   ├── Login.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Collect.jsx    # Collector's daily recording station
    │   │   ├── Customers.jsx  # Member management
    │   │   ├── Collectors.jsx # Collector management & customer assignment
    │   │   ├── Entries.jsx    # Full collection ledger view & editing
    │   │   ├── reports/       # Daily, Monthly Matrix, Financial Year, Customer Statements
    │   │   └── admin/         # Global user management & system settings
    │   ├── utils/             # Client-side Excel & PDF exporters (SheetJS, jsPDF)
    │   └── App.jsx            # Protected routing with role guards
    ├── package.json
    └── vite.config.js         # API proxy configured to localhost:5000
```

---

## 👥 Role Hierarchy & Access Control

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Admin** | Global (all owners & collectors) | • Manage all users (create Owners, Collectors, Admins)<br>• View & edit any collection entry<br>• Access all organization reports<br>• System diagnostics & configuration |
| **Owner** | Organization-wide | • Create & manage collectors under their account<br>• Create & manage customers belonging to their organization<br>• Assign specific customer subsets to individual collectors<br>• View and edit all collection entries made by their collectors<br>• Access and download all organization reports (Daily, Monthly, Yearly, Customer) |
| **Collector** | Assigned customers only | • Daily Collection Station (`/collect`): enter daily collections for assigned members only<br>• Record **Savings**, **Loan Repayments**, and **Interest**<br>• View immediate daily audit log and running daily total<br>• Cannot see or modify collections of unassigned customers |

---

## 📊 Reports (Matching Ledger Formats)

1. **Daily Report** (`/reports/daily`):
   - Collector-wise breakdown of Savings, Loan Repayment, Interest, and Total collected on any selected date.
   - Excel (`.xlsx`) and PDF export.

2. **Monthly Sheet Matrix** (`/reports/monthly`):
   - **Exact match to the reference ledger format**:
     - Rows = Customers (`Sr`, `Account No · Customer Name`)
     - Columns = Days 1 to 28/30/31
     - Last Column = Customer Monthly Total
     - Bottom Row = Daily Total for each day + Grand Monthly Total
   - Filterable by collection type (All, Savings only, Loan only, Interest only).
   - Landscape PDF & Excel export.

3. **Financial Year Report** (`/reports/yearly`):
   - Customer × Month (April through March financial cycle) with row and column totals.
   - Excel and PDF export.

4. **Customer Statement** (`/reports/customer`):
   - Transaction ledger for individual customer accounts with custom date range filtering.

---

## 🔑 Default Credentials

- **Email**: `admin@admin.com`
- **Password**: `admin123`

---

## 🛠️ How to Run Locally

### 1. Backend Server
```powershell
cd d:\hackathon\Collectors-App\backend
npm run dev
# Starts backend at http://localhost:5000
```

### 2. Frontend Development Server
```powershell
cd d:\hackathon\Collectors-App\frontend
npm run dev
# Starts frontend at http://localhost:5173
```

---

## ☁️ Free Cloud Deployment Guide

### Database (Neon PostgreSQL — Free Forever)
- Already integrated using serverless Neon connection pooler.

### Backend (Render.com — Free Web Service)
1. Push `backend/` directory to a GitHub repository.
2. In Render dashboard, click **New Web Service** and select the repository.
3. Set **Root Directory** to `backend`.
4. Build Command: `npm install && npx prisma generate`
5. Start Command: `npm start`
6. Add Environment Variables:
   - `DATABASE_URL`: Your Neon connection string
   - `JWT_SECRET`: Random 32+ character string
   - `PORT`: `10000`
   - `FRONTEND_ORIGINS`: Comma-separated deployed frontend origins

### Frontend (Vercel — Free Hobby Plan)
1. In Vercel dashboard, click **Add New Project** and select your repository.
2. Set **Root Directory** to `frontend`.
3. Framework Preset: `Vite`
4. Add Environment Variable:
   - `VITE_API_BASE_URL`: URL of your deployed Render backend (e.g., `https://your-app.onrender.com/api`)
   - `VITE_ALLOWED_HOSTS`: Comma-separated Vite development hostnames for tunnels such as ngrok
