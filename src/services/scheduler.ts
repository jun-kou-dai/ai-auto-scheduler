// Phase D3: Local deterministic scheduler (NOT AI)
// Priority: 1) deadline近い 2) priority高 3) duration長
import { Task, FreeSlot, Proposal, ProposalEvent, UnassignedTask } from '../types';

const PRIORITY_WEIGHT: Record<string, number> = { '高': 3, '中': 2, '低': 1 };

// Normalize deadline: date-only strings → end of that day (23:59 local time)
function normalizeDeadline(deadline: string | null): Date | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;

  // Date-only string like "2026-02-14" → JS parses as UTC midnight
  // which makes the deadline effectively too early (9:00 AM JST).
  // Detect: no 'T' in the string → treat as end-of-day local time.
  if (!deadline.includes('T')) {
    const parts = deadline.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59);
    }
  }

  return d;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // 1. Deadline closer first (null = no deadline = later)
    if (a.deadline && b.deadline) {
      const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (diff !== 0) return diff;
    } else if (a.deadline && !b.deadline) {
      return -1;
    } else if (!a.deadline && b.deadline) {
      return 1;
    }

    // 2. Higher priority first
    const pa = PRIORITY_WEIGHT[a.priority] || 2;
    const pb = PRIORITY_WEIGHT[b.priority] || 2;
    if (pa !== pb) return pb - pa;

    // 3. Longer duration first
    return b.duration_minutes - a.duration_minutes;
  });
}

function getPreferredHourRange(pref: Task['preferred_time']): [number, number] | null {
  switch (pref) {
    case '午前': return [9, 12];
    case '午後': return [12, 18];
    case '夜': return [18, 21];
    default: return null;
  }
}

export function generateProposal(tasks: Task[], freeSlots: FreeSlot[]): Proposal {
  const sortedTasks = sortTasks(tasks);
  const events: ProposalEvent[] = [];
  const unassigned: UnassignedTask[] = [];

  // Track remaining free slots (mutable copy)
  const remainingSlots = freeSlots.map((s) => ({
    start: new Date(s.start),
    end: new Date(s.end),
    durationMinutes: s.durationMinutes,
  }));

  for (const task of sortedTasks) {
    const needed = task.duration_minutes;
    let placed = false;
    const deadlineDate = normalizeDeadline(task.deadline);

    // Try preferred time slots first
    const prefRange = getPreferredHourRange(task.preferred_time);

    // Score and sort slots: prefer slots matching preferred_time
    const scoredSlots = remainingSlots
      .map((slot, idx) => {
        let score = 0;
        const slotHour = slot.start.getHours();
        if (prefRange && slotHour >= prefRange[0] && slotHour < prefRange[1]) {
          score += 10;
        }
        // Prefer earlier slots
        score -= idx * 0.01;
        return { slot, idx, score };
      })
      .sort((a, b) => b.score - a.score);

    for (const { slot, idx } of scoredSlots) {
      if (slot.durationMinutes >= needed) {
        // Check deadline constraint
        const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
        if (deadlineDate && proposedEnd > deadlineDate) {
          continue; // Would exceed deadline
        }

        const eventStart = slot.start.toISOString();
        const eventEnd = proposedEnd.toISOString();

        events.push({
          taskId: task.id,
          title: task.name,
          start: eventStart,
          end: eventEnd,
        });

        // Shrink the slot
        remainingSlots[idx] = {
          start: proposedEnd,
          end: slot.end,
          durationMinutes: (slot.end.getTime() - proposedEnd.getTime()) / 60000,
        };

        // Remove slot if too small
        if (remainingSlots[idx].durationMinutes < 15) {
          remainingSlots.splice(idx, 1);
        }

        placed = true;
        break;
      }
    }

    // Fallback: if deadline prevented placement, retry ignoring deadline
    if (!placed && deadlineDate) {
      for (const { slot, idx } of scoredSlots) {
        if (slot.durationMinutes >= needed) {
          const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
          const eventStart = slot.start.toISOString();
          const eventEnd = proposedEnd.toISOString();

          const deadlineLabel = deadlineDate.toLocaleDateString('ja-JP');
          events.push({
            taskId: task.id,
            title: task.name,
            start: eventStart,
            end: eventEnd,
            warning: `締切（${deadlineLabel}）を過ぎていますが、最短の空き枠に配置しました`,
          });

          remainingSlots[idx] = {
            start: proposedEnd,
            end: slot.end,
            durationMinutes: (slot.end.getTime() - proposedEnd.getTime()) / 60000,
          };
          if (remainingSlots[idx].durationMinutes < 15) {
            remainingSlots.splice(idx, 1);
          }

          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      // Determine reason
      let reason: string;
      const totalFree = remainingSlots.reduce((sum, s) => sum + s.durationMinutes, 0);

      if (totalFree < needed) {
        reason = `空き時間が不足（必要: ${needed}分、残り: ${Math.round(totalFree)}分）。来週の配置を検討してください。`;
      } else {
        reason = `${needed}分以上の連続空き枠が見つかりません。タスクの分割を検討してください。`;
      }

      unassigned.push({ taskId: task.id, reason });
    }
  }

  return { events, unassigned };
}
