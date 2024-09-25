const Database = require('../misc/database.js');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const MAX_EMAIL_PER_IP_THROTTLE = 3;
const REGISTER_IP_THROTTLE_TIME = 1000 * 60 * 60 * 24; // 24 hours in milliseconds
const VERIFICATION_THROTTLE_TIME = 1000 * 60 * 3; // 3 minutes in milliseconds
const RESET_PASSWORD_THROTTLE_TIME = 1000 * 60 * 3; // 3 minutes in milliseconds
const PASSWORD_HASH_ROUNDS = 10;

const JWT_SECRET = process.env.JWT_SECRET;

class UserDatabase {
    static async createUser (username, email, password, ip) {
        if (await this.emailExists(email)) {
            return { error: 'Email already exists' };
        }

        if (await this.usernameExists(username)) {
            return { error: 'Username already exists' };
        }

        const existingWithIp = await this.getUsersWithIp(ip);
        
        if (existingWithIp.length >= MAX_EMAIL_PER_IP_THROTTLE - 1) {
            const mostRecent = existingWithIp[existingWithIp.length - 1];
            const creationTime = mostRecent.created_at;

            if (new Date() - creationTime < REGISTER_IP_THROTTLE_TIME) {
                return { error: 'Too many accounts created from this IP. Try again later' };
            }
        }

        try {
            password = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
        } catch (error) {
            console.log('Error hashing password: ', error.message);
            return { error: 'Error creating user' };
        }
        
        const query = `INSERT INTO users (username, email, password, ip) VALUES (?, ?, ?, ?)`;
        const result = await Database.query(query, [username, email, password, ip]);

        if (result.error) {
            return { error: 'Error creating user' };
        }
        
        return { error: null };
    }

    static async getUsersWithIp (ip) {
        const query = `SELECT * FROM users WHERE ip = ?`;
        const result = await Database.query(query, [ip]);

        return result.map(row => row);
    }

    static async emailExists (email) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        return result.length > 0;
    }

    static async usernameExists (username) {
        const query = `SELECT * FROM users WHERE username = ?`;
        const result = await Database.query(query, [username]);

        return result.length > 0;
    }

    static async canUserResetPassword (email) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        if (result.error || result.length === 0) {
            return false;
        }

        const user = result[0];
        const lastReset = user.lastResetRequest;

        if (lastReset !== null && new Date() - lastReset < RESET_PASSWORD_THROTTLE_TIME) {
            return false;
        }

        if (user.banned === 1) {
            return false;
        }

        return true;
    }

    static async notePasswordReset (email) {
        const query = `UPDATE users SET lastResetRequest = ? WHERE email = ?`;
        const result = await Database.query(query, [new Date(), email]);

        return result.error === null;
    }

    static async createVerificationToken (email) {
        const userQuery = 'SELECT * FROM users WHERE email = ?';
        const userResult = await Database.query(userQuery, [email]);

        if (userResult.error || userResult.length === 0) {
            return { error: 'Invalid email' };
        }

        const user = userResult[0];

        if (user.banned === 1) {
            return { error: 'User is banned' };
        }

        if (user.verified === 1) {
            return { error: 'User is already verified' };
        }

        const lastAttempt = user.lastVerificationRequest;

        if (lastAttempt && new Date() - lastAttempt < VERIFICATION_THROTTLE_TIME) {
            return { error: 'Too many verification requests. Try again later' };
        }

        const transport = { email }
        const token = jwt.sign(transport, JWT_SECRET, { expiresIn: '1d' });

        // set token on user row in database
        const query = `UPDATE users SET verificationToken = ? WHERE email = ?`;
        const result = await Database.query(query, [token, email]);

        if (result.error) {   
            return { error: 'Error creating verification token' };
        }

        const lastSetQuery = `UPDATE users SET lastVerificationRequest = ? WHERE email = ?`;
        const lastSetResult = await Database.query(lastSetQuery, [new Date(), email]);

        if (lastSetResult.error) {
            return { error: 'Error creating verification token' };
        }

        return { token };
    }

    static async resetPassword (token, password) {
        let decoded;

        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.log('Error verifying token: ', error.message);
            return { error: 'Invalid token' };
        }

        const email = decoded.email;

        try {
            password = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
        } catch (error) {
            console.log('Error hashing password: ', error.message);
            return { error: 'Error resetting password' };
        }

        const query = `UPDATE users SET password = ?, passwordResetToken = NULL WHERE email = ?`;
        const result = await Database.query(query, [password, email]);

        if (result.error) {
            return { error: 'Error resetting password' };
        }

        return { error: null };
    }

    static async changePassword (token, currentPassword, newPassword) {
        let decoded;

        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.log('Error verifying token: ', error.message);
            return { error: 'Invalid token' };
        }

        const email = decoded.email;
        const userQuery = `SELECT * FROM users WHERE email = ?`;
        const userResult = await Database.query(userQuery, [email]);

        if (userResult.error || userResult.length === 0) {
            return { error: 'Invalid token' };
        }

        const user = userResult[0];

        if (currentPassword !== null && !await bcrypt.compare(currentPassword, user.password)) {
            return { error: 'Incorrect password' };
        }

        try {
            newPassword = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
        } catch (error) {
            console.log('Error hashing password: ', error.message);
            return { error: 'Error changing password' };
        }

        const query = `UPDATE users SET password = ? WHERE email = ?`;
        const result = await Database.query(query, [newPassword, email]);

        if (result.error) {
            return { error: 'Error changing password' };
        }

        return { error: null };
    }

    static async isVerified (email) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        if (result.error || result.length === 0) { 
            return false;
        }

        return result[0].verified === 1;
    }

    static async verifyUser (token) {
        let decoded;

        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.log('Error verifying token: ', error.message);
            return { error: 'Error verifying token' };
        }

        if (await this.isVerified(decoded.email)) {
            return { error: 'User is already verified' };
        }

        const email = decoded.email;
        const query = `UPDATE users SET verified = 1 WHERE email = ?`;

        const result = await Database.query(query, [email]);

        if (result.error) {
            return { error: 'Error verifying user' };
        }

        const clearTokenQuery = `UPDATE users SET verificationToken = NULL WHERE email = ?`;
        const clearTokenResult = await Database.query(clearTokenQuery, [email]);

        if (clearTokenResult.error) {
            return { error: 'Error verifying user' };
        }

        return { error: null };
    }

    static async logout (token) {
        let decoded;
    
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.log('Error verifying token: ', error.message);
            return { error: 'Invalid token' };
        }

        const currentQuery = `SELECT * FROM users WHERE email = ?`;
        const currentResult = await Database.query(currentQuery, [decoded.email]);

        if (currentResult.error || currentResult.length === 0) {
            return { error: 'Invalid token' };
        }

        if (currentResult[0].jwtToken !== token) {
            return { error: 'Token has expired' };
        }

        const email = decoded.email;
        const query = `UPDATE users SET jwtToken = NULL WHERE email = ?`;

        const result = await Database.query(query, [email]);

        if (result.error) {
            return { error: 'Error logging out' };
        }

        return { error: null };
    }

    static async login (email, password, isTemporary = false) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        if (result.error || result.length === 0) {
            return { error: 'Invalid email or password' };
        }

        const user = result[0];

        if (password !== null && !await bcrypt.compare(password, user.password)) {
            return { error: 'Invalid email or password' };
        }

        const transport = {
            email: user.email,
            username: user.username,
            isAdmin: user.isAdmin === 1,
            verified: user.verified === 1,
            userId: user.id,
            isTemporary
        };
        const token = jwt.sign(transport, JWT_SECRET);

        const tokenSetQuery = `UPDATE users SET jwtToken = ? WHERE email = ?`;
        const tokenSetResult = await Database.query(tokenSetQuery, [token, email]);

        if (tokenSetResult.error) {
            return { error: 'Error logging in' };
        }

        return { details: transport, token};
    }

    static async getUserByToken (token) {
        let decoded;
    
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.log('Error verifying token: ', error.message);
            return { error: 'Invalid token' };
        }

        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [decoded.email]);

        if (result.error || result.length === 0 || result[0].jwtToken !== token) {
            return { error: 'Invalid token' };
        }

        const user = result[0];
        return {
            details: {
                email: user.email,
                username: user.username,
                isAdmin: user.isAdmin === 1,
                verified: user.verified === 1,
                userId: user.id,
                isTemporary: decoded.isTemporary
            },
            token
        }
    }

    static async setResetPasswordCode (userid, code) {
        const query = `UPDATE users SET passwordCode = ? WHERE id = ?`;
        const result = await Database.query(query, [code, userid]);

        if (result.error) {
            console.log(result)
            return { error: 'Error setting password code' };
        }

        return { error: null };
    }

    static async getPasswordCode (userid)  {
        const query = `SELECT passwordCode FROM users WHERE id = ?`;
        const result = await Database.query(query, [userid]);

        if (result.error || result.length === 0) {
            return { error: 'Invalid user id' };
        }

        return { code: result[0].passwordCode };
    }

    static async getUserByEmail (email) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        if (result.error || result.length === 0) {
            return { error: 'Invalid email' };
        }

        return result[0];
    }
    
    static async getUserById (id) {
        const query = `SELECT * FROM users WHERE id = ?`;
        const result = await Database.query(query, [id]);

        if (result.error || result.length === 0) {
            return { error: 'Invalid user id' };
        }

        return result[0];
    }
}

module.exports = UserDatabase;