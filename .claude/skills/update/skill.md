---
name: update
description: End-of-session documentation updater. Updates DEVELOPMENT-PLAN.md checkboxes, adds PROGRESS.md session entries, updates GAME-DESIGN-DOCUMENT.md if design changed, and syncs CLAUDE.md status. Use when finishing a coding session or when the user says "update docs" or "end session".
---

# Update Skill

Perform an end-of-session assessment and update all project tracking documentation.

## When to Use

Invoke `/update` at the end of a coding session to:
- Record completed work
- Update task checkboxes
- Document decisions made
- Log any blockers or issues encountered

## Execution Steps

### Step 1: Session Assessment

Before touching any files, assess what was accomplished in this session:
- What tasks were worked on?
- What was completed vs partially complete vs blocked?
- What decisions were made?
- What issues were encountered?
- What are the logical next steps?

### Step 2: Review DEVELOPMENT-PLAN.md

Read `docs/DEVELOPMENT-PLAN.md` and identify:
- Tasks that should be marked complete `[x]`
- Tasks that are partially complete `[~]` (add note)
- Tasks that are blocked `[!]` (add blocker reason)
- Any new tasks that need to be added based on discoveries

Apply checkbox updates accurately. Do not mark tasks complete unless they are fully done and verified.

### Step 3: Review GAME-DESIGN-DOCUMENT.md

Read `docs/GAME-DESIGN-DOCUMENT.md` and identify:
- Any game mechanics that were clarified or changed
- New features or systems that were designed
- Balance values that were adjusted
- Any specifications that need updating based on implementation decisions

Only update this document if actual game design changes occurred. Do not update for purely technical changes.

### Step 4: Review PROGRESS.md

**Important:** PROGRESS.md may exceed the Read tool's token limit. Handle this by:
1. First, read lines 1-100 to get the header with Total Sessions count and phase summary
2. Then, use Bash with `wc -l` to get total line count
3. Read the last 400 lines (offset = totalLines - 400) to see recent sessions and find where to append

Add a new session entry with:

```markdown
## Session [N] - [YYYY-MM-DD]

### Completed
- [List of completed tasks with brief descriptions]

### Decisions Made
- [Any decisions that were made, with rationale]

### Issues Encountered
- [Problems hit and how they were resolved, or if still open]

### Next Steps
- [What should be tackled in the next session]
```

### Step 5: Update CLAUDE.md Current Status

Update the "Current Status" section in `CLAUDE.md` with:
- Current Phase
- Phase Progress
- Current Task (next priority)
- Blockers
- Last Session number and date
- Last Updated date

Also add any new entries to the Key Decisions Log if decisions were made.

### Step 6: Summary Report

After all updates are complete, provide a summary to the user:

```
## Session Update Complete

**Session:** [N] - [Date]
**Phase:** [Current Phase]

### Changes Made:
- DEVELOPMENT-PLAN.md: [X tasks marked complete, Y tasks added/modified]
- GAME-DESIGN-DOCUMENT.md: [Changes made or "No changes needed"]
- PROGRESS.md: [Session entry added]
- CLAUDE.md: [Status updated, N decisions logged]

### Current State:
- Phase Progress: [X/Y tasks complete]
- Next Priority: [Task description]
- Blockers: [None or list]
```

## Important Notes

- Always READ each document before making edits
- **Large file handling:** If any file exceeds the Read tool's 25000 token limit, use `offset` and `limit` parameters to read in chunks. For append-only files like PROGRESS.md, read the header (first ~100 lines) and tail (last ~400 lines).
- Be conservative with GAME-DESIGN-DOCUMENT.md - only update for actual design changes
- Be thorough with PROGRESS.md - this is the historical record
- Never mark a task complete if it wasn't fully finished and verified
- If uncertain about whether something should be logged, include it
