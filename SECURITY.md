# Security Policy

## Supported versions

Only the latest release of Form Update Replay receives security fixes.

## Reporting a vulnerability

Please do not report security issues in a public GitHub issue.

Use GitHub's private vulnerability reporting instead: open the **Security** tab of this repository and select **Report a vulnerability**.

Include:
- the solution version and the Dynamics 365 / Dataverse environment type
- steps to reproduce
- the impact you expect

You can expect an initial response within 7 days. This is a community project maintained on a best-effort basis, so fix timelines depend on severity and availability.

## Scope and design notes

- The solution runs entirely as the signed-in user. It uses no plug-ins, elevated calls, stored credentials or external services, so Dataverse security roles and field-level security still apply.
- Recordings store the values exactly as they were entered. Avoid sharing recordings of columns that contain personal or secured data, or use **Ask when replaying** so the value is not stored.
- Auditing is off on the recording tables by default. Enabling it copies recorded values into the audit log.

This is not an official Microsoft product.
