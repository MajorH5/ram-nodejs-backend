const Database = require('./database.js');
const CommentsDatabase = require('./commentsDatabase.js');
const UserDatabase = require('../users/userDatabase.js');
const PostDatabase = require('./postDatabase.js');

const MAX_REPORTS_PER_HOUR = process.env.MAX_REPORTS_PER_HOUR;

class ReportsDatabase {
        
    static async createReport (reportingUserId, targetId, reportReason, mediaType) {
        const reportingUser = await UserDatabase.getUserById(reportingUserId);

        if (reportingUser === null || reportingUser.error) {
            return { error: 'Failed to create report.' };
        }

        if (!reportingUser.verified) {
            return { error: 'You must verify your account to report users.' };
        }

        const countQuery = `
            SELECT COUNT(*) AS reports FROM reports
            WHERE user_id = ? AND report_date > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `;
        const countResult = await Database.query(countQuery, [reportingUserId]);

        if (countResult.error) {
            return { error: 'Failed to create report.' };
        }

        if (countResult[0].reports >= MAX_REPORTS_PER_HOUR) {
            return { error: 'You\'re doing that too much. Please try again later.' };
        }
        
        let contentText = '';
        let reportedUserId = null;

        if (mediaType === 'comment') {
            const comment = await CommentsDatabase.getComment(targetId);

            if (comment === null || comment.error) {
                return { error: 'Failed to create report.' };
            }

            
            reportedUserId = comment.user_id;
            contentText = comment.text;
        } else if (mediaType === 'post') {
            const post = await PostDatabase.getPost(targetId);

            if (post === null || post.error) {
                return { error: 'Failed to create report.' };
            }

            reportedUserId = post.user_id;
            contentText = `${post.name}, ${post.tags}`;
        }

        const query = `
            INSERT INTO reports (user_id, reported_user_id, content_text, target_id, media_type, reason)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const values = [reportingUserId, reportedUserId, contentText, targetId, mediaType, reportReason];
        const result = await Database.query(query, values);

        if (result.error) {
            return { error: 'Failed to create report.' };
        }

        return { message: 'Report created successfully.' };
    }

    static async getReports () {
        const query = `
            SELECT * FROM reports
        `;
        const result = await Database.query(query);

        if (result.error) {
            return { error: 'Failed to get reports.' };
        }

        return result;
    }

    static async getReportById (reportId) {
        const query = `
            SELECT * FROM reports WHERE id = ?
        `;
        const values = [reportId];
        const result = await Database.query(query, values);

        if (result.error) {
            return { error: 'Failed to get report.' };
        }

        return result[0];
    }

    static async deleteReport (reportId) {
        const query = `
            DELETE FROM reports WHERE id = ?
        `;
        const values = [reportId];
        const result = await Database.query(query, values);

        if (result.error) {
            return { error: 'Failed to delete report.' };
        }

        return { message: 'Report deleted successfully.' };
    }


}

module.exports = ReportsDatabase;