const dotenv = require('dotenv'); dotenv.config();

const UserDatabase = require('./lib/users/userDatabase.js');
const PostDatabase = require('./lib/misc/postDatabase.js');
const Database = require('./lib/misc/database.js');
const MailAgent = require('./lib/misc/mailAgent.js');
const Verifier = require('./lib/misc/verifier.js');

const uglyify = require('uglify-js');
const minify = require('express-minify');
const jwt = require('jsonwebtoken');
const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const app = express();

const VERIFY_EMAIL = fs.readFileSync('./verify.email', 'utf8');
const RESET_EMAIL = fs.readFileSync('./reset.email', 'utf8');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT;
const HOST = process.env.HOST;

app.use(express.json());
app.use(cors());

if (IS_PRODUCTION) {
    if (!fs.existsSync('./cache')) {
        fs.mkdirSync('./cache');
    } else {
        fs.readdirSync('./cache').forEach(file => {
            fs.unlinkSync(`./cache/${file}`);
        });
    }
    app.use((req, res, next) => {
        res.minifyOptions = res.minifyOptions || {};
        res.minifyOptions.js = {
            toplevel: true
        };
        next();
    });
    app.use(minify({
        cache: './cache',
        uglifyJsModule: uglyify,
    }));
}
app.use(express.static('RotMG-Art-Maker/public'));

app.get('/verify', async (req, res) => {
    let { id } = req.query;

    const validId = Verifier.validateVerificationToken(id)

    if (validId !== true) {
        res.status(400).send(validId);
        return;
    }

    const result = await UserDatabase.verifyUser(id);

    if (result.error) {
        res.status(400).send(result.error);
        return;
    }

    res.status(200).send('Account verified successfully! You may close this tab.');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const validationResults = [
        Verifier.validateEmail(email),
        Verifier.validatePassword(password)
    ];

    const errors = validationResults.filter(result => result !== true);

    if (errors.length > 0) {
        res.status(400).send({ error: errors[0] });
        return;
    }

    const result = await UserDatabase.login(email, password);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.setHeader('Set-Cookie', `token=${result.token}; Secure; HttpOnly; SameSite=Strict`);
    res.status(200).send(result);
});

app.post('/logout', async (req, res) => {
    const { token } = req.body;

    const result = await UserDatabase.logout(token);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Logged out successfully' });
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const ip = req.socket.remoteAddress;

    const validationResults = [
        Verifier.validateUsername(username),
        Verifier.validateEmail(email),
        Verifier.validatePassword(password)
    ];

    const errors = validationResults.filter(result => result !== true);

    if (errors.length > 0) {
        res.status(400).send({ error: errors[0] });
        return;
    }
    
    if (await UserDatabase.emailExists(email)) {
        res.status(400).send({ error: 'Email already exists'});
        return;
    }

    if (await UserDatabase.usernameExists(username)) {
        res.status(400).send({ error: 'Username already exists'});
        return;
    }

    const createResult = await UserDatabase.createUser(username, email, password, ip);

    if (createResult.error) {
        res.status(400).send({ error: createResult.error });
        return;
    }

    const tokenResult = await UserDatabase.createVerificationToken(email);

    if (tokenResult.error) {
        res.status(400).send({ error: tokenResult.error });
        return;
    }
    
    const loginResult = await UserDatabase.login(email, password);

    if (loginResult.error) {
        res.status(400).send({ error: loginResult.error });
        return;
    }
    
    const contents = VERIFY_EMAIL
        .replace('[[[LINK]]]', `${HOST}/verify?id=${loginResult.token}`)
        .replace('[[[USERNAME]]]', username)
        .replace('[[[DURATION]]]', '1 day');
    
    MailAgent.sendMail(email, '[Action Required] RotMGArtMaker Verify your email', contents);

    res.setHeader('Set-Cookie', `token=${loginResult.token}; Secure; HttpOnly; SameSite=Strict`);
    res.status(200).send(loginResult);
});

app.get('/forgot-password', (req, res) => {

});

app.post('/reset-password', async (req, res) => {
    const { email } = req.body;

    const result = await UserDatabase.login(email, null, true);
    const userResult = await UserDatabase.getUserByEmail(email);
    const canReset = await UserDatabase.canUserResetPassword(email);

    if (!result.error && !userResult.error && canReset) {
        const noteResult = await UserDatabase.notePasswordReset(email);

        if (noteResult.error) {
            res.status(400).send({ error: 'An unknown error occured, try again later' });
            return;
        }

        const contents = RESET_EMAIL
            .replace('[[[LINK]]]', `${HOST}?tst=${result.token}`)
            .replace('[[[USERNAME]]]', userResult.username)
            .replace('[[[DURATION]]]', '1 day');

        MailAgent.sendMail(email, '[Action Required] RotMGArtMaker Reset your password', contents);
    } else if (!result.error && !userResult.error && !canReset) {
        res.status(400).send({ message: 'Too many attempts, please try again later' });
        return;
    }
 
    res.status(200).send({ message: 'Sent!' });
});

app.post('/me', async (req, res) => {
    const { token } = req.body;

    let result = await UserDatabase.getUserByToken(token);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        console.log(e);
        res.status(400).send({ error: 'Invalid token' });
        return;
    }

    if (decoded.isTemporary) {
        const newUser = await UserDatabase.login(decoded.email, null);

        if (newUser.error) {
            res.status(400).send({ error: 'An unexpected error occured' });
            return;
        }

        result = newUser;
    }

    res.status(200).send(result);
});

app.post('/change-password', async (req, res) => {
    const { token, currentPassword, newPassword } = req.body;

    const validationResults = [
        Verifier.validatePassword(currentPassword),
        Verifier.validatePassword(newPassword)
    ];

    const errors = validationResults.filter(result => result !== true);

    if (errors.length > 0) {
        res.status(400).send({ error: errors[0] });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await UserDatabase.changePassword(token, currentPassword, newPassword);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Password changed successfully' });
});

app.post('/resend-verification', async (req, res) => {
    const { token } = req.body;

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const tokenResult = await UserDatabase.createVerificationToken(userResult.details.email);

    if (tokenResult.error) {
        res.status(400).send({ error: tokenResult.error });
        return;
    }
    
    const contents = VERIFY_EMAIL
        .replace('[[[LINK]]]', `${HOST}/verify?id=${tokenResult.token}`)
        .replace('[[[USERNAME]]]', userResult.details.username)
        .replace('[[[DURATION]]]', '1 day');

    MailAgent.sendMail(userResult.details.email, '[Action Required] RotMGArtMaker Verify your email', contents);

    res.status(200).send({ message: 'Verification email sent' });
});

app.post('/create-post', async (req, res) => {
    const { name, tags, image, type, isAnimated, token } = req.body;
    
    const validationResults = [
        Verifier.validatePostName(name),
        Verifier.validateTags(tags),
        Verifier.validateImage(image, isAnimated),
        Verifier.validatePostType(type)
    ];

    const errors = validationResults.filter(result => result !== true);

    if (errors.length > 0) {
        res.status(400).send({ error: errors[0] });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await PostDatabase.createPost(userResult.id, name, tags, image, type);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Post created successfully' });
});

app.post('/delete-post', async (req, res) => {
    const { postid, token } = req.body;

    const validationResults = [
        Verifier.validatePostId(postid),
        Verifier.validateToken(token)
    ];

    const errors = validationResults.filter(result => result !== true);

    if (errors.length > 0) {
        res.status(400).send({ error: errors[0] });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const postResult = await PostDatabase.getPost(postid);

    if (postResult.error) {
        res.status(400).send({ error: postResult.error });
        return;
    }

    if (postResult.user_id !== userResult.userId) {
        res.status(400).send({ error: 'Unauthorized' });
        return;
    }

    const deleteResult = await PostDatabase.deletePost(postid);

    if (deleteResult.error) {
        res.status(400).send({ error: deleteResult.error });
        return;
    }

    res.status(200).send({ message: 'Post deleted successfully' });
});

app.post('/get-posts', async(req, res) => {
    const { mineOnly, tags, type, pageIndex, token } = req.body;
    
    if (typeof mineOnly !== 'boolean' || typeof pageIndex !== 'number' || !Array.isArray(tags) || typeof type !== 'string' || (token && typeof token !== 'string') || pageIndex < 0) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    if (mineOnly) {
        const userResult = await UserDatabase.getUserByToken(token);

        if (userResult.error) {
            res.status(400).send({ error: userResult.error });
            return;
        }

        const result = await PostDatabase.searchUserPosts(userResult.id, tags, 0);

        if (result.error) {
            res.status(400).send({ error: result.error });
            return;
        }

        res.status(200).send(result);
    } else {
        const result = await PostDatabase.searchAllPosts(tags, type, pageIndex);

        if (result.error) {
            res.status(400).send({ error: result.error });
            return;
        }

        res.status(200).send(result);
    }
});

(async function () {
    await Database.connect();

    if (IS_PRODUCTION) {
        const options = {
            key: fs.readFileSync('private.key'),
            cert: fs.readFileSync('public.crt'),
            ca: fs.readFileSync('public.ca-bundle')
        };

        https.createServer(options, app).listen(PORT, () => {
            console.log(`PRODUCTION: Server running on port ${PORT}`);
        });

        const httpRedirect = express();
        httpRedirect.get('*', (req, res) => {
            res.redirect(`https://${req.headers.host}${req.url}`);
        });

        httpRedirect.listen(80, () => {
            console.log('PRODUCTION: Redirecting HTTP to HTTPS');
        });
    } else {
        app.listen(PORT, () => {
            console.log(`DEV: Server running on port ${HOST}:${PORT}/`);
        });
    }
})();