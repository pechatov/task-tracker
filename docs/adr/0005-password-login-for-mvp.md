# Password login for MVP

The MVP will use email/password login with no public self-registration. The first user is provisioned by a CLI command that accepts the password interactively, passwords are stored only as strong password hashes, and authenticated browser access uses server-side sessions so the app can later grow into multi-user login without replacing the authentication model.
