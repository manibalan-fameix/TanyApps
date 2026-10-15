import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import Jarvis from "./App"

// The block lays itself out inside a centred, full-height container (see "meta.container" in its registry entry).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="jarvis-stage bg-surface flex h-svh min-h-svh w-full min-w-0 items-center justify-center">
      <Jarvis />
    </div>
  </StrictMode>
)
