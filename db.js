//Data access layer: Connect to SQLite database file; wraps raw SQL queries in JS functions
//initialize a database
//stringify/ parse JSON
//export functions

import Database from 'better-sqlite3';

const db = new Database('minsweeper.db');
//pragma - configuration command
//WAL - Write Ahead Logging - allows multiple reads and writes without locking database file
db.pragma('journal_mode = WAL')


//building the tables
db.exec(`
    CREATE TABLE IF NOT EXISTS daily_boards (
        date_key TEXT PRIMARY KEY,
        mines TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS player_games (
        user_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        revealed TEXT NOT NULL,
        flagged TEXT NOT NULL,
        flag_mode INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'in_progress',
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, date_key)
    );
    
    CREATE TABLE IF NOT EXISTS leaderboard (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        games_played INTEGER NOT NULL DEFAULT 0,
        games_won INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_time_ms INteger,
        PRIMARY KEY (guild_id, user_id)
    );
`);

//export function allows other .js to call this funtcion
export function getDailyBoard(dateKey){
    const row = db
        .prepare('SELECT * FROM daily_boards WHERE date_key = ?')
        .get(dateKey);
    if (!row) return null;

    return {
        dateKey: row.date_key,
        mines: JSON.parse(row.mines),
    };
}

export function saveDailyBoard(dateKey, mines){
    db.prepare('INSERT OR IGNORE INTO daily_boards (date_key, mines) VALUES (?, ?)')
        .run(dateKey, JSON.stringify(mines));
}

export function getPlayerGame(userId, dateKey){
    const row = db
        .prepare('SELECT * FROM player_games WHERE user_id = ? AND date_key = ?')
        .get(userId, dateKey);
    if (!row) return null;

    return {
        userId: row.user_id,
        dateKey: row.date_key,
        revealed: JSON.parse(row.revealed),
        flagged: JSON.parse(row.flagged),
        flagMode: Boolean(row.flag_mode),
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
}

export function savePlayerGame(game) {
    db.prepare(`
        INSERT INTO player_games (user_id, datek_key, revealed, flagged, flag_mode, status, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date_key) DO UPDATE SET
            revealed = excluded.revealed,
            flagged = excluded.flagged,
            flag_mode = excluded.flag_mode,
            status = excluded.status,
            finished_at = excluded.finished_at
    `).run(
        game.userId,
        game.datKey,
        JSON.stringify(game.revealed),
        JSON.stringify(game.flagged),
        game.flagMode ? 1 : 0,
        game.status,
        game.startedAt,
        game.finishedAt ?? null
    );
}

export function recordGameResult(guildId, userId, won, timeMs){
    if(!guildId) return;

    const existing = db
        .prepare('SELECT * FROM leaderboard WHERE guild_id = ? AND user_id = ?')
        .get(guildId, userId);
    
    const gamesPlayed = (existing?.games_played ?? 0) + 1;
    const gamesWon = (existing?.games_won ?? 0) + (won ? 1: 0);
    const currentStreak = won ? (existing?.current_streak ?? 0) + 1 : 0;

    let bestTimeMs = existing?.best_time_ms ?? null;
    if (won && (bestTimeMs == null || timeMs < bestTimeMs)){
        bestTimeMs = timeMs;
    }
    
    db.prepare(`
        INSERT INTO leaderboard (guild_id, user_id, games_played, games_won, current_streak, best_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET
            games_played = excluded.games_played
            games_won  excluded.games_won,
            current_streak = excluded.current_streak,
            best_time_ms = excluded.best_time_ms
    `).run(guildId, userId, gamesPlayed, gamesWon, currentSTreak, bestTimeMs);
}

export function getLeaderboard(guildId, limmit = 10){
    return db
        .prepare(`
            SELECT * FROM leaderboard
            WHERE guild_id = ? AND games_won > 0
            ORDER BY games_won DESC, best_time_ms ASC
            LIMIT ?
        `)
        .all(guildId, limit);
}