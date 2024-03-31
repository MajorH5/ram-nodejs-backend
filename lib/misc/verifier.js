const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 16;
const ALLOWED_USERNAME_CHARACTERS = /^[a-zA-Z0-9_]+$/;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

class Verifier {
    static validateEmail (email) {
        if (typeof email !== 'string') return 'Email must be a string';
        if (!EMAIL_REGEX.test(email)) return 'Invalid email format';
        if (email.length >= 300) return 'Email too long';

        return true;
    }

    static validatePassword (password) {
        if (typeof password !== 'string') return 'Password must be a string';
        if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) return `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long`;

        return true;
    }

    static validateUsername (username) {
        if (typeof username !== 'string') return 'Username must be a string';
        if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) return `Username must be between ${MIN_USERNAME_LENGTH} and ${MAX_USERNAME_LENGTH} characters long`;
        if (!ALLOWED_USERNAME_CHARACTERS.test(username)) return 'Username can only contain letters, numbers, and underscores';

        return true;
    }

    static validateVerificationToken (token) {
        if (typeof token !== 'string') return 'Token must be a string';

        return true;
    }
}

module.exports = Verifier;