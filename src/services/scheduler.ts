// Phase D3: Local deterministic scheduler
// Design: ALWAYS place every task. Never leave tasks unassigned.
// Strategy:
//   1. Try free slots (preferred time match first)
//   2. If deadline blocks placement, place after deadline with warning
//   3. If no free slots at all, force-place (allow double-booking) with warning
import { Task, FreeSlot, Proposal, ProposalEvent } from '../types';
import { parseAsJST, jstToDate, nowJST } from '../utils/timezone';

const PRIORITY_WEIGHT: Record<string, number> = { '高': 3, '中': 2, '低': 1 };

// Normalize deadline: parse as JST, date-only strings → end of that day (23:59 JST)
function normalizeDeadline(deadline: string | null): Date | null {
  if (!deadline) return null;

  // Date-only string like "2026-02-14" → 23:59 JST
  if (!deadline.includes('T')) {
    const parts = deadline.split('-');
    if (parts.length === 3) {
      return jstToDate(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59);
    }
  }

  const d = parseAsJST(deadline);
  if (isNaN(d.getTime())) return null;
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
    case '午前': return [6, 12];
    case '午後': return [12, 18];
    case '夜': return [18, 24];
    default: return null;
  }
}

export function generateProposal(tasks: Task[], freeSlots: FreeSlot[]): Proposal {
  const sortedTasks = sortTasks(tasks);
  const events: ProposalEvent[] = [];

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

    // === Pass 1: Try to fit within deadline in free slots ===
    for (const { slot, idx } of scoredSlots) {
      if (slot.durationMinutes >= needed) {
        const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
        if (deadlineDate && proposedEnd > deadlineDate) {
          continue; // Would exceed deadline, try next
        }

        events.push({
          taskId: task.id,
          title: task.name,
          start: slot.start.toISOString(),
          end: proposedEnd.toISOString(),
        });

        shrinkSlot(remainingSlots, idx, proposedEnd);
        placed = true;
        break;
      }
    }

    // === Pass 2: Ignore deadline, still use free slots ===
    if (!placed) {
      for (const { slot, idx } of scoredSlots) {
        if (slot.durationMinutes >= needed) {
          const proposedEnd = new Date(slot.start.getTime() + needed * 60000);
          const warning = deadlineDate
            ? `締切（${deadlineDate.toLocaleDateString('ja-JP')}）を過ぎますが、最短の空き枠に配置しました`
            : undefined;

          events.push({
            taskId: task.id,
            title: task.name,
            start: slot.start.toISOString(),
            end: proposedEnd.toISOString(),
            warning,
          });

          shrinkSlot(remainingSlots, idx, proposedEnd);
          placed = true;
          break;
        }
      }
    }

    // === Pass 3: Force-place (double-booking allowed) ===
    if (!placed) {
      const forceSlot = findForcePlacementSlot(task, deadlineDate);
      const warnings: string[] = [];
      warnings.push('空き枠が不足のため、既存予定と重複する可能性があります');
      if (deadlineDate && forceSlot.end > deadlineDate) {
        warnings.push(`締切（${deadlineDate.toLocaleDateString('ja-JP')}）を過ぎています`);
      }

      events.push({
        taskId: task.id,
        title: task.name,
        start: forceSlot.start.toISOString(),
        end: forceSlot.end.toISOString(),
        warning: warnings.join('。'),
      });
      placed = true;
    }
  }

  // No more unassigned - all tasks are always placed
  return { events, unassigned: [] };
}

// Shrink a slot after placing a task in it
function shrinkSlot(
  slots: { start: Date; end: Date; durationMinutes: number }[],
  idx: number,
  newStart: Date
) {
  const slot = slots[idx];
  const remaining = (slot.end.getTime() - newStart.getTime()) / 60000;
  if (remaining < 15) {
    slots.splice(idx, 1);
  } else {
    slots[idx] = {
      start: newStart,
      end: slot.end,
      durationMinutes: remaining,
    };
  }
}

// Find a forced placement slot when no free slots are available
function findForcePlacementSlot(
  task: Task,
  deadlineDate: Date | null
): { start: Date; end: Date } {
  const now = new Date();
  const jst = nowJST();
  const needed = task.duration_minutes;
  const prefRange = getPreferredHourRange(task.preferred_time);

  // Try to place starting tomorrow at preferred time, or 9:00 as default
  let startHour = 9;
  if (prefRange) {
    startHour = prefRange[0];
  }

  // Start from tomorrow in JST
  const baseDate = jstToDate(jst.year, jst.month, jst.day + 1, startHour);

  // If deadline is in the future and we can fit before it, try
  if (deadlineDate && deadlineDate > now) {
    const tryStart = new Date(deadlineDate.getTime() - needed * 60000);
    if (tryStart > now) {
      // Place just before deadline
      const hour = tryStart.getHours();
      // Ensure it's a reasonable hour (6-23)
      if (hour >= 6 && hour <= 23) {
        return {
          start: tryStart,
          end: deadlineDate,
        };
      }
    }
  }

  return {
    start: baseDate,
    end: new Date(baseDate.getTime() + needed * 60000),
  };
}
