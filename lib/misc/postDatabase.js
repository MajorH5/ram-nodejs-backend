const Database = require('./database.js');

const UserDatabase = require('../users/userDatabase.js');

const MAX_POSTS_PER_USER = 30;
const MAX_POSTS_PER_PAGE = 15;

class PostDatabase {
    static async getUserPosts (userid) {
        const query = `SELECT * FROM posts WHERE user_id = ?`;
        const result = await Database.query(query, [userid]);
        
        if (result.error) {
            return { error: 'Error getting posts' };
        }

        return result;
    }

    static async createPost (userid, name, tags, image, type) {
        const totalPosts = await PostDatabase.getUserPosts(userid);

        if (totalPosts.error) {
            return { error: 'Error creating post' };
        }

        if (totalPosts.length >= MAX_POSTS_PER_USER) {
            return { error: 'User has reached the maximum number of posts' };
        }

        const userResult = await UserDatabase.getUserById(userid);

        if (userResult.error) {
            return { error: 'Error creating post' };
        }

        if (userResult.banned === 1) {
            return { error: 'You have been banned from saving creations. If you believe this is a mistake send an email to admin@realmspriter.com' };
        }

        if (userResult.verified === 0) {
            return { error: 'You must be verify your e-mail to save creations' };
        }

        tags = tags.filter(tag => tag.trim());

        const query = `INSERT INTO posts (user_id, name, tags, image, type) VALUES (?, ?, ?, ?, ?)`;
        const result = await Database.query(query, [userid, name, tags.join(', '), JSON.stringify(image), type]);

        if (result.error) {
            return { error: 'Error creating post' };
        }

        return { error: null };
    }

    static async getPost (postid) {
        const query = `SELECT * FROM posts WHERE id = ?`;
        const result = await Database.query(query, [postid]);

        if (result.error) {
            return { error: 'Error getting post' };
        }

        return result[0];
    }

    static async deletePost (postid) {
        const query = `DELETE FROM posts WHERE id = ?`;
        const result = await Database.query(query, [postid]);

        if (result.error) {
            return { error: 'Error deleting post' };
        }

        return { error: null };
    }

    static async searchUserPosts(userid, tags, type, pageIndex) {
        let query;
        let params;
    
        if (tags.length === 0 && !type) {
            query = `SELECT * FROM posts WHERE user_id = ?`;
            params = [userid];
        } else if (tags.length > 0 && !type) {
            const searches = tags.map(tag => `tags LIKE ?`).join(' OR ');
            query = `SELECT * FROM posts WHERE user_id = ? AND (${searches})`;
            params = [userid, ...tags.map(tag => `%${tag}%`)];
        } else if (tags.length === 0 && type) {
            query = `SELECT * FROM posts WHERE user_id = ? AND type = ?`;
            params = [userid, type];
        } else {
            const searches = tags.map(tag => `tags LIKE ?`).join(' OR ');
            query = `SELECT * FROM posts WHERE user_id = ? AND (${searches}) AND type = ?`;
            params = [userid, ...tags.map(tag => `%${tag}%`), type];
        }
    
        const searchQuery = query + ` LIMIT ${MAX_POSTS_PER_PAGE} OFFSET ${pageIndex * MAX_POSTS_PER_PAGE}`;
        const result = await Database.query(query, params);
    
        if (result.error) {
            return { error: 'Error searching posts' };
        }

        const totalQuery = query.replace('*', 'COUNT(*)') + ';';
        const totalResult = await Database.query(totalQuery, params);

        if (totalResult.error) {
            return { error: 'Error searching posts' };
        }

        return { posts: result, total: totalResult[0]['COUNT(*)'] };
    }    

    static async searchAllPosts(tags, type, pageIndex) {
        let query;
        let params;
    
        if (tags.length === 0 && !type) {
            query = `SELECT * FROM posts`;
            params = [];
        } else if (tags.length > 0 && !type) {
            const searches = tags.map(tag => `tags LIKE ?`).join(' OR ');
            query = `SELECT * FROM posts WHERE (${searches})`;
            params = tags.map(tag => `%${tag}%`);
        } else if (tags.length === 0 && type) {
            query = `SELECT * FROM posts WHERE type = ?`;
            params = [type];
        } else {
            const searches = tags.map(tag => `tags LIKE ?`).join(' OR ');
            query = `SELECT * FROM posts WHERE (${searches}) AND type = ?`;
            params = [...tags.map(tag => `%${tag}%`), type];
        }
    
        const totalQuery = query.replace('*', 'COUNT(*)') + ';';
        const totalResult = await Database.query(totalQuery, params);
        
        if (totalResult.error) {
            return { error: 'Error searching posts' };
        }

        const totalPages = Math.ceil(totalResult[0]['COUNT(*)'] / MAX_POSTS_PER_PAGE);

        const searchQuery = query + ` LIMIT ${MAX_POSTS_PER_PAGE} OFFSET ${pageIndex * MAX_POSTS_PER_PAGE}`;
        const result = await Database.query(searchQuery, params);
    
        if (result.error) {
            return { error: 'Error searching posts' };
        }
    
        return { posts: result, total: totalResult[0]['COUNT(*)'] };
    }    
}

module.exports = PostDatabase;