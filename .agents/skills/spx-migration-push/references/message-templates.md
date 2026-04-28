# Message Templates

## First Reminder

Hi {owner},

I am following up on the SPX mart table migration.

Based on the latest validation result, the following task(s) under your ownership are still detected as not migrated. The validation data has a one-day delay, so if you migrated the task yesterday or today, please ignore this reminder for now.

Current status:
- Pending migration tasks: {pending_count}

{task_examples}

Tracking sheet:
{sheet_link}

Could you please help complete the migration, or update the expected completion date/status in the tracking sheet if you already have a plan?

Note: A task is considered migrated only when the latest successful instance no longer accesses the old table. If the task was changed but the latest run failed, it may still appear as pending in our check.

If these tasks have been transferred to someone else, please let me know the new owner. Thanks!

## Already Migrated Reply

Hi {owner}, thanks for checking.

I checked the latest validation result (grass_date = {grass_date}), and your task is now marked as migrated (is_migrated = 1).

Could you please update the tracking sheet as well?

Tracking sheet link:
{cell_link}

Please update the `Status` column, which is column {status_column}, for your task row:
- Row: {row_number}
- Task: {task_name}
- Cell to update: {status_cell}
- Suggested status: Migrated

Thanks!

## Migration Guidance

Hi {owner},

I checked the latest successful task SQL for `{task_name}` and found the old table reference below.

Old table:
`{old_table}`

Recommended new table:
`{new_table}`

Suggested change:

```sql
-- before
{before_sql}

-- after
{after_sql}
```

Notes:
{notes}

After updating the SQL and confirming the latest successful run no longer accesses the old table, please update the tracking sheet:
{cell_link}

Status column: `{status_cell}` -> `Migrated`

Thanks!

## Need Manual Review

Hi {owner},

I checked the latest successful SQL for `{task_name}`, but I could not safely generate a direct replacement because {reason}.

Tracking info:
- Old table: `{old_table}`
- Suggested new table: `{new_table}`
- Task link: {task_link}
- GSheet row: {row_number}

Could you please review this task manually or share the right owner if this has been transferred?

Thanks!
