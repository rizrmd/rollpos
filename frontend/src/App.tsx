import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function App() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>RollPOS</CardTitle>
          <CardDescription>
            Vite + React + TypeScript + shadcn/ui, managed with Bun.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Design system is ready. Add more components with{" "}
            <code className="font-mono text-xs">bunx shadcn@latest add</code>.
          </p>
          <Button>Get started</Button>
          <p className="font-mono text-xs text-muted-foreground">
            Press <kbd>d</kbd> to toggle dark mode
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
