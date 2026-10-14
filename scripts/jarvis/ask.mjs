// Answers a comment on the "Ask Jarvis" issue. Env: COMMENT_BODY, ISSUE_NUMBER, JARVIS_TOKEN, GH_TOKEN, optional GEMINI_API_KEY.
import { execFileSync } from "node:child_process"
import { cfg, loadBoard, respond } from "./lib.mjs"

const repo = `${cfg.owner}/${cfg.repo}`
const text = process.env.COMMENT_BODY ?? ""
if (!/^\s*\//.test(text)) process.exit(0)

let reply
try {
  reply = await respond(text, await loadBoard())
} catch (e) {
  console.error(e)
  reply = "Jarvis could not read the board just now. The run log has details."
}
if (!reply) process.exit(0)
if (process.env.DRY_RUN) { console.log(reply); process.exit(0) }
execFileSync("gh", ["issue", "comment", process.env.ISSUE_NUMBER, "--repo", repo, "--body", reply])
