import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { database } from "@/db/database.ts"
import { DatabaseProvider } from "@/db/database-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <DatabaseProvider database={database}>
        <App />
      </DatabaseProvider>
    </ThemeProvider>
  </StrictMode>
)
