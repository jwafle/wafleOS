# Workout Page Implementation Plan (`/fitness/workouts/[id]`)

## Scope

Implement the remaining workout-execution features on `src/routes/fitness/workouts/[id]/+page.svelte`:

1. Overall workout wall-clock
2. Inter-set rest timer
3. Set metric tracking UI + persistence (duration/reps/weight+reps based on exercise type)

No template-page changes in this phase.

---

## Confirmed Product Rules

### Wall-clock

- Starts from `workout.startedAt`
- Stops/freezes at `workout.finishedAt`
- Always displayed as `HH:MM:SS`
- Still rendered on completed workouts as final duration
- Marking workout complete should **not** make sets read-only (set edits/toggles remain allowed)

### Inter-set timer

- One global rest timer in a locked/sticky location on the page
- Timer starts/restarts **only when a set is marked complete**
- Duration used is the `restDuration` of the set group that was just completed
- Marking a set incomplete does **not** alter the running timer
- If that set is marked complete again, timer restarts from that set group duration
- On reload/reopen, reconstruct from latest completed set + its group rest duration
- Notify at timer completion via best-effort browser APIs:
  - Web Notification API
  - `navigator.vibrate` where available

### Superset behavior

- `isSuperset = true` means the group links to the next group in sequence
- Example chain: `A=true, B=true, C=false` => one chain A→B→C
- Completed groups in a chain are effectively skipped until all groups in chain complete
- Example progression allowed: `A -> B -> C -> A -> C -> A`

### Set metric tracking

- Exercise measurement modes:
  - `duration` => duration input (raw seconds)
  - `reps` => reps input
  - `reps_and_weight` => reps + weight inputs
- Weight supports decimals and is labeled lbs
- Save the set metrics on the set being marked complete or incomplete
- Completion is blocked if required metric fields are missing
- Inputs should prefill from the most recently completed set group of the **same exercise**, matching by set index

### Timestamp consistency fix

- Move timestamp writes to milliseconds
- Add migration converting legacy second-based timestamps to ms using:
  - `if value < 1_000_000_000_000 then value = value * 1000`
- Apply to:
  - `workouts.startedAt`
  - `workouts.finishedAt`
  - `sets.finishedAt`

---

## Implementation Steps

- [x] **1) Database timestamp correctness**
  - [x] Add new drizzle migration to normalize legacy seconds timestamps into ms
  - [x] Update remote action write expressions from second epoch to millisecond epoch

- [x] **2) Backend actions for set metric persistence**
  - [x] Add/extend workout remote form action(s) to update set fields:
    - [x] `reps`
    - [x] `weight`
    - [x] `duration`
  - [x] Validate by exercise measurement mode and DB constraints
  - [x] Ensure mutation is scoped to the current workout + set

- [x] **3) Completion validation on server**
  - [x] Update `toggleSetComplete` so marking complete requires metric fields based on exercise type
  - [x] Keep marking incomplete permissive
  - [x] Return actionable form issues for inline UI rendering

- [x] **4) Workout page timer state + rendering**
  - [x] Add sticky/global timer region with:
    - [x] wall-clock (`HH:MM:SS`)
    - [x] rest countdown
  - [x] Use client tick loop (1-second cadence) with cleanup on destroy
  - [x] Reconstruct rest timer from latest completed set on load

- [ ] **5) Rest timer source-of-truth logic**
  - [ ] On successful set completion, restart rest timer using that set group’s `restDuration`
  - [ ] Ignore set-incomplete events for timer changes
  - [ ] Recompute in-page derived state for latest completion and countdown target

- [ ] **6) Superset-aware rest sequencing support**
  - [ ] Build helper logic over ordered set groups to evaluate active superset chains
  - [ ] Skip fully completed groups in chain when determining practical next rotation behavior
  - [ ] Keep timer trigger still tied to “last completed set’s group rest duration”

- [ ] **7) Metric input UI in set rows**
  - [ ] Render conditional inputs per set by `exercise.measured_in`
  - [ ] Save set metrics on the set being marked complete or incomplete
  - [ ] Add lbs label for weight
  - [ ] Prefill values from most recent completed same-exercise group at same set index

- [ ] **8) UX for validation failures**
  - [ ] If completion is blocked (missing required metrics), show inline error for that set
  - [ ] Keep button and form interactions clear and recoverable

- [ ] **9) Notifications/vibration**
  - [ ] Add best-effort permission request flow for notifications
  - [ ] Fire notification + vibration when rest countdown reaches zero (if permitted/supported)

- [ ] **10) Verification**
  - [ ] Manual checks:
    - [ ] wall-clock running/frozen behavior
    - [ ] reload reconstruction of rest timer
    - [ ] set completion restart behavior
    - [ ] incomplete-toggle non-effect on timer
    - [ ] per-mode metric rendering/validation
    - [ ] same-exercise prefill behavior by set index
    - [ ] superset skip behavior when groups finish unevenly
    - [ ] notification/vibration completion signal

---

## Planned File Touchpoints

- `src/routes/fitness/workouts/[id]/+page.svelte`
- `src/routes/fitness/workouts.remote.ts`
- `drizzle/0002_*.sql` (new migration)
- `src/lib/server/db/schema.ts` (only if needed for consistency/supporting types)
