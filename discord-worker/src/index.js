function b64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomState() {
  return b64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function corsHeaders(origin, allowedOrigin) {
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.SITE_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/auth/discord") {
      const state = randomState();
      const authorize = new URL("https://discord.com/oauth2/authorize");
      authorize.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
      authorize.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("scope", "identify");
      authorize.searchParams.set("state", state);

      const headers = new Headers({ Location: authorize.toString() });
      headers.append("Set-Cookie", `discord_oauth_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/auth/discord/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const savedState = cookieValue(request, "discord_oauth_state");
      if (!code || !state || !savedState || state !== savedState) {
        return Response.redirect(`${env.SITE_ORIGIN}/?discord_error=authorization_failed`, 302);
      }

      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: env.DISCORD_REDIRECT_URI
        })
      });
      if (!tokenResponse.ok) {
        return Response.redirect(`${env.SITE_ORIGIN}/?discord_error=token_exchange_failed`, 302);
      }

      const token = await tokenResponse.json();
      const headers = new Headers({ Location: `${env.SITE_ORIGIN}/` });
      headers.append("Set-Cookie", `discord_session=${encodeURIComponent(token.access_token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${Math.min(token.expires_in || 604800, 604800)}`);
      headers.append("Set-Cookie", "discord_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === "/api/discord/me") {
      if (origin && origin !== env.SITE_ORIGIN) {
        return jsonResponse({ error: "Origin denied" }, 403, cors);
      }
      const accessToken = cookieValue(request, "discord_session");
      if (!accessToken) return jsonResponse({ user: null }, 200, cors);

      const discordResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      if (!discordResponse.ok) {
        return jsonResponse({ user: null }, 401, cors);
      }

      const user = await discordResponse.json();
      const avatar = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;
      return jsonResponse({
        user: {
          id: user.id,
          username: user.username,
          globalName: user.global_name || user.username,
          avatar
        }
      }, 200, cors);
    }

    if (url.pathname === "/auth/discord/logout") {
      const headers = new Headers({ Location: `${env.SITE_ORIGIN}/` });
      headers.append("Set-Cookie", "discord_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0");
      return new Response(null, { status: 302, headers });
    }

    return jsonResponse({ error: "Not found" }, 404, cors);
  }
};
