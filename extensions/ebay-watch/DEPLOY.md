# ebay-watch — morning deployment checklist

Built overnight on the Mac. This file is your runbook to ship it.

## 0. Pull on the server

```bash
ssh server
cd /opt/openclaw/repo
git pull --rebase
```

You should see new files under `extensions/ebay-watch/` and the
`EXTENSIONS=` line in `build.sh` now includes `ebay-watch`.

## 1. Rebuild + restart the gateway

```bash
./build.sh
docker restart openclaw-gateway clawo
```

Smoke from the host:

```bash
docker logs openclaw-gateway 2>&1 | grep -iE "ebay-watch|plugin.*registered" | tail -20
docker exec openclaw-gateway openclaw plugins list 2>&1 | grep -i ebay
```

You want to see `ebay-watch` listed. If it's not there, the plugin manifest
has `activation.onStartup: false` — see step 2.

## 2. Enable the plugin in openclaw.json

The plugin is bundled but not auto-activated. Two-block jq pattern:

```bash
# Block 1 — generate tempfile, diff
sudo jq '
  .plugins.entries["ebay-watch"] = {
    "enabled": true,
    "config": {
      "flaresolverrEndpoint": "http://flaresolverr:8191",
      "defaultMaxResults": 20,
      "defaultTimeoutSeconds": 60
    }
  }
' /media/misc/configs/openclaw/config/openclaw.json \
  > /tmp/openclaw.json.new
diff /media/misc/configs/openclaw/config/openclaw.json /tmp/openclaw.json.new
```

Inspect the diff. Then:

```bash
# Block 2 — apply
sudo cp /media/misc/configs/openclaw/config/openclaw.json \
        /media/misc/configs/openclaw/config/openclaw.json.last-good
sudo mv /tmp/openclaw.json.new /media/misc/configs/openclaw/config/openclaw.json
docker restart openclaw-gateway clawo
```

## 3. Register the `bargain` agent

Copy the SOUL into place:

```bash
sudo mkdir -p /media/misc/configs/openclaw/config/agents/bargain/workspace
sudo cp /opt/openclaw/repo/extensions/ebay-watch/AGENT_SOUL.md \
        /media/misc/configs/openclaw/config/agents/bargain/workspace/SOUL.md
```

Then register the agent in `openclaw.json`. Mirror your existing `thor` agent
entry (same channel binding, same DM scope, same per-peer routing). The
ebay-watch plugin contributes a `ebay_search` tool which should be in this
agent's tool allowlist. If you keep per-agent tool allowlists, add at minimum:

```
ebay_search, web_fetch, flaresolverr_fetch, telegram_send_message
```

Telegram bot: either reuse Thor's bot with a `/bargain` handler convention, or
spin a second bot for this agent. The per-peer DM routing only needs to point
incoming messages from your Telegram ID (`6657215799`) at the `bargain` agent
when triggered.

Restart the stack again after editing the agent block.

## 4. Smoke test

DM `bargain` on Telegram:

> any new mac studio 512gb deals?

Expected: agent calls `ebay_search` with the standing query, returns a tight
listing block. Most likely all flagged as scams given current eBay state for
this query — that's correct behavior, not a bug.

Then check the tool call landed:

```bash
docker logs openclaw-gateway 2>&1 | grep -iE "ebay_search|ebay-watch" | tail -10
```

## 5. Tune

- If too noisy: lower `defaultMaxResults` in plugin config to 10.
- If you want a different default sort (e.g. price_asc): SOUL.md, search call.
- If the parser ever returns nothing for a query that has results on the web,
  eBay changed their HTML. Re-run the dev probe:

  ```bash
  curl -sS -X POST http://192.168.1.246:8191/v1 \
    -H 'Content-Type: application/json' \
    -d '{"cmd":"request.get","url":"https://www.ebay.com/sch/i.html?_nkw=test","maxTimeout":60000}' \
    | jq -r '.solution.response' > /tmp/ebay-probe.html
  grep -c 's-card s-card--horizontal' /tmp/ebay-probe.html
  ```

  Zero matches = selector class changed. Re-derive in
  `extensions/ebay-watch/src/ebay-search-parser.ts`.

## ⚠ Reality check: eBay is on Akamai, not Cloudflare

FlareSolverr bypasses **Cloudflare**. eBay's `/sch` endpoint is behind
**Akamai Bot Manager** (responses come from `errors.edgesuite.net` when
blocked). FlareSolverr does not defeat Akamai — it gets through only when
Akamai's session leniency lets a fresh chromedriver context fly under the
velocity threshold. Local testing showed:

- First few requests in a window: succeed, return real listings.
- Burst of ~3 requests in 30s from the same egress IP: Akamai blocks the IP
  with `Access Denied`. Cooldown observed ~30–60 minutes.

What this means for the bot in practice:

- **On-demand use (the intended pattern)** — usually fine. You DM the agent,
  it does one search, Akamai is fine with it.
- **Frequent or scripted polling** — will get the homelab IP blacklisted.
  Don't add cron. The "when I ask for it" policy chosen earlier is exactly
  the right call.
- **If you start seeing the tool throw `non-listing page (likely bot
  interstitial)`** — you're rate-limited. Wait ~30 min and try again. Don't
  retry in a tight loop; the tool already retries once internally.

If this becomes a real problem and you want a robust eBay watcher:

1. eBay's official **Browse API** (developer.ebay.com) — needs an OAuth app,
   but is rate-limited generously and has no bot-detection issues. Right
   answer for "real product."
2. A residential proxy in front of FlareSolverr — costs money, ToS-grey.
3. Run from a different egress (mobile-tethered, VPN exit, friend's IP) —
   moves the problem rather than solves it.

The plugin code itself is fine. The infrastructure under it is the
constraint.

## 6. What was deliberately NOT built

- No bidding. No buy-it-now. No authenticated session. No Playwright. No
  storageState. The agent is read-only by design.
- No cron / scheduled scan. The agent runs only when DM'd. This was your
  explicit pick over a background watcher.
- No price-drop notification across runs. There's no persistent state. Each
  run is fresh.

If/when you want any of those, the scaffolding is documented in chat history
(Phase 2 = stored Playwright session; Phase 3 = approval-token bidding).
