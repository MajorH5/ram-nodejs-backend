const nodeMailer = require('nodemailer');

class MailAgent {
    static transporter = nodeMailer.createTransport({
        host: process.env.MAIL_HOST,
        port: 465,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD
        }
    });

    static async sendMail (to, subject, text) {
        const mailOptions = {
            from: process.env.MAIL_USER,
            to,
            subject,
            text,
            html: text
        };

        return MailAgent.transporter.sendMail(mailOptions);
    }
}

module.exports = MailAgent;