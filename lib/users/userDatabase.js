const Database = require('../misc/database.js');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const MAX_EMAIL_PER_IP_THROTTLE = 3;
const REGISTER_IP_THROTTLE_TIME = 1000 * 60 * 60 * 24; // 24 hours in milliseconds
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

    static async createVerificationToken (email) {
        const transport = { email }
        const token = jwt.sign(transport, JWT_SECRET, { expiresIn: '1d' });

        // set token on user row in database
        const query = `UPDATE users SET verificationToken = ? WHERE email = ?`;
        const result = await Database.query(query, [token, email]);

        if (result.error) {            
            if (result.error.name == 'TokenExpiredError') {
                return { error: 'Token expired, resend verification and try again' };
            }
            
            return { error: 'Error creating verification token' };
        }

        return { token };
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

    static async login (email, password) {
        const query = `SELECT * FROM users WHERE email = ?`;
        const result = await Database.query(query, [email]);

        if (result.error || result.length === 0) {
            return { error: 'Invalid email or password' };
        }

        const user = result[0];

        if (!await bcrypt.compare(password, user.password)) {
            return { error: 'Invalid email or password' };
        }

        const transport = {
            email: user.email,
            username: user.username,
            isAdmin: user.admin === 1,
            verified: user.verified === 1
        };
        const token = jwt.sign(transport, JWT_SECRET, { expiresIn: '1d' });

        const tokenSetQuery = `UPDATE users SET jwtToken = ? WHERE email = ?`;
        const tokenSetResult = await Database.query(tokenSetQuery, [token, email]);

        if (tokenSetResult.error) {
            return { error: 'Error logging in' };
        }

        return { details: transport, token};
    }
}

module.exports = UserDatabase