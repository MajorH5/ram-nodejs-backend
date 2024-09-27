const Database = require('./database.js');

const UserDatabase = require('../users/userDatabase.js');

const MAX_POSTS_PER_USER = process.env.MAX_POSTS_PER_USER;
const MAX_POSTS_PER_PAGE = 15;

class PostDatabase {
    static async getUserPosts (userid) {
        const query = `
            SELECT 
                posts.*, 
                users.username AS username
            FROM posts
            LEFT JOIN users ON posts.user_id = users.id
            WHERE posts.user_id = ?;
        `;
        const result = await Database.query(query, [userid]);
        
        if (result.error) {
            return { error: 'Error getting posts' };
        }

        return result;
    }

    static async createPost (userid, name, tags, image, type, isAnimated) {
        const totalPosts = await PostDatabase.getUserPosts(userid);

        if (totalPosts.error) {
            return { error: 'Error creating post' };
        }

        const userResult = await UserDatabase.getUserById(userid);

        if (userResult.error) {
            return { error: 'Error creating post' };
        }

        if (userResult.banned === 1) {
            return { error: 'You have been banned from saving creations. If you believe this is a mistake send an email to admin@realmspriter.com' };
        }

        if (userResult.verified === 0) {
            return { error: 'You must verify your e-mail to save creations' };
        }

        const existing = await PostDatabase.getPostByName(name, userid);

        if (existing && existing.error) {
            return { error: 'Error creating post' };
        }
        tags = tags.filter(tag => tag.trim());

        let query, result;

        if (existing) {
            query = `UPDATE posts SET tags = ?, image = ?, type = ?, animated = ? WHERE name = ?`;
            result = await Database.query(query, [tags.join(', '), JSON.stringify(image), type, isAnimated, name]);
        } else {
            if (totalPosts.length >= MAX_POSTS_PER_USER && userResult.isAdmin !== 1) {
                return { error: `You have reached the maximum number of posts (${MAX_POSTS_PER_USER})` };
            }

            query = `INSERT INTO posts (user_id, name, tags, image, type, animated) VALUES (?, ?, ?, ?, ?, ?)`;
            result = await Database.query(query, [userid, name, tags.join(', '), JSON.stringify(image), type, isAnimated]);
        }

        if (result.error) {
            return { error: 'Error creating post' };
        }

        return { error: null };
    }

    static async getPost (postid) {
        const query = `
            SELECT
                posts.*,
                users.username AS username
            FROM posts
            LEFT JOIN users ON posts.user_id = users.id
            WHERE posts.id = ?;    
        `
        const result = await Database.query(query, [postid]);

        if (result.error) {
            return { error: 'Error getting post' };
        }

        return result[0] || null;
    }

    static async deletePost (postid) {
        const query = `DELETE FROM posts WHERE id = ?`;
        const result = await Database.query(query, [postid]);

        if (result.error) {
            return { error: 'Error deleting post' };
        }

        return { error: null };
    }

    static async getPostByName (name, userid) {
        const query = `SELECT * FROM posts WHERE name = ? AND user_id = ?`;
        const result = await Database.query(query, [name, userid]);

        if (result.error) {
            return { error: 'Error getting post' };
        }

        return result[0];
    }

    static async searchUserPosts(userid, tags, type, offset) {
        let query;
        let params;

        if (type === 'Any Type') {
            type = undefined;
        }

        const formatted = tags.map(tag => tag.trim()).map(tag => `%${tag}%`);
    
        if (tags.length === 0 && !type) {
            // query = `SELECT * FROM posts WHERE user_id = ?`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE posts.user_id = ?
            `
            params = [userid];
        } else if (tags.length > 0 && !type) {
            const searches = tags.map(tag => tag.trim()).map(tag => `tags LIKE ?`).join(' OR ');
            const name = tags.map(tag => tag.trim()).map(tag => `name LIKE ?`).join(' OR ');
            // query = `SELECT * FROM posts WHERE user_id = ? AND (${searches}) OR (${name})`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE posts.user_id = ? AND (${searches}) OR (${name})
            `;
            params = [userid, ...formatted, ...formatted];
        } else if (tags.length === 0 && type) {
            // query = `SELECT * FROM posts WHERE user_id = ? AND type = ?`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE posts.user_id = ? AND type = ?
            `;
            params = [userid, type];
        } else {
            const searches = tags.map(tag => tag.trim()).map(tag => `tags LIKE ?`).join(' OR ');
            const name = tags.map(tag => tag.trim()).map(tag => `name LIKE ?`).join(' OR ');
            // query = `SELECT * FROM posts WHERE user_id = ? AND (${searches}) OR (${name}) AND type = ?`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE posts.user_id = ? AND (${searches}) OR (${name}) AND type = ?
            `;
            params = [userid, ...formatted, ...formatted, type];
        }
        
        const totalQuery = query
            .replace(/\n[ ]+posts\.\*,\n[ ]+users\.username AS username\n[ ]+/, ' COUNT(*) ')
            .replace(/\n[ ]+LEFT JOIN users ON posts\.user_id = users\.id\n[ ]+/, ' ');
        const totalResult = await Database.query(totalQuery, params);

        if (totalResult.error) {
            return { error: 'Error searching posts' };
        }

        const total = totalResult[0]['COUNT(*)'];
        
        if (total > 0) {
            offset = (offset % total + total) % total;
        } else {
            offset = 0;
        }

        const searchQuery = query + 'ORDER BY posts.created_at DESC' + ` LIMIT ${MAX_POSTS_PER_PAGE} OFFSET ${offset}` ; // ascending order
        const result = await Database.query(searchQuery, params);
    
        if (result.error) {
            return { error: 'Error searching posts' };
        }

        return { posts: result, total: total };
    }    

    static async searchAllPosts(tags, type, offset) {
        let query;
        let params;

        if (type === 'Any Type') {
            type = undefined;
        }
        
        const formatted = tags.map(tag => tag.trim()).map(tag => `%${tag}%`);

        if (tags.length === 0 && !type) {
            // query = `SELECT * FROM posts`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
            `;
            params = [];
        } else if (tags.length > 0 && !type) {
            const searches = tags.map(tag => tag.trim()).map(tag => `tags LIKE ?`).join(' OR ');
            const name = tags.map(tag => tag.trim()).map(tag => `name LIKE ?`).join(' OR ');
            // query = `SELECT * FROM posts WHERE (${searches}) OR (${name})`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE (${searches}) OR (${name})
            `
            params = [...formatted, ...formatted]
        } else if (tags.length === 0 && type) {
            // query = `SELECT * FROM posts WHERE type = ?`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE type = ?
            `;
            params = [type];
        } else {
            const searches = tags.map(tag => tag.trim()).map(tag => `tags LIKE ?`).join(' OR ');
            const name = tags.map(tag => tag.trim()).map(tag => `name LIKE ?`).join(' OR ');
            // query = `SELECT * FROM posts WHERE (${searches}) OR (${name}) AND type = ?`;
            query = `
                SELECT
                    posts.*,
                    users.username AS username
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                WHERE (${searches}) OR (${name}) AND type = ?
            `;
            params = [...formatted, ...formatted, type];
        }
    
        const totalQuery = query
            .replace(/\n[ ]+posts\.\*,\n[ ]+users\.username AS username\n[ ]+/, ' COUNT(*) ')
            .replace(/\n[ ]+LEFT JOIN users ON posts\.user_id = users\.id\n[ ]+/, ' ');
        const totalResult = await Database.query(totalQuery, params);
        
        if (totalResult.error) {
            return { error: 'Error searching posts' };
        }

        const total = totalResult[0]['COUNT(*)'];
        
        if (total > 0) {
            offset = (offset % total + total) % total;
        } else {
            offset = 0;
        }

        const searchQuery = query + 'ORDER BY posts.created_at DESC' + ` LIMIT ${MAX_POSTS_PER_PAGE} OFFSET ${offset}`;
        const result = await Database.query(searchQuery, params);

        if (result.error) {
            return { error: 'Error searching posts' };
        }
    
        return { posts: result, total: total };
    }    
}

module.exports = PostDatabase;