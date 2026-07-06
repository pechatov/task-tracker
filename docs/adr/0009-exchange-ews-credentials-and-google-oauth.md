# Microsoft calendar OAuth, Exchange EWS credentials, and Google Calendar OAuth

Microsoft 365 calendar integration uses Microsoft Graph OAuth with an authorization-code flow. This keeps corporate MFA and one-time-password prompts inside the Microsoft browser login and lets the app store only encrypted OAuth credentials for read-only background sync.

Exchange Web Services remains available as a fallback for on-prem or legacy Exchange servers where Graph is unavailable. EWS uses the account username and password entered directly on the settings page; the trade-off is that EWS Basic authentication must be enabled on the server, or the organization must provide an app password or equivalent non-interactive credential. A normal corporate login that requires a separate MFA one-time code cannot be completed through the EWS Basic Auth form.

Google Calendar is added as a new source through Google OAuth (authorization code flow with a refresh token and the read-only calendar scope), since Google does not allow password-based calendar access. It reuses the start/callback route pattern the Microsoft Graph integration used, configured with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
