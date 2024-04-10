const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;
const ALLOWED_PASSWORD_CHARACTERS = /^[a-zA-Z0-9!@#$%^&*()\-_+=~]*$/;

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 16;
const ALLOWED_USERNAME_CHARACTERS = /^[a-zA-Z0-9_]+$/;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const ALLOWED_POST_TYPES = ['Items', 'Entities', 'Tiles', 'Objects', 'Misc'];
const MAX_RGB_COLOR_VALUE = 16777215;

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
        if (!ALLOWED_PASSWORD_CHARACTERS.test(password)) return 'Password can only contain letters, numbers, and special characters (e.g. !@#$%^&*()-_+=~)';

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

    static validateTags (tags) {
        if (!Array.isArray(tags)) return 'Tags must be an array';
        if (tags.some(tag => typeof tag !== 'string')) return 'Tags must be strings';
        if (tags.filter(tag => tag.trim()).join(', ').length > 256) return 'Tags too long';

        return true;
    }

    static validatePostName (name) {
        if (typeof name !== 'string') return 'Name must be a string';
        if (name.length > 100) return 'Name too long';
        if (name.length < 1) return 'Name too short';

        return true;
    }

    static validateImage (image, isAnimated) {
        if (typeof image !== 'object') return 'Image must be an object';
        if (typeof isAnimated !== 'boolean') return 'isAnimated must be a boolean';

        if (typeof image.size !== 'object') return 'Image size must be a number';
        if (typeof image.size.x !== 'number' || typeof image.size.y !== 'number') return 'Image size must be a vector2';

        if (image.size.x < 0 || image.size.y < 0) return 'Image size must be positive';
        if (image.size.x % 1 !== 0 || image.size.y % 1 !== 0) return 'Image size must be an integer';

        const validatePixelArray = (pixels, width, height) => {
            if (!Array.isArray(pixels)) return 'Image must be an array';
            if (pixels.length !== width * height) return 'Image size does not match image array size';
            if (pixels.some(pixel => typeof pixel !== 'number')) return 'Image pixels must be numbers';
            if (pixels.some(pixel => pixel < -1 || pixel > MAX_RGB_COLOR_VALUE)) return 'Invalid RGB color value';
            if (pixels.some(pixel => pixel % 1 !== 0)) return 'RGB color values must be integers';
            
            return true;
        };

        const frames = ['stand', 'walk1', 'walk2', 'attack1', 'attack2'];
        if (isAnimated) {
            const results = frames.map((frame, index) => validatePixelArray(image[frame], image.size.x * (index === frames.length - 1 ? 2 : 1), image.size.y));
            
            for (const result of results) {
                if (result !== true) return result;
            }
        } else {
            const result = validatePixelArray(image.pixels, image.size.x, image.size.y);
            if (result !== true) return result;
        }

        const allowedKeys = ['size', 'pixels', ...frames];

        for (const key in image) {
            if (!allowedKeys.includes(key)) return 'Invalid image key';
        }

        return true;
    }

    static validatePostId (id) {
        if (typeof id !== 'number') return 'Post ID must be a number';
        if (id < 0) return 'Post ID is invalid';

        return true;
    }

    static validatePostType (type) {
        if (typeof type !== 'string') return 'Type must be a string';
        if (!ALLOWED_POST_TYPES.includes(type)) return 'Invalid post type';
        
        return true;
    }
}

module.exports = Verifier;