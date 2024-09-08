const Database = require('./database.js');
const UserDatabase = require('../users/userDatabase.js');
const PostDatabase = require('./postDatabase.js');
const NotificationsDatabase = require('./notificationsDatabase.js');

const MAX_COMMENTS_PER_PAGE = parseInt(process.env.MAX_COMMENTS_PER_PAGE);
const MAX_REPLIES_PER_PAGE = parseInt(process.env.MAX_REPLIES_PER_PAGE);
const MAX_COMMENTS_PER_DAY = process.env.MAX_COMMENTS_PER_DAY;
const MAX_COMMENTS_PER_MINUTE = process.env.MAX_COMMENTS_PER_MINUTE;
const MAX_INTERACTIONS_PER_MINUTE = process.env.MAX_INTERACTIONS_PER_MINUTE;
const MAX_INTERACTIONS_PER_DAY = process.env.MAX_INTERACTIONS_PER_DAY;

class CommentsDatabase {
    static async getTotalNumberOfComments (postid) {
            // Query to count the total number of comments for the post
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM comments
            WHERE post_id = ? 
            AND parent_comment_id IS NULL;
        `;

        const countResult = await Database.query(countQuery, [postid]);

        if (countResult.error) {
            return { error: 'Error counting comments' };
        }

        const totalComments = countResult[0]?.total || 0;

        return totalComments;
    }

    static async getComments(postid, offset = 0, userId = null) {
        const limit = MAX_COMMENTS_PER_PAGE;

        // Base query with optional likeStatus field
        const query = `
            SELECT 
                comments.*, 
                user_post.username AS poster_username, 
                user_post.isAdmin AS poster_isAdmin,
                ${userId ? 'cl.like_status AS likeStatus' : 'NULL AS likeStatus'}
            FROM comments
            LEFT JOIN users AS user_post ON comments.user_id = user_post.id
            ${userId ? 'LEFT JOIN comment_likes AS cl ON comments.id = cl.comment_id AND cl.user_id = ?' : ''}
            WHERE comments.post_id = ? 
            AND comments.parent_comment_id IS NULL
            ORDER BY comments.created_at ASC
            LIMIT ? OFFSET ?;
        `;
    
        
        // Parameters for query
        const params = userId ? [userId, postid, limit, offset] : [postid, limit, offset];

        const result = await Database.query(query, params);

        if (result.error) {
            return { error: 'Error getting comments' };
        }

        const total = await CommentsDatabase.getTotalNumberOfComments(postid);

        if (total.error) {
            return { error: 'Error getting comments' };
        }

        return {
            comments: result,
            total: total,
        };
    }

    static async getReplyComments(commentid, offset = 0, userId = null) {
        const limit = MAX_REPLIES_PER_PAGE;

        const comment = await CommentsDatabase.getComment(commentid);

        if (!comment) {
            return { error: 'Comment does not exist' };
        }

        if (comment.error) {
            return { error: 'Error getting comment' };
        }

        // Base query with optional likeStatus field
        const query = `
            SELECT 
                comments.*, 
                user_post.username AS poster_username, 
                user_post.isAdmin AS poster_isAdmin,
                user_parent.username AS parent_username, 
                user_parent.isAdmin AS parent_isAdmin,
                ${userId ? 'cl.like_status AS likeStatus' : 'NULL AS likeStatus'}
            FROM comments
            LEFT JOIN users AS user_post ON comments.user_id = user_post.id
            LEFT JOIN comments AS parent_comment ON comments.parent_comment_id = parent_comment.id
            LEFT JOIN users AS user_parent ON parent_comment.user_id = user_parent.id
            ${userId ? 'LEFT JOIN comment_likes AS cl ON comments.id = cl.comment_id AND cl.user_id = ?' : ''}
            WHERE comments.thread_id = ? AND comments.parent_comment_id IS NOT NULL
            ORDER BY comments.created_at ASC
            LIMIT ? OFFSET ?;
        `;
    
        
        // Parameters for query
        const params = userId ? [userId, comment.thread_id, limit, offset] : [comment.thread_id, limit, offset];

        const result = await Database.query(query, params);

        if (result.error) {
            return { error: 'Error getting comments' };
        }

        return result;
    }
    
    static async getComment (commentid, userId = null) {
        const query = `
            SELECT 
                comments.*, 
                user_post.username AS poster_username, 
                user_post.isAdmin AS poster_isAdmin,
                user_parent.username AS parent_username, 
                user_parent.isAdmin AS parent_isAdmin,
                ${userId ? 'cl.like_status AS likeStatus' : 'NULL AS likeStatus'}
            FROM comments
            LEFT JOIN users AS user_post ON comments.user_id = user_post.id
            LEFT JOIN comments AS parent_comment ON comments.parent_comment_id = parent_comment.id
            LEFT JOIN users AS user_parent ON parent_comment.user_id = user_parent.id
            ${userId ? 'LEFT JOIN comment_likes AS cl ON comments.id = cl.comment_id AND cl.user_id = ?' : ''}
            WHERE comments.id = ?;
        `;
        const params = userId ? [userId, commentid] : [commentid];

        const result = await Database.query(query, params);

        if (result.error) {
            return { error: 'Error getting comment' };
        }

        return result[0] || null;
    }


    static async createComment (postid, userid, content) {
        const userResult = await UserDatabase.getUserById(userid);
        
        if (userResult.error) {
            return { error: 'Error creating post' };
        }

        if (userResult.banned === 1) {
            return { error: 'You have been banned from posting comments. If you believe this is a mistake send an email to admin@realmspriter.com' };
        }

        if (userResult.verified === 0) {
            return { error: 'You must verify your e-mail to create a comment.' };
        }

        const totalCommentsThisMinute = await CommentsDatabase.totalCommentsThisMinute(userid);

        if (totalCommentsThisMinute.error) {
            return { error: 'Error adding comment' };
        }

        if (totalCommentsThisMinute >= MAX_COMMENTS_PER_MINUTE && userResult.isAdmin !== 1) {
            return { error: `You're commenting too quickly, please try again later!` };
        }

        const totalCommentsToday = await CommentsDatabase.totalCommentsToday(userid);

        if (totalCommentsToday.error) {
            return { error: 'Error adding comment' };
        }

        if (totalCommentsToday >= MAX_COMMENTS_PER_DAY && userResult.isAdmin !== 1) {
            return { error: `You're commenting to frequently, please try again later!` };
        }

        const post = await PostDatabase.getPost(postid);

        if (post.error) {
            return { error: 'Error adding comment' };
        }

        if (!post) {
            return { error: 'Post does not exist' };
        }

        // thread id global incrementing on top level comments like this
        const query = `
            INSERT INTO comments (post_id, user_id, text, thread_id) 
            SELECT ?, ?, ?, IFNULL(MAX(c.thread_id), 0) + 1 
            FROM comments c 
            WHERE c.parent_comment_id IS NULL
        `;
        const result = await Database.query(query, [postid, userid, content]);

        if (result.error) {
            return { error: 'Error adding comment' };
        }
        
        const comment = await CommentsDatabase.getComment(result.insertId);

        if (comment.error) {
            return { error: 'Error adding comment' };
        }

        if (userResult.id !== post.user_id) {
            NotificationsDatabase.createNotification(post.user_id, 'comment', `@${userResult.username} commented on your post`, content, { post_id: postid, comment_id: result.insertId, thread_id: comment.thread_id });
        }

        return comment;
    }

    static async replyComment (commentid, userid, content) {
        const userResult = await UserDatabase.getUserById(userid);

        if (userResult.error) {
            return { error: 'Error creating post' };
        }

        if (userResult.banned === 1) {
            return { error: 'You have been banned from replying to comments. If you believe this is a mistake send an email to admin@realmspriter.com' };
        }

        if (userResult.verified === 0) {
            return { error: 'You must verify your e-mail to reply to a comment.' };
        }

        const totalCommentsThisMinute = await CommentsDatabase.totalCommentsThisMinute(userid);

        if (totalCommentsThisMinute.error) {
            return { error: 'Error replying to comment' };
        }

        if (totalCommentsThisMinute >= MAX_COMMENTS_PER_MINUTE && userResult.isAdmin !== 1) {
            return { error: `You're commenting too quickly, please try again later!` };
        }

        const totalCommentsToday = await CommentsDatabase.totalCommentsToday(userid);

        if (totalCommentsToday.error) {
            return { error: 'Error replying to comment' };
        }

        if (totalCommentsToday >= MAX_COMMENTS_PER_DAY && userResult.isAdmin !== 1) {
            return { error: `You're commenting to frequently, please try again later!` };
        }

        const comment = await CommentsDatabase.getComment(commentid);

        if (!comment) {
            return { error: 'Comment does not exist' };
        }

        if (comment.error) {
            return { error: 'Error replying to comment' };
        }

        const query = `INSERT INTO comments (post_id, user_id, text, parent_comment_id, thread_id) VALUES (?, ?, ?, ?, ?)`;
        const result = await Database.query(query, [comment.post_id, userid, content, commentid, comment.thread_id]);

        if (result.error) {
            return { error: 'Error replying to comment' };
        }

        const incrementQuery = `UPDATE comments SET replies = replies + 1 WHERE thread_id = ? AND parent_comment_id IS NULL`;
        const incrementResult = await Database.query(incrementQuery, [comment.thread_id]);

        if (incrementResult.error) {
            return { error: 'Error replying to comment' };
        }

        const reply = await CommentsDatabase.getComment(result.insertId);

        if (reply.error) {
            return { error: 'Error replying to comment' };
        }

        if (userResult.id !== comment.user_id) {
            NotificationsDatabase.createNotification(comment.user_id, 'comment_reply', `@${userResult.username} replied to your comment`, content, { post_id: comment.post_id, comment_id: commentid, reply_id: result.insertId, thread_id: comment.thread_id });
        }

        return reply;
    }

    static async deleteComment (commentid, userid = null) {
        if (userid !== null) {
            const userResult = await UserDatabase.getUserById(userid);
            
            if (userResult.error) {
                return { error: 'Error creating post' };
            }
    
            if (userResult.banned === 1) {
                return { error: 'You have been banned from editing comments. If you believe this is a mistake send an email to admin@realmspriter.com' };
            }
    
            if (userResult.verified === 0) {
                return { error: 'You must verify your e-mail.' };
            }

            const comment = await CommentsDatabase.getComment(commentid);

            if (comment.error) {
                return { error: 'Error deleting comment' };
            }

            if (!comment) {
                return { error: 'Comment does not exist' };
            }

            if (comment.user_id !== userid && userResult.isAdmin !== 1) {
                return { error: 'You do not have permission to delete this comment' };
            }
        }

        // set text to [deleted] and remove user_id
        const query = `UPDATE comments SET text = '[deleted]', deleted = true WHERE id = ?`;
        const result = await Database.query(query, [commentid]);

        if (result.error) {
            return { error: 'Error deleting comment' };
        }

        return { error: null };
    }

    static async updateLikeStatus (commentid, userid, status) {
        const userResult = await UserDatabase.getUserById(userid);
        
        if (userResult.error) {
            return { error: 'Error creating post' };
        }

        if (userResult.banned === 1) {
            return { error: 'You have been banned from interacting with comments. If you believe this is a mistake send an email to admin@realmspriter.com' };
        }

        if (userResult.verified === 0) {
            return { error: 'You must verify your e-mail to interact with a comment.' };
        }

        const totalInteractionsThisMinute = await CommentsDatabase.totalInteractionsThisMinute(userid);

        if (totalInteractionsThisMinute.error) {
            return { error: 'Error updating like status' };
        }

        if (totalInteractionsThisMinute >= MAX_INTERACTIONS_PER_MINUTE && userResult.isAdmin !== 1) {
            return { error: `You're interacting too quickly, please try again later!` };
        }

        const totalInteractionsToday = await CommentsDatabase.totalInteractionsToday(userid);

        if (totalInteractionsToday.error) {
            return { error: 'Error updating like status' };
        }

        if (totalInteractionsToday >= MAX_INTERACTIONS_PER_DAY && userResult.isAdmin !== 1) {
            return { error: `You're interacting too frequently, please try again later!` };
        }

        const currentStatus = await CommentsDatabase.getLikeStatus(commentid, userid);
        
        if (currentStatus !== null) {
            if (typeof currentStatus === 'object' && currentStatus.error) {
                return currentStatus;
            }

            if (currentStatus === status) {
                return { error: `You have already ${status === 'like' ? 'liked' : 'disliked'} this comment` };
            }

            const query = currentStatus === 'like' ? 
                `UPDATE comments SET likes = likes - 1 WHERE id = ?` :
                `UPDATE comments SET dislikes = dislikes - 1 WHERE id = ?`;

            const result = await Database.query(query, [commentid]);

            if (result.error) {
                return { error: 'Error updating like status' };
            }
        }

        if (status !== 'none') {
            // increment likes or dislikes
            const inrementQuery = status === 'like' ? 
                `UPDATE comments SET likes = likes + 1 WHERE id = ?` :
                `UPDATE comments SET dislikes = dislikes + 1 WHERE id = ?`;
        
            const incrementResult = await Database.query(inrementQuery, [commentid]);

            if (incrementResult.error) {
                return { error: 'Error updating like status' };
            }
    
            const query = `INSERT INTO comment_likes (comment_id, user_id, like_status, last_updated) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE like_status = ?, last_updated = NOW()`;
            const result = await Database.query(query, [commentid, userid, status, status]);
    
            if (result.error) {
                return { error: 'Error updating like status' };
            }
        } else {
            const query = `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`;
            const result = await Database.query(query, [commentid, userid]);

            if (result.error) {
                return { error: 'Error updating like status' };
            }
        }
        
        return { error: null };
    }

    static async getLikeStatus (commentid, userid) {
        const query = `SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?`;
        const result = await Database.query(query, [commentid, userid]);

        if (result.error) {
            return { error: 'Error checking if user has liked comment' };
        }
        
        return result[0] ? result[0].like_status : null;
    }

    static async totalCommentsToday (userid) {
        const query = `SELECT COUNT(*) as total FROM comments WHERE user_id = ? AND DATE(created_at) = CURDATE()`;
        const result = await Database.query(query, [userid]);

        if (result.error) {
            return { error: 'Error getting total comments today' };
        }

        return result[0].total;
    }

    static async totalCommentsThisMinute (userid) {
        const query = `SELECT COUNT(*) as total FROM comments WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`;
        const result = await Database.query(query, [userid]);

        if (result.error) {
            return { error: 'Error getting total comments this minute' };
        }

        return result[0].total;
    }

    static async totalInteractionsToday (userid) {
        const query = `SELECT COUNT(*) as total FROM comment_likes WHERE user_id = ? AND DATE(last_updated) = CURDATE()`;
        const result = await Database.query(query, [userid]);

        if (result.error) {
            return { error: 'Error getting total interactions today' };
        }

        return result[0].total;
    }

    static async totalInteractionsThisMinute (userid) {
        const query = `SELECT COUNT(*) as total FROM comment_likes WHERE user_id = ? AND last_updated > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`;
        const result = await Database.query(query, [userid]);

        if (result.error) {
            return { error: 'Error getting total interactions this minute' };
        }

        return result[0].total;
    }

}

module.exports = CommentsDatabase;