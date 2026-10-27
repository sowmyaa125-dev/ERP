<div align="center">

# 🏭 ERP – Inventory, Sales & Purchase Management

**A multi-company ERP for small and growing businesses. It covers masters, stock, purchases, sales, payments and GST reports in one place.**

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?style=for-the-badge&logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/Django_REST_Framework-3.18-A30000?style=for-the-badge&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)

[Features](#-features) · [Tech Stack](#-tech-stack) · [Architecture](#-architecture) · [Getting Started](#-getting-started) · [Screenshots](#-screenshots)

</div>

---

## 📌 Overview

This ERP is a full-stack web application built with a **Django REST Framework** backend and a **React (Vite)** frontend. It supports **multiple companies**, each with its own branches, departments, roles, warehouses and users. Every company's data stays separate from the others.

The same React codebase runs as **two portals**:

| Portal | Who uses it | Local URL |
|---|---|---|
| 🏢 **Company ERP** | Registered companies and their main / sub companies | `http://localhost:5173` |
| 🛡️ **Super Admin Portal** | Platform administrators | `http://localhost:5174` |

---

## ✨ Features

### 🔐 Authentication & Access
- Email login with **JWT access/refresh tokens**, token rotation and **logout blacklisting**
- **Company self-registration with email OTP verification**
- Super Admin **approves or rejects** new company registrations
- OTP-verified **password change**, plus credentials sent by email
- Role-based access, with each account limited to its own portal

### 🏢 Company Setup
- Companies, **branches**, **departments** and **roles**
- Main / sub-company structure

### 📚 Masters
- Groups, sub-groups, categories, sub-categories and **brands**
- **GST master** (tax slabs), **unit master** and **warehouses**
- **Customers** and **suppliers**

### 📦 Products & Stock
- Products with **HSN code** and GST type (taxable / exempt)
- Stock per warehouse with a full **stock movement ledger**: purchase in, sale out and transfers in/out

### 🛒 Purchases
- **Purchase Orders → Goods Receipt (GRN) → Purchase Bills**
- Goods receipts automatically add stock to the warehouse

### 💰 Sales
- **Quotations → Sales Orders → GST Tax Invoices**
- Invoices automatically deduct stock from the warehouse
- **Printable invoices** with line items and tax breakdown

### 💳 Payments
- Record payments and **allocate them against invoices and bills**
- Track outstanding balances on payable documents

### 📊 Reports & Dashboard
- Interactive **dashboard** with charts (Recharts)
- **Sales**, **Purchase**, **GST** and **Stock** reports

### 🛡️ Super Admin Console
- Separate admin portal with a JSON mirror of every Django admin page
- Manage companies, users and platform data from one place

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, Django 5.2, Django REST Framework, SimpleJWT, django-cors-headers |
| **Frontend** | React 19, Vite 7, React Router 7, Axios, Bootstrap 5, Recharts |
| **Database** | MySQL |
| **PDF / Docs** | ReportLab |
| **Email** | SMTP (OTP codes, credentials) |
| **Other** | `india-state-district` for Indian state/district selection |

---

## 🏗️ Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Company ERP  (:5173)    │        │  Super Admin  (:5174)    │
│  React + Vite            │        │  React + Vite (admin)    │
└────────────┬─────────────┘        └─────────────┬────────────┘
             │      REST API + JWT (Axios)        │
             └────────────────┬───────────────────┘
                              ▼
               ┌──────────────────────────────┐
               │  Django REST API  (:8000)    │
               │  accounts · companies ·      │
               │  masters · products · stock ·│
               │  purchases · sales ·         │
               │  payments · reports ·        │
               │  adminpanel                  │
               └──────────────┬───────────────┘
                              ▼
                       ┌─────────────┐
                       │    MySQL    │
                       └─────────────┘
```

### 📁 Project Structure

```
ERP/
├── ERP-BACK/                 # Django REST API
│   ├── config/               # settings, root URLs
│   ├── accounts/             # custom User, JWT login, OTP registration
│   ├── companies/            # companies, branches, departments, roles
│   ├── masters/              # groups, categories, brands, GST, units, warehouses
│   ├── customers/  suppliers/
│   ├── products/  stock/     # products, stock & stock movements
│   ├── purchases/            # PO, goods receipt, purchase bill
│   ├── sales/                # quotation, sales order, sales invoice
│   ├── payments/             # payments & allocations
│   ├── reports/              # dashboard, sales, purchase, GST, stock reports
│   ├── adminpanel/           # Super Admin data API
│   └── common/               # shared base classes & utilities
│
└── ERP-FRONT/                # React + Vite frontend
    └── src/
        ├── api/              # Axios client with token refresh
        ├── components/       # layout, forms, line-items editor, modals
        ├── context/  hooks/  utils/
        └── pages/            # Dashboard, Sales, Purchases, Stock, Reports, ...
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.12+
- Node.js 20+
- MySQL 8

### 1️⃣ Clone the repository
```bash
git clone https://github.com/sowmyaa125-dev/ERP.git
cd ERP
```

### 2️⃣ Backend setup
```bash
cd ERP-BACK
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
```

Create the database:
```sql
CREATE DATABASE erp_database CHARACTER SET utf8mb4;
```

Copy the environment file and fill in your values:
```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | MySQL connection |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP for OTP and credential emails |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | Production only |
| `CORS_EXTRA_ORIGINS`, `COMPANY_LOGIN_URL`, `ADMIN_LOGIN_URL` | Production only |

Run migrations, create a Super Admin and start the API:
```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
The API runs at **http://127.0.0.1:8000/api**.

### 3️⃣ Frontend setup
```bash
cd ../ERP-FRONT
npm install
npm run dev          # Company ERP     → http://localhost:5173
npm run dev:admin    # Super Admin     → http://localhost:5174
```

### 🏗️ Production build
```bash
npm run build          # Company ERP  → dist/
npm run build:admin    # Super Admin  → dist-admin/
```
Set `VITE_API_URL`, `VITE_COMPANY_APP_URL` and `VITE_ADMIN_APP_URL` at build time if your server uses different addresses.

---

## 🧪 Running Tests
```bash
cd ERP-BACK
python manage.py test
```

---

## 📸 Screenshots

> _Add screenshots of your app here, e.g. `docs/screenshots/dashboard.png`._

| Dashboard | Sales Invoice |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Invoice](docs/screenshots/invoice.png) |

---

## 🗺️ Roadmap
- [ ] Export reports to Excel / PDF
- [ ] Stock transfer approvals between warehouses
- [ ] Docker setup for one-command deployment

---

## 👩‍💻 Author

**Sowmiya P**, Full Stack Developer (Python · Django · React)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sowmiya-p-5a7a01349)
[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:sowmyaa125@gmail.com)

<div align="center">

⭐ If you found this project useful, consider giving it a star!

</div>
