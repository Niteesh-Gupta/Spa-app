# 🏷 Special Price Approval System
**Enterprise Edition · v3.0**

A multi-role web application for managing special price approvals 
in B2B manufacturing sales — built with AI agents (Anthropic Claude).

## 🔗 Live Application
**[spa-app-orpin.vercel.app](https://spa-app-orpin.vercel.app)**

## 👥 Roles Supported
| Role | Approval Authority |
|------|--------------------|
| Territory Manager | Submit requests |
| RSM | Discount < 15% |
| ZSM | Discount 15–30% |
| NSM | Discount 30–40% |
| Country Manager | Discount > 40% |
| Supply Chain | Feasibility confirmation |

## ⚙️ Tech Stack
- **Frontend:** HTML / CSS / Vanilla JS (single file)
- **AI:** Anthropic Claude API
- **Hosting:** Vercel
- **CI/CD:** GitHub → Vercel auto-deploy

## 📁 Repository Structure
```
index.html                    ← Application
docs/
  SPA_Project_Documentation.docx
```

## 🗺 Roadmap
- [x] v1 — Core approval workflow
- [x] v2 — Discount tiers, deal stages, re-raise
- [x] v3 — Role-based login
- [ ] v4 — Supabase database
- [ ] v5 — Email notifications (n8n)
- [ ] v6 — Salesforce integration

## 📄 Documentation
See `docs/SPA_Project_Documentation.docx`

---
*Built by Niteesh Gupta · AI-assisted development · March 2026*
```

**4.** Commit message — type exactly:
```
docs: update README with professional structure and roadmap
