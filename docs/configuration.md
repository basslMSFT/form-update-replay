# Configuration

There are no environment variables or connection references.

## Security roles

Assign the roles next to the role people already have.

| Role | Use for |
|------|---------|
| Form Update Replay User | Everyone who records or replays. Create, read, edit, delete, assign and share their own recordings at User level; use recordings shared with them or their teams. |
| Form Update Replay Admin | Administrators who need to see and manage every recording (*All recordings* tab). Organization-level rights on the two tables. |

A team can own recordings (use *Assign to team* in the management dialog). Give the team the User role so its members can use them.

## Language

The interface follows the user's language setting: Dutch (1043) shows Dutch, every other language shows English.

## Auditing

Replay changes the open form, and the normal save and audit rules of the target table apply. Enable auditing on a table if you need to see who changed what.
