// Visual timeline component - shows a day's events as positioned blocks on a time grid
// Replaces flat card list with a calendar-like view
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
  // Convert to JST
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return jst.getHours() + jst.getMinutes() / 60;
}

export function TimelineView({ events, now, onEventPress }: Props) {
  const allDayEvents = events.filter((e) => e.start.date && !e.start.dateTime);
  const timedEvents = events.filter((e) => e.start.dateTime && e.end.dateTime);

  const getTop = (dateTime: string) => {
    const h = getHourFraction(dateTime);
    return Math.max(0, (h - START_HOUR) * HOUR_HEIGHT);
  };

  const getHeight = (start: string, end: string) => {
    const sh = getHourFraction(start);
    const eh = getHourFraction(end);
    const diff = eh - sh;
    return Math.max(diff * HOUR_HEIGHT, 28);
  };

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

        {/* Event blocks */}
        {timedEvents.map((e) => {
          const top = getTop(e.start.dateTime!);
          const height = getHeight(e.start.dateTime!, e.end.dateTime!);
          const endTime = new Date(e.end.dateTime!).getTime();
          const startTime = new Date(e.start.dateTime!).getTime();
          const isPast = endTime < now.getTime();
          const isCurrent = startTime <= now.getTime() && endTime > now.getTime();

          return (
            <TouchableOpacity
              key={e.id}
              style={[
                styles.eventBlock,
                { top, height },
                isPast && styles.eventPast,
                isCurrent && styles.eventCurrent,
              ]}
              onPress={() => onEventPress(e)}
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
                style={[styles.eventTitle, isPast && styles.eventTitlePast]}
                numberOfLines={1}
              >
                {e.summary}
              </Text>
              {height > 36 && (
                <Text style={[styles.eventTime, isPast && styles.eventTimePast]}>
                  {formatTimeShort(e.start.dateTime!)} – {formatTimeShort(e.end.dateTime!)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

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
  // All-day events
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

  // Hour grid
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

  // Event blocks
  eventBlock: {
    position: 'absolute',
    left: LABEL_WIDTH + 8,
    right: 8,
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
  eventTitlePast: {
    color: '#94A3B8',
  },
  eventTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  eventTimePast: {
    color: '#B0BEC5',
  },

  // Status badges
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

  // Now indicator
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
