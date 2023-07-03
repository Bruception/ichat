import sqlite3 from 'sqlite3';
import { runAppleScript } from 'run-applescript';

export class IMessageClient {
    constructor(opts) {
        this.phoneNumber = `+1${opts.phoneNumber}`;
        this.chatDbPath = opts.chatDbPath;
        this.db = new sqlite3.Database(this.chatDbPath, sqlite3.OPEN_READONLY);
    }

    async getMessages() {
        const query = `SELECT text, date, is_from_me FROM message WHERE handle_id = (
            SELECT ROWID FROM handle WHERE id = '${this.phoneNumber}'
        ) ORDER BY date DESC LIMIT 15`;

        return new Promise((resolve, reject) => {
            this.db.all(query, (err, rows) => {
                if (err) {
                    return reject(err);
                }

                const messages = rows.map((row) => {
                    const { text, date, is_from_me } = row;

                    return {
                        text,
                        date,
                        isFromMe: is_from_me,
                    };
                }).sort((a, b) => {
                    return a.date - b.date;
                });

                resolve(messages);
            });
        });
    }

    async sendMessage(message) {
        try {
            const script = `tell application "Messages"
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to buddy "${this.phoneNumber}" of targetService
                send "${message}" to targetBuddy
            end tell`;

            await runAppleScript(script);

            return true;
        } catch (error) {
            console.error(error);
        }

        return false;
    }
}
