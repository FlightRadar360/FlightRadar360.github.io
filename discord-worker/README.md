# FlightRadar360 Discord OAuth

For the static browser login, add this redirect URI in the Discord application:

```text
https://flightradar360.github.io/
```

Keep `discordAuthUrl` empty in `flight-radar360-config.js` for browser OAuth. The optional Worker below is only needed if you later switch to a secure server-side code exchange.

# Optional Worker

This Worker is the only place where the Discord client secret is used.

1. In the Cloudflare dashboard, create a Worker from this directory.
2. Set `DISCORD_CLIENT_SECRET` as a Worker secret:
   ```sh
   wrangler secret put DISCORD_CLIENT_SECRET
   ```
3. Replace `YOUR_SUBDOMAIN` in `wrangler.toml` with the Worker subdomain, then deploy:
   ```sh
   npx wrangler deploy
   ```
4. Add the final callback URL as a Discord OAuth2 redirect URI:
   ```text
   https://flightradar360-discord-oauth.YOUR_SUBDOMAIN.workers.dev/auth/discord/callback
   ```
5. Set `DISCORD_AUTH_URL` in `flight-radar360-config.js` to:
   ```text
   https://flightradar360-discord-oauth.YOUR_SUBDOMAIN.workers.dev
   ```
