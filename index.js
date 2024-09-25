const dotenv = require('dotenv'); dotenv.config();

const CommentsDatabase = require('./lib/misc/commentsDatabase.js');
const UserDatabase = require('./lib/users/userDatabase.js');
const PostDatabase = require('./lib/misc/postDatabase.js');
const MailAgent = require('./lib/misc/mailAgent.js');
const Verifier = require('./lib/misc/verifier.js');
const NotificationsDatabase = require('./lib/misc/notificationsDatabase.js');

const uglyify = require('uglify-js');
const minify = require('express-minify');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
var winston = require('winston'),
    expressWinston = require('express-winston');
const ReportsDatabase = require('./lib/misc/reportsDatabase.js');
const app = express();

const VERIFY_EMAIL = fs.readFileSync('./resources/verify.email', 'utf8');
const RESET_EMAIL = fs.readFileSync('./resources/reset.email', 'utf8');
const FOROHFOR = fs.readFileSync('./resources/404.html', 'utf8');

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
    app.use(expressWinston.logger({
        transports: [
            new winston.transports.Console()
        ],
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(info => {
                const { message, meta } = info;
                const ip = meta.req ? meta.req.ip : 'unknown';
                return `${ip} - ${message}`;
            })
        ),
        dynamicMeta: function (req, res) {
            return {
                req: {
                    ip: req.socket.remoteAddress,
                    method: req.method,
                    path: req.path
                }
            };
        },
        expressFormat: true,
        colorize: true,
        ignoreRoute: function (req, res) { 
            return [
                '/lib', '/assets', '/legal',
                '/styles.css', '/index.js', '/favicon.ico',
                '/robots.txt'
            ].some(path => req.path.startsWith(path));
         }
    }));
}

app.use(express.static('RotMG-Art-Maker/public', {
    extensions: ['html', 'htm']
}));

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

    res.setHeader('Set-Cookie', `token=${result.token}; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000`);
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
    
    MailAgent.sendMail(email, '[Action Required] RealmSpriter Verify your email', contents);

    res.setHeader('Set-Cookie', `token=${loginResult.token}; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000`);
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
            console.log(noteResult.error);
            res.status(400).send({ error: 'An unknown error occured, try again later' });
            return;
        }

        // random code
        const code = bcrypt.hashSync(Math.random().toString(), 10).replace(/\W/g, '').slice(0, 6);
        const setResult = await UserDatabase.setResetPasswordCode(userResult.id, code);

        if (setResult.error) {
            console.log(setResult.error);
            res.status(400).send({ error: 'An unknown error occured, try again later' });
            return;
        }

        const contents = RESET_EMAIL
            .replace('[[[LINK]]]', `${HOST}?tst=${result.token}&code=${code}`)
            .replace('[[[USERNAME]]]', userResult.username)
            .replace('[[[DURATION]]]', '1 day');

        MailAgent.sendMail(email, '[Action Required] RealmSpriter Reset your password', contents);
    } else if (!result.error && !userResult.error && !canReset) {
        res.status(400).send({ message: 'Too many attempts, please try again later' });
        return;
    }
 
    res.status(200).send({ message: 'Sent!' });
});

app.post('/set-password', async (req, res) => {
    const { token, code, password } = req.body;

    const validationResults = [
        Verifier.validatePassword(password)
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

    const resetCode = await UserDatabase.getPasswordCode(userResult.details.userId);
    
    if (resetCode.error) {
        res.status(400).send({ error: resetCode.error });
        return;
    }

    if (resetCode.code !== code) {
        res.status(400).send({ error: 'Invalid code' });
        return;
    }

    const result = await UserDatabase.changePassword(token, null, password);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Password changed successfully' });
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

    MailAgent.sendMail(userResult.details.email, '[Action Required] RealmSpriter Verify your email', contents);

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

    const result = await PostDatabase.createPost(userResult.details.userId, name, tags, image, type, isAnimated);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Post created successfully' });
});

app.post('/delete-post', async (req, res) => {
    const { postid, token } = req.body;

    if (typeof postid !== 'number' || postid % 1 !== 0) {
        res.status(400).send({ error: 'Invalid query parameters' });
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

    if (postResult.user_id !== userResult.details.userId && !userResult.details.isAdmin) {
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

app.post('/get-post', async (req, res) => {
    const { postid } = req.body;

    if (typeof postid !== 'number' || postid % 1 !== 0) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const result = await PostDatabase.getPost(postid);

    if (result !== null && result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({result});
});

app.post('/get-posts', async(req, res) => {
    const { mineOnly, tags, type, offset, token } = req.body;
    
    if (
        typeof mineOnly !== 'boolean' ||
        typeof offset !== 'number' ||
        offset % 1 !== 0 ||
        !Array.isArray(tags) ||
        typeof type !== 'string' ||
        (token && typeof token !== 'string')
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    if (mineOnly) {
        const userResult = await UserDatabase.getUserByToken(token);

        if (userResult.error) {
            res.status(400).send({ error: userResult.error });
            return;
        }

        const result = await PostDatabase.searchUserPosts(userResult.details.userId, tags, type, offset);

        if (result.error) {
            res.status(400).send({ error: result.error });
            return;
        }

        res.status(200).send(result);
    } else {
        const result = await PostDatabase.searchAllPosts(tags, type, offset);

        if (result.error) {
            res.status(400).send({ error: result.error });
            return;
        }

        res.status(200).send(result);
    }
});

app.post('/report-post', async (req, res) => {
    const { postid, reason, token } = req.body;

    if (
        typeof postid !== 'number' ||
        postid % 1 !== 0 ||
        !Array.isArray(reason) ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const validateReason = Verifier.validateReportReason(reason);

    if (validateReason !== true) {
        res.status(400).send({ error: validateReason });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await ReportsDatabase.createReport(userResult.details.userId, postid, reason.join(', '), 'post');

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Post reported successfully' });
});

app.post('/get-comments', async (req, res) => {
    const { postId, offset, token } = req.body;

    if (
        typeof postId !== 'number' ||
        postId % 1 !== 0 ||
        postId < 1 ||
        typeof offset !== 'number' ||
        offset % 1 !== 0
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    let result;

    if (typeof token === 'string') {
        const userResult = await UserDatabase.getUserByToken(token);

        if (userResult.error) {
            res.status(400).send({ error: userResult.error });
            return;
        }

        result = await CommentsDatabase.getComments(postId, offset, userResult.details.userId);
    } else {
        result = await CommentsDatabase.getComments(postId, offset);
    }

    res.status(200).send(result);
});

app.post('/get-comment', async (req, res) => {
    const { commentId, token } = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        (token && typeof token !== 'string')
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }
    
    let result;

    if (typeof token === 'string') {
        const userResult = await UserDatabase.getUserByToken(token);

        if (userResult.error) {
            res.status(400).send({ error: userResult.error });
            return;
        }

        result = await CommentsDatabase.getComment(commentId, userResult.details.userId);
    } else {
        result = await CommentsDatabase.getComment(commentId);
    }

    if (result !== null && result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send(result);
});

app.post('/get-reply-comments', async (req, res) => {
    const { commentId, offset, token} = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        typeof offset !== 'number' ||
        offset % 1 !== 0
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    let result;

    if (typeof token === 'string') {
        const userResult = await UserDatabase.getUserByToken(token);

        if (userResult.error) {
            res.status(400).send({ error: userResult.error });
            return;
        }

        result = await CommentsDatabase.getReplyComments(commentId, offset, userResult.details.userId);
    } else {
        result = await CommentsDatabase.getReplyComments(commentId, offset);
    }

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send(result);
});

app.post('/create-comment', async (req, res) => {
    const { postId, content, token } = req.body;

    if (
        typeof postId !== 'number' ||
        postId % 1 !== 0 ||
        postId < 1 ||
        typeof content !== 'string' ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const validateComment = Verifier.validateComment(content);

    if (validateComment !== true) {
        res.status(400).send({ error: validateComment });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await CommentsDatabase.createComment(postId, userResult.details.userId, content);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send(result);
});

app.post('/reply-comment', async (req, res) => {
    const { commentId, content, token } = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        typeof content !== 'string' ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const validateComment = Verifier.validateComment(content);

    if (validateComment !== true) {
        res.status(400).send({ error: validateComment });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await CommentsDatabase.replyComment(commentId, userResult.details.userId, content);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send(result);
});

app.post('/delete-comment', async (req, res) => {
    const { commentId, token } = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const deleteResult = await CommentsDatabase.deleteComment(commentId, userResult.details.userId);

    if (deleteResult.error) {
        res.status(400).send({ error: deleteResult.error });
        return;
    }

    res.status(200).send({ message: 'Comment deleted successfully' });
});

app.post('/interact-comment', async (req, res) => {
    const { commentId, status, token } = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        typeof status !== 'string' ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const validateStatus = Verifier.validCommentStatus(status);

    if (validateStatus !== true) {
        res.status(400).send({ error: validateStatus });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await CommentsDatabase.updateLikeStatus(commentId, userResult.details.userId, status);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Comment updated successfully' });
});

app.post('/report-comment', async (req, res) => {
    const { commentId, reason, token } = req.body;

    if (
        typeof commentId !== 'number' ||
        commentId % 1 !== 0 ||
        commentId < 1 ||
        !Array.isArray(reason) ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const validateReason = Verifier.validateReportReason(reason);

    if (validateReason !== true) {
        res.status(400).send({ error: validateReason });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await ReportsDatabase.createReport(userResult.details.userId, commentId, reason.join(', '), 'comment');

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Comment reported successfully' });
});

app.post('/get-notifications', async (req, res) => {
    const { token, offset } = req.body;

    if (
        typeof token !== 'string' ||
        (offset && (typeof offset !== 'number' || offset % 1 !== 0))
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await NotificationsDatabase.getNotifications(userResult.details.userId, offset);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send(result);
});

app.post('/read-notification', async (req, res) => {
    const { notificationId, token } = req.body;

    if (
        typeof notificationId !== 'number' ||
        notificationId % 1 !== 0 ||
        notificationId < 1 ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await NotificationsDatabase.readNotification(userResult.details.userId, notificationId);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Notification read successfully' });
});

app.post('/delete-notification', async (req, res) => {
    const { notificationId, token } = req.body;

    if (
        typeof notificationId !== 'number' ||
        notificationId % 1 !== 0 ||
        notificationId < 1 ||
        typeof token !== 'string'
    ) {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await NotificationsDatabase.deleteNotification(userResult.details.userId, notificationId);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'Notification deleted successfully' });
});

app.post('/delete-all-notifications', async (req, res) => {
    const { token } = req.body;

    if (typeof token !== 'string') {
        res.status(400).send({ error: 'Invalid query parameters' });
        return;
    }

    const userResult = await UserDatabase.getUserByToken(token);

    if (userResult.error) {
        res.status(400).send({ error: userResult.error });
        return;
    }

    const result = await NotificationsDatabase.deleteAllNotifications(userResult.details.userId);

    if (result.error) {
        res.status(400).send({ error: result.error });
        return;
    }

    res.status(200).send({ message: 'All notifications deleted successfully' });
});

app.get('*', (req, res) => {
    res.status(404).send(FOROHFOR);
});

(async function () {
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