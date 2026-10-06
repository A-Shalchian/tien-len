# Keep-alive

Render's free plan stops the server after about 15 minutes without visitors. The next visitor, or Googlebot, then waits about 50 seconds. The keep-alive pings the site every 10 minutes so it stays awake.

## How it works

- `GET /healthz` returns `{"ok":true}`. It doesn't touch the database, so Neon can still sleep.
- `.github/workflows/keep-alive.yml` runs on GitHub Actions every 10 minutes and calls `KEEP_ALIVE_URL/healthz`.
- The workflow does nothing until the `KEEP_ALIVE_URL` repository variable exists.

## Turn it on

In the GitHub repo: Settings, Secrets and variables, Actions, Variables tab, New repository variable.

- Name: `KEEP_ALIVE_URL`
- Value: `https://tien-len-7bdg.onrender.com`

Or from a terminal: `gh variable set KEEP_ALIVE_URL --body https://tien-len-7bdg.onrender.com`

## Move to a new host

Change the variable's value to the new address. Nothing else changes.

## Turn it off

Delete the variable, or disable the workflow in the Actions tab. Turn it off once you're on a paid plan, since paid instances don't sleep.

## Limits

- Render gives each workspace 750 free instance hours a month. One service awake all month uses about 744. Every other free service in the same workspace shares those hours, and Render suspends free services when they run out. `gbp-gradfinder` is in the same workspace today.
- GitHub can delay scheduled runs by several minutes when it's busy, so the site can still fall asleep now and then.
- GitHub turns off scheduled workflows in a public repo after 60 days without commits. Turn it back on in the Actions tab.
