/** Typed analytics event tracker with a pluggable sink (seam for a real provider). */

export type AnalyticsEvent =
  | "game_start"
  | "game_over"
  | "line_clear"
  | "purchase"
  | "level_complete"
  | "daily_play"
  | "booster_used"
  | "special_used";

export type AnalyticsSink = (
  e: AnalyticsEvent,
  props?: Record<string, unknown>
) => void;

const defaultSink: AnalyticsSink = (e, props) => {
  console.debug("[analytics]", e, props ?? {});
};

class AnalyticsTracker {
  private sink: AnalyticsSink = defaultSink;

  setSink(fn: AnalyticsSink): void {
    this.sink = fn;
  }

  track(e: AnalyticsEvent, props?: Record<string, unknown>): void {
    this.sink(e, props);
  }
}

export const Analytics = new AnalyticsTracker();
