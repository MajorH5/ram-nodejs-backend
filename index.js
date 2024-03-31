const dotenv = require('dotenv'); dotenv.config();

const UserDatabase = require('./lib/users/userDatabase.js');
const Database = require('./lib/misc/database.js');
const MailAgent = require('./lib/misc/mailAgent.js');
const Verifier = require('./lib/misc/verifier.js');

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const app = express();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT;
const HOST = process.env.HOST;

app.use(express.json());
app.use(cors());
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
    
    MailAgent.sendMail(email, '[Action Required] RotMGArtMaker Verify your email', 
        `Dear <b>${username}</b>,<br/><br/>Please verify your new account by clicking the link below:<br/><br/><a href="${HOST}/verify?&id=${tokenResult.token}" target="_blank">Click here to verify your email address</a><br/><br/>`);
    
    res.setHeader('Set-Cookie', `token=${loginResult.token}; Secure; HttpOnly; SameSite=Strict`);
    res.status(200).send(loginResult);
});

app.get('/forgot-password', (req, res) => {

});

app.get('/reset-password', (req, res) => {
    
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