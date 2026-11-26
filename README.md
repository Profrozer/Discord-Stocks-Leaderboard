<p align="center">
  <img src="assets/readme/hero.svg" alt="Discord Stocks Leaderboard Hero" width="100%">
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#prerequisites">Prerequisites</a> •
  <a href="#installation--setup">Setup</a> •
  <a href="#custom-emojis">Custom Emojis</a> •
  <a href="#commands--usage">Usage</a> •
  <a href="#live-leaderboard">Live Mode</a> |
  <a href="#backups-and-recovery">Backups</a>
</p>

---

## Overview

**Discord Stocks Leaderboard** is an automated customer spending tracker for Discord communities and online stores. Instead of standard text embeds, it dynamically renders a **retina-sharp (2x scale) ledger image** featuring custom profile avatars, ranking numerals, tiered medal highlights (Gold, Silver, Bronze), and formatted currency figures.

All currency is stored as integer cents in a fast SQLite database with Write-Ahead Logging (WAL), completely eliminating floating-point rounding errors.

---

## Features

- **Dynamic Canvas Rendering**: Generated via `@napi-rs/canvas` with letter-spaced typography, custom avatars, and high-DPI scaling.
- **Top 3 Medal Tiers**: Gold (`#caa24a`), Silver (`#b4b9c1`), and Bronze (`#b8825a`) accents for top spenders.
- **Atomic Currency Math**: Stored in integer cents (`RM 12.50` = `1250` cents). Zero drift when adding or subtracting amounts.
- **Interactive Navigation**: Prev, Next, Dynamic Page Indicator, Refresh, and private (ephemeral) "My Rank" check buttons.
- **Self-Updating Live Leaderboards**: Set up an auto-updating channel message with `/live start` that refreshes every 60 seconds whenever spending changes.
- **Bot Mention Trigger**: Simply send `@Bot` in any channel to view the leaderboard immediately.
- **Persistent Active Time**: The bot's status and bio show cumulative running time across restarts.
- **Backups & Recovery**: Automatic local SQLite snapshots, optional Discord JSON backups, and administrator-only restore.

---

## Architecture

<p align="center">
  <img src="assets/readme/workflow.svg" alt="Dataflow Architecture" width="100%">
</p>

1. **Commands / Triggers**: Discord slash commands (`/add`, `/set`, `/remove`, `/leaderboard`, `/live`) or a clean `@Bot` mention.
2. **Persistence**: `better-sqlite3` database running in WAL mode with prepared statements for atomic execution.
3. **Graphics Engine**: `@napi-rs/canvas` rasterizes user avatars, names, ranks, and currency into a clean PNG.
4. **Discord Interface**: Published with native button controls and optional custom application emojis.

---

## Prerequisites

- **Node.js 22 LTS** recommended. Node.js 18 is not supported by the current `better-sqlite3` release.
- **npm**
- A Discord Application created in the [Discord Developer Portal](https://discord.com/developers/applications)

---

## Installation & Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/discord-stocks-leaderboard.git
cd discord-stocks-leaderboard
npm install
```

### 2. Configure Environment Variables

Copy [env.example](env.example) to `.env` in the project root. Set `DISCORD_TOKEN` from the Developer Portal and `CLIENT_ID` to the Application ID (`CLIENT_ID` is used by `npm run deploy`). Keep `.env` private and do not commit it.

| Variable | Purpose |
|---|---|
| `GUILD_ID` | Register commands in one server. Leave blank for global registration. |
| `STAFF_ROLE_ID` | Allow a staff role to manage spending, live boards, and Discord backups. |
| `SHOP_NAME` | Name displayed on the leaderboard image. |
| `TIMEZONE` | Timezone for the leaderboard timestamp and the start date in the bot bio. |
| `BIO_TEXT` | Text shown above the active-time counter in the bot bio. |
| `BACKUP_CHANNEL_ID` | Private channel for Discord backups and automatic recovery. Leave blank to use local backups only. |
| `BACKUP_EVERY_HOURS` | Hours between backups for both destinations. Default: `48`. |
| `MEMORY_RESTART_MB` | Optional RSS limit in MB. Default: `0` (disabled). |

### 3. Configure Discord Bot Permissions

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create the bot in the **Bot** tab. The bot requests the Guilds and Guild Messages intents in code; no privileged Message Content intent is required.
2. Under **OAuth2** -> **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions:
     - `View Channels`
     - `Send Messages`
     - `Attach Files`
     - `Use External Emojis`
     - `Read Message History`
3. Invite the bot to your server using the generated URL.

---

## Custom Emojis

The bot supports custom white icon emojis for its interactive buttons. The source images are included in the `emoji/` folder:

| File | Emoji Name | Used On Button |
|---|---|---|
| `emoji/lb_prev.png` | `lb_prev` | Previous Page |
| `emoji/lb_next.png` | `lb_next` | Next Page |
| `emoji/lb_rank.png` | `lb_rank` | My Rank |
| `emoji/lb_refresh.png` | `lb_refresh` | Refresh |

### How to install:
1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your application and open the **Emojis** tab on the left menu.
3. Upload each file from the `emoji/` folder and name them exactly: `lb_prev`, `lb_next`, `lb_rank`, `lb_refresh`.
4. If omitted, buttons automatically fall back to standard text labels.

---

## Commands & Usage

### Customer & General Commands

| Command | Description | Permission |
|---|---|---|
| `/leaderboard` | View the interactive spending leaderboard image. | Everyone |
| `@Bot` | Mentioning the bot directly triggers the leaderboard view. | Everyone |
| `[My Rank]` button | Privately displays your current rank and total spending. | Everyone |
| `[Refresh]` button | Reloads the current page with real-time data. | Everyone |

### Staff Management Commands

> Access requires **Administrator** server permission or the configured `STAFF_ROLE_ID`.

| Command | Syntax | Description |
|---|---|---|
| `/add` | `/add user:@Customer amount:250.00` | Adds RM to customer total spending. |
| `/set` | `/set user:@Customer amount:500.00` | Sets exact total. Setting `0` removes them. |
| `/remove` | `/remove user:@Customer amount:50.00` | Subtracts amount. Floored at RM 0. |

### Backup Recovery

Use `/restore` in Discord to recover leaderboard data from a backup. Check that the backup is the one you want before restoring, since recovery can replace current leaderboard data.

---

## Live Leaderboard

Create an automated, self-refreshing leaderboard in any announcement or shop channel:

```text
/live start
```

- Automatically synchronizes every 60 seconds whenever data changes.
- Safe message replacement: edits the existing image without flooding chat notifications.
- To cancel and remove: run `/live stop` in the target channel.

---

## Backups and Recovery

Both backup schedules are checked on startup and then hourly. Backups include spending totals, live leaderboard message references, and the active-time counter. A restore reverts those values to the time of the backup.

### Local backups

The bot keeps the 10 newest `shop-*.db` snapshots in `data/backups/` and refreshes `spending-export.json` alongside them. If `data/shop.db` is missing, empty, or corrupt, the bot tries to recover from the newest local snapshot before opening the database. Keep a copy off the host: local backups are lost if the host's disk is lost.

### Discord backups

1. Create a private backup channel. The JSON files contain Discord user IDs and spending totals.
2. Enable Discord Developer Mode, copy the channel ID, and set `BACKUP_CHANNEL_ID` in `.env`. Give the bot **View Channel**, **Send Messages**, **Attach Files**, and **Read Message History** in that channel.
3. Restart the bot and run `/backup`. Once there is spending data, confirm that a `shop-backup-*.json` attachment appears. Empty leaderboards are not posted.

`/backup` is available to administrators and the configured staff role. The bot attempts to keep its 10 most recent backup posts in the channel. Download a copy periodically in case both the host and channel become unavailable.

### Move to a new host or restore manually

1. Stop the old bot if it is still running. Deploy `src/`, `package.json`, and the lockfile if available, and configure `.env` securely on the new host. Install dependencies there rather than uploading `node_modules/`.
2. For automatic Discord recovery, start without a `data/` folder and use the same bot account and `BACKUP_CHANNEL_ID`. On first startup, the bot looks for its own newest backup in the channel. Check for `[backup] Fresh database: restored` in the logs. Do not copy a stale local `data/` folder. If the old host's current data is available, you can instead stop it cleanly and copy its entire `data/` folder.
3. If auto-restore did not run or the old channel is gone, start the bot and run `/restore file:<backup.json>` as a server administrator. Attach a saved `shop-backup-*.json` or a `spending-export.json` from the current backup format. Do not upload the JSON to the server or attach a `.db` file. The command replaces current data after saving a `data/backups/before-restore-*.db` snapshot.
4. Verify the totals with `/leaderboard`. If the old backup channel is gone, configure a new `BACKUP_CHANNEL_ID`, restart, and run `/backup` to verify the new destination.

## Active Time and Memory

- The bot saves cumulative running time every minute and on clean shutdown. Offline time is not counted. A restore resumes the counter from the backup's saved value.
- Discord caches are capped and the bot attempts garbage collection periodically. The first `[mem]` log appears after about a minute, followed by hourly logs of RSS, heap, and external memory.
- If `MEMORY_RESTART_MB` is set to a positive value, the bot exits with code `1` when a memory check finds RSS above that limit. Enable it only if your host or process manager is configured to restart the bot after a failure.

---

## Starting the Bot

### Development Mode

```bash
node src/index.js
```

### Production with PM2

```bash
npm install -g pm2
pm2 start src/index.js --name "discord-stocks-leaderboard"
pm2 save
```

Commands register automatically upon bot startup. For manual re-deployment:

```bash
npm run deploy
```

---

## Hosted Install Troubleshooting

If npm reports that it blocked `better-sqlite3`'s install script and the bot then reports `Could not locate the bindings file`, deploy the current `package.json`. It explicitly allows the `better-sqlite3` install script via `allowScripts`. On the affected host, stop the bot, remove only `node_modules/`, and reinstall with `npm install` (or let the host reinstall on startup). Leave `.env` and `data/` in place.

---

## License

MIT License. Feel free to customize and integrate into your community shop.
