// Posts the daily digest as a comment on the pinned "Daily digest" issue (created on the first run).
// DRY_RUN=1 prints it instead. Env: JARVIS_TOKEN (read the project), GH_TOKEN (comment on issues; the workflow's GITHUB_TOKEN).
import { execFileSync } from "node:child_process"
import { cfg, digest, loadBoard } from "./lib.mjs"
import { sendDaily } from "./slack.mjs"

const repo = `${cfg.owner}/${cfg.repo}`
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim()

const items = await loadBoard(process.env.JARVIS_TOKEN)
const body = digest(items)
if (process.env.DRY_RUN) { console.log(body); process.exit(0) }

// Slack is optional and never stops the GitHub digest: if it fails, the digest below is still posted.
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL) {
  try { console.log("slack:", (await sendDaily(process.env.SLACK_BOT_TOKEN, process.env.SLACK_CHANNEL, body, items)).join("; ")) } catch (e) { console.error("slack failed:", e.message) }
}

let number = gh("issue", "list", "--repo", repo, "--label", "jarvis-digest", "--state", "open", "--json", "number", "-q", ".[0].number")
if (!number) {
  gh("label", "create", "jarvis-digest", "--repo", repo, "--color", "5319e7", "--force")
  const url = gh("issue", "create", "--repo", repo, "--title", "Daily digest", "--label", "jarvis-digest",
    "--body", "Jarvis posts a summary here every morning (9:00 IST). Subscribe to this issue to get it in your GitHub notifications.")
  number = url.split("/").pop()
}
gh("issue", "comment", number, "--repo", repo, "--body", body)
console.log(`posted digest to #${number}`)
