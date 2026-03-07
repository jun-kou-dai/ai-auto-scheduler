// Visual timeline component - shows a day's events as positioned blocks on a time grid
// Handles overlapping events by placing them side-by-side in columns
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CalendarEvent } from '../types';

interface Props {
  events: CalendarEvent[];
  now: Date;
  onEventPress: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT = 56;
const START_HOUR = 6;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const LABEL_WIDTH = 38;

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getHourFraction(iso: string): number {
  const d = new Date(iso);
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return jst.getHours() + jst.getMinutes() / 60;
}

// --- Overlap layout engine ---

interface LayoutedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

function layoutEvents(timedEvents: CalendarEvent[]): LayoutedEvent[] {
  if (timedEvents.length === 0) return [];

  // Sort by start time, then longer events first
  const sorted = [...timedEvents].sort((a, b) => {
    const aStart = getHourFraction(a.start.dateTime!);
    const bStart = getHourFraction(b.start.dateTime!);
    if (Math.abs(aStart - bStart) > 0.01) return aStart - bStart;
    const aDur = getHourFraction(a.end.dateTime!) - aStart;
    const bDur = getHourFraction(b.end.dateTime!) - bStart;
    return bDur - aDur;
  });

  // Greedy column assignment
  const colEnds: number[] = [];
  const items: { event: CalendarEvent; col: number; startH: number; endH: number }[] = [];

  for (const event of sorted) {
    const startH = getHourFraction(event.start.dateTime!);
    const endH = getHourFraction(event.end.dateTime!);

    let col = -1;
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= startH + 0.01) {
        col = c;
        break;
      }
    }
    if (col === -1) {
      col = colEnds.length;
    }
    if (col >= colEnds.length) colEnds.push(0);
    colEnds[col] = endH;
    items.push({ event, col, startH, endH });
  }

  // Build overlap groups (union-find)
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (items[i].startH < items[j].endH && items[j].startH < items[i].endH) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const result: LayoutedEvent[] = [];
  for (const [, indices] of groups) {
    const maxCol = Math.max(...indices.map((i) => items[i].col));
    const totalColumns = maxCol + 1;
    for (const i of indices) {
      const { event, col, startH, endH } = items[i];
      result.push({
        event,
        top: Math.max(0, (startH - START_HOUR) * HOUR_HEIGHT),
        height: Math.max((endH - startH) * HOUR_HEIGHT, 28),
        column: col,
        totalColumns,
      });
    }
  }

  return result;
}

// --- Component ---

export function TimelineView({ events, now, onEventPress }: Props) {
  const allDayEvents = events.filter((e) => e.start.date && !e.start.dateTime);
  const timedEvents = events.filter((e) => e.start.dateTime && e.end.dateTime);
  const layout = layoutEvents(timedEvents);

  const nowJST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const nowHours = nowJST.getHours() + nowJST.getMinutes() / 60;
  const nowTop = (nowHours - START_HOUR) * HOUR_HEIGHT;
  const showNow = nowHours >= START_HOUR && nowHours <= END_HOUR;

  return (
    <View>
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <View style={styles.allDayRow}>
          {allDayEvents.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={styles.allDayChip}
              onPress={() => onEventPress(e)}
              activeOpacity={0.7}
            >
              <Text style={styles.allDayText} numberOfLines={1}>
                {e.summary}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Timeline grid */}
      <View style={{ height: TOTAL_HOURS * HOUR_HEIGHT, position: 'relative' as const }}>
        {/* Hour grid lines */}
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
          <View key={i} style={[styles.hourRow, { top: i * HOUR_HEIGHT }]}>
            <Text style={styles.hourLabel}>
              {String(START_HOUR + i).padStart(2, '0')}
            </Text>
            <View style={styles.hourLine} />
          </View>
        ))}

        {/* Events container - events are positioned with % within this area */}
        <View style={styles.eventsContainer}>
          {layout.map((le) => {
            const endMs = new Date(le.event.end.dateTime!).getTime();
            const startMs = new Date(le.event.start.dateTime!).getTime();
            const isPast = endMs < now.getTime();
            const isCurrent = startMs <= now.getTime() && endMs > now.getTime();
            const isNarrow = le.totalColumns > 1;
            const widthPct = 100 / le.totalColumns;
            const leftPct = (le.column / le.totalColumns) * 100;
            // Gap between columns when side-by-side
            const gapPx = isNarrow ? 2 : 0;

            return (
              <TouchableOpacity
                key={le.event.id}
                style={[
                  styles.eventBlock,
                  {
                    top: le.top,
                    height: le.height,
                    left: `${leftPct}%` as any,
                    width: `${widthPct}%` as any,
                    paddingRight: gapPx + 10,
                  },
                  isPast && styles.eventPast,
                  isCurrent && styles.eventCurrent,
                ]}
                onPress={() => onEventPress(le.event)}
                activeOpacity={0.7}
              >
                {isPast && (
                  <View style={styles.doneBadge}>
                    <Text style={styles.doneBadgeText}>済</Text>
                  </View>
                )}
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>今</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.eventTitle,
                    isPast && styles.eventTitlePast,
                    isNarrow && styles.eventTitleNarrow,
                  ]}
                  numberOfLines={le.height > 50 ? 2 : 1}
                >
                  {le.event.summary}
                </Text>
                {le.height > 36 && (
                  <Text style={[styles.eventTime, isPast && styles.eventTimePast]}>
                    {formatTimeShort(le.event.start.dateTime!)} – {formatTimeShort(le.event.end.dateTime!)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Now indicator */}
        {showNow && (
          <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
            <View style={styles.nowDot} />
            <View style={styles.nowLineBar} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  allDayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    paddingLeft: LABEL_WIDTH + 8,
  },
  allDayChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#818CF8',
  },
  allDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338CA',
  },

  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
  },
  hourLabel: {
    width: LABEL_WIDTH,
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    paddingRight: 8,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // Events are placed inside this container using percentage left/width
  eventsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: LABEL_WIDTH + 8,
    right: 8,
  },

  eventBlock: {
    position: 'absolute',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
  },
  eventPast: {
    backgroundColor: '#F1F5F9',
    borderLeftColor: '#CBD5E1',
  },
  eventCurrent: {
    backgroundColor: '#DBEAFE',
    borderLeftColor: '#3B82F6',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  eventTitleNarrow: {
    fontSize: 11,
  },
  eventTitlePast: {
    color: '#64748B',
  },
  eventTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  eventTimePast: {
    color: '#94A3B8',
  },

  doneBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: '#CBD5E1',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  doneBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  currentBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },

  nowLine: {
    position: 'absolute',
    left: LABEL_WIDTH - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  nowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  nowLineBar: {
    flex: 1,
    height: 2,
    backgroundColor: '#EF4444',
  },
});
