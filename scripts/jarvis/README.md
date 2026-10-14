# Jarvis

Reads the "Tany Delivery" GitHub Project and reports on it, inside GitHub.

- **Daily digest** (`.github/workflows/jarvis-digest.yml`): every day at 09:00 IST it comments on the "Daily digest" issue.
- **Ask Jarvis** (`.github/workflows/jarvis-ask.yml`): comment `/help`, `/sprint`, `/overdue`, `/blocked`, `/who <name>`, `/sales`, `/marketing`, `/today` or `/jarvis <question>` on the pinned "Ask Jarvis" issue.

Only people with write access to the repo can use it. It never changes tasks, and issue bodies are never sent to the AI.

## Secrets (repo Settings > Secrets and variables > Actions)
- `JARVIS_TOKEN`: a *classic* personal access token with `repo` and `read:project`. GITHUB_TOKEN cannot read a user-owned project.
- `GEMINI_API_KEY`: optional. Without it only the `/` commands work. Optional repo variable `JARVIS_MODEL`.

## Try it locally (read-only, prints instead of posting)
```
JARVIS_TOKEN=$(gh auth token) DRY_RUN=1 node scripts/jarvis/digest.mjs
JARVIS_TOKEN=$(gh auth token) DRY_RUN=1 COMMENT_BODY="/who gokul" node scripts/jarvis/ask.mjs
```
Sprint dates and the team list are in `config.json`; update them when a sprint is added.
