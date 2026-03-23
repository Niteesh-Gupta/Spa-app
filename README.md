🏷 Special Price Approval System

Prototype · v3.0

A multi-role web application designed to streamline special price approval workflows in B2B manufacturing environments, replacing fragmented Excel/email-based processes with a structured, role-driven system.

🔗 Live Application

https://spa-app-orpin.vercel.app

🎯 Problem Statement

In many sales organizations, special pricing approvals are handled through disconnected channels (Excel, email, WhatsApp), leading to:

Lack of visibility across approval stages
Delays in decision-making
No centralized audit trail
Inconsistent discount governance

This system provides a structured approval workflow aligned with organizational hierarchy.

👥 Roles & Approval Logic
Role	Responsibility
Territory Manager	Create and submit requests
RSM	Approve < 15% discount
ZSM	Approve 15–30% discount
NSM	Approve 30–40% discount
Country Manager	Approve > 40% discount
Supply Chain	Feasibility validation
⚙️ Tech Stack
Frontend: HTML / CSS / Vanilla JS (single-file architecture)
AI Integration: Anthropic Claude API (insight generation)
Hosting: Vercel
Deployment: GitHub → Vercel CI/CD
🏗 Architecture (Current Version)
Fully frontend-based prototype
In-memory request handling (no database yet)
Role-based access simulated via login selection
AI module integrated for contextual insights
🗺 Roadmap
 v1 — Core approval workflow
 v2 — Discount tiers, deal stages, re-raise logic
 v3 — Role-based login & UI control
 v4 — Backend integration (Supabase)
 v5 — Email automation (n8n)
 v6 — CRM integration (Salesforce)

## 📄 Documentation
See `docs/SPA_Project_Documentation.docx`

---
*Built by Niteesh Gupta · AI-assisted development · March 2026*
```

**4.** Commit message — type exactly:
```
docs: update README with professional structure and roadmap
