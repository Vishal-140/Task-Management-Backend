const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    auth: {
        user: process.env.SEND_MAIL_GMAIL_ACCOUNT,
        pass: process.env.SEND_MAIL_GMAIL_ACCOUNT_PASSWORD,
    },
});

const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: '"Task Management Tool" <vkcshorts@gmail.com>',
            to,
            subject,
            html,
        });
        console.log(info.messageId);
        return true;
    } catch (err) {
        console.log("Error occurred in sendEmail");
        console.log(err.message);
        return false;
    }
};


const sendOtpEmail = async (email, otp) => {
    const isEmailSent = await sendEmail(
        email,
        "OTP verification from Task Management Tool",
        `<p>Your OTP is <span style="color:brown">${otp}</span></p>`
    );

    return isEmailSent;
};

module.exports = {
    sendOtpEmail,
};