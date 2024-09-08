const Database = require('./database');

const MAX_NOTIFICATION_PER_PAGE = parseInt(process.env.MAX_NOTIFICATIONS_PER_PAGE);

class NotificationsDatabase {
    static async createNotification(userId, type, subject, message, metadata = {}) {
        const query = `
            INSERT INTO notifications (user_id, type, subject, message, metadata)
            VALUES (?, ?, ?, ?, ?)
        `;
        const values = [userId, type, subject, message, JSON.stringify(metadata)];

        const result = await Database.query(query, values);

        if (result.error) {
            return { error: result.error };
        }

        return { message: "Notification created successfully" };
    }

    static async getNotifications(userId, offset = 0) {
        const query = `
            SELECT * FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        const values = [userId, MAX_NOTIFICATION_PER_PAGE, offset];
    
        const result = await Database.query(query, values);
    
        if (result.error) {
            return { error: result.error };
        }

        const totalQuery = `SELECT COUNT(*) as total FROM notifications WHERE user_id = ?`;

        const totalResult = await Database.query(totalQuery, [userId]);

        if (totalResult.error) {
            return { error: totalResult.error };
        }
    
        return { notifications: result, total: totalResult[0].total };
    }

    static async readNotification(userId, notificationId) {
        const query = `
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ? AND id = ?
        `;
        const values = [userId, notificationId];

        const result = await Database.query(query, values);

        if (result.error) {
            return { error: result.error };
        }

        return { message: "Notification read successfully" };
    }
    
    static async deleteNotification(userId, notificationId) {
        const query = `
            DELETE FROM notifications
            WHERE user_id = ? AND id = ?
        `;
        const values = [userId, notificationId];

        const result = await Database.query(query, values);

        if (result.error) {
            return { error: result.error };
        }

        return { message: "Notification deleted successfully" };
    }

    static async deleteAllNotifications(userId) {
        const query = `
            DELETE FROM notifications
            WHERE user_id = ?
        `;
        const values = [userId];

        const result = await Database.query(query, values);

        if (result.error) {
            return { error: result.error };
        }

        return { message: "All notifications deleted successfully" };
    }

    static async createGlobalNotification(type, subject, message, metadata = {}) {
        // notification for each and every users in users table
        const query = `
            INSERT INTO notifications (user_id, type, subject, message, metadata)
            SELECT id, ?, ?, ?, ?
            FROM users
        `;
        const values = [type, subject, message, JSON.stringify(metadata)];

        const result = await Database.query(query, values);

        if (result.error) {
            return { error: result.error };
        }

        return { message: "Global notification created successfully" };
    }
}

module.exports = NotificationsDatabase;