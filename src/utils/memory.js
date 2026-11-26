// Keeps memory use flat over weeks:
//  - collectGarbage(): forces a garbage collection (works without any Node flags)
//  - startMemoryGuard(): logs memory hourly, cleans up every 10 min, and (optionally) restarts
//    the process if memory stays too high. Set MEMORY_RESTART_MB in .env to enable that.
let gc = null;
try {
  require('v8').setFlagsFromString('--expose_gc');
  gc = require('vm').runInNewContext('gc');
} catch {
  /* gc stays null; everything below still works, just without forced cleanup */
}

function collectGarbage() {
  if (gc) gc();
}

const mb = (n) => Math.round(n / 1048576);

function startMemoryGuard() {
  const limit = parseInt(process.env.MEMORY_RESTART_MB, 10) || 0;

  const check = (log) => {
    collectGarbage();
    const m = process.memoryUsage();
    if (log) console.log(`[mem] rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}MB external=${mb(m.external)}MB`);
    if (limit && mb(m.rss) > limit) {
      console.warn(`[mem] ${mb(m.rss)}MB is over MEMORY_RESTART_MB=${limit}. Exiting so the host restarts the bot.`);
      process.exit(1);
    }
  };

  setInterval(() => check(false), 10 * 60 * 1000);
  setInterval(() => check(true), 60 * 60 * 1000);
  setTimeout(() => check(true), 60 * 1000); // first reading one minute after start
}

module.exports = { collectGarbage, startMemoryGuard };
