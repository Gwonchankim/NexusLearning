import { redirect } from 'next/navigation'

// The home route just forwards into the app. proxy.ts then bounces anonymous
// users to /login and signed-in users land on the dashboard.
export default function Home() {
  redirect('/dashboard')
}
