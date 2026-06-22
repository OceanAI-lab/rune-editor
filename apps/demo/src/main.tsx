import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics — only collects when served from Vercel. */}
    <Analytics />
  </StrictMode>,
)
