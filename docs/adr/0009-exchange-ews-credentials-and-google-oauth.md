# Exchange via EWS credentials and Google Calendar via OAuth

The Exchange integration switches from Microsoft Graph OAuth to Exchange Web Services with the account username and password entered directly on the settings page. This removes the Azure app registration requirement and works with on-prem Exchange servers, where Graph is unavailable; the trade-off is that EWS Basic authentication must be enabled on the server and the password is stored encrypted like Yandex CalDAV credentials. Existing Microsoft Graph sources are marked disconnected by migration because their tokens can no longer be refreshed.

Google Calendar is added as a new source through Google OAuth (authorization code flow with a refresh token and the read-only calendar scope), since Google does not allow password-based calendar access. It reuses the start/callback route pattern the Microsoft Graph integration used, configured with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
