const nodeMailer = require('nodemailer');

class MailAgent {
    static transporter = nodeMailer.createTransport({
        host: 'mail.privateemail.com',
        port: 465,
        auth: {
            user: 'noreply-verification@rotmgartmaker.com',
            pass: 'oryxBiggyMad55'
        }
    });

    static async sendMail (to, subject, text) {
        const mailOptions = {
            from: 'noreply-verification@rotmgartmaker.com',
            to,
            subject,
            text,
            html: text
        };

        return MailAgent.transporter.sendMail(mailOptions);
    }
}

module.exports = MailAgent;