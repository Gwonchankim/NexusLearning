// Best-effort awaited telemetry for PR6 funnel events.
//
// logEvent() IS awaited (the log_event RPC completes within the request), but any
// failure is swallowed — a telemetry error must NEVER break the learning action that
// emitted it. It uses the request-scoped user client, so log_event() records the
// caller's auth.uid(). Call only from Server Actions (never during render).
import { createClient } from '@/lib/supabase/server'

export type AnalyticsEventName = 'recommendation_clicked' | 'quest_started'

/** Record a funnel event. Best-effort: awaited, but errors are intentionally ignored. */
export async function logEvent(
  name: AnalyticsEventName,
  props: Record<string, string>,
): Promise<void> {
  try {
    const supabase = await createClient()
    // log_event validates name + a strict per-event props whitelist server-side.
    await supabase.rpc('log_event', { p_name: name, p_props: props })
  } catch {
    // best-effort telemetry: never propagate failures to the learning action
  }
}
