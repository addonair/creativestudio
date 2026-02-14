#!/usr/bin/env node
// ============================================================
// BACKUP SCRIPT — Auto-backup creativestudio.db
// Usage: node backup.js
// Cron:  0 2 * * * cd /path/to/server && node backup.js
// Keeps the last 7 backups, deletes older ones
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'db', 'creativestudio.db');
const backupsDir = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7;

if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

async function backup() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const dest = path.join(backupsDir, `backup-${ts}.db`);

    console.log(`📦 Starting backup...`);
    console.log(`   Source: ${dbPath}`);
    console.log(`   Dest:   ${dest}`);

    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found:', dbPath);
        process.exit(1);
    }

    const db = new Database(dbPath, { readonly: true });

    try {
        await db.backup(dest);
        const size = (fs.statSync(dest).size / 1024).toFixed(1);
        console.log(`✅ Backup complete (${size} KB)`);
    } catch (err) {
        console.error('❌ Backup failed:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }

    // Cleanup old backups
    const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
        .sort()
        .reverse();

    if (files.length > MAX_BACKUPS) {
        const toDelete = files.slice(MAX_BACKUPS);
        toDelete.forEach(f => {
            fs.unlinkSync(path.join(backupsDir, f));
            console.log(`🗑  Removed old backup: ${f}`);
        });
    }

    console.log(`📁 ${Math.min(files.length, MAX_BACKUPS)} backup(s) retained in ${backupsDir}`);
}

backup();
