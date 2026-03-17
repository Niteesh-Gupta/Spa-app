# Changelog — Special Price Approval System

## [v4.0] — 2026-03-18
### Added
- Role-based filtering — each role sees only their own queue
- RSM sees only Pending RSM requests
- ZSM sees only Pending ZSM requests  
- NSM sees only Pending NSM requests
- CM sees only Pending CM requests
- TM sees only their own submitted requests
- SC sees only Approved requests awaiting feasibility
- Role-aware Approve/Reject buttons — only shown to relevant approver
- GitHub Desktop workflow set up for professional deployments

### Fixed
- _role variable scope error resolved

---

## [v3.0] — 2026-03-17
### Added
- Role-based login screen with 6 role cards
- Role banner showing logged-in user and pending count
- Switch Role functionality
- Role-coloured avatar in topbar

---

## [v2.0] — 2026-03-17
### Added
- Deal stage tagging — Quotation / Negotiation / Final / Revised
- Discount-based approval tier routing — RSM / ZSM / NSM / CM
- Country Manager additional info form for >40% discounts
- Rejection and re-raise workflow with history chain
- AI Advisor with pre-submission analysis
- Supply Chain parallel approval track

---

## [v1.0] — 2026-03-17
### Added
- Initial prototype
- Dashboard with KPI cards
- Request table with Approve / Reject actions
- Multi-level approval timeline
- Sample data with 10 requests
```

5. Commit message: `docs: add CHANGELOG`
6. Commit

---

### Thing 2 — Move the Word doc into a docs folder (3 min)

Right now `SPA_Project_Documentation.docx` is sitting loose in the repo root. Professionals keep docs in a folder.

**Do this in GitHub Desktop:**
1. Open your `Documents/GitHub/Spa-app` folder in Explorer
2. Create a new folder called `docs`
3. Move `SPA_Project_Documentation.docx` into that `docs` folder
4. GitHub Desktop will show the change
5. Commit message: `chore: move documentation into docs folder`
6. Push

---

### Thing 3 — Save a session note in OneDrive (7 min)

You already have OneDrive — I saw it in your Explorer earlier (`OneDrive → Niteesh Personal`).

**Do this:**
1. Open OneDrive → create folder: `Learning → AI-AgentDev → SPA-System`
2. Inside it create a Word doc called `Session_Notes.docx`
3. Paste this and save:
```
SESSION LOG — SPA System Development

DATE: 18 March 2026  
SESSION: 2 (continuation from 17 March)

WHAT WAS BUILT:
- v4: Role-based filtering live on spa-app-orpin.vercel.app
- GitHub Desktop set up — professional deploy workflow
- CHANGELOG.md created in repo
- Documentation organised into docs/ folder

WHAT WAS LEARNED:
- GitHub Desktop workflow: copy file → commit → push → auto-deploy
- Git diff — green = added, red = removed
- var scope in JavaScript — variables must be declared before use
- Conventional commit messages: feat: / fix: / docs: / chore:
- Never share GitHub tokens in chat

DECISIONS MADE:
- GitHub Desktop is permanent deploy tool going forward
- All docs live in docs/ folder in repo
- Session notes saved in OneDrive/Learning/AI-AgentDev/SPA-System

NEXT SESSION:
- Supabase database — data persists across sessions
- Email notifications via n8n
- Update documentation to v4
