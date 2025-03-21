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
            from: '"Task Management Tool" <dummyvkc@gmail.com>',
            to,
            subject,
            html,
        });
        console.log("Email sent:", info.messageId);
        return true;
    } catch (err) {
        console.log("Error occurred in sendEmail:", err.message);
        return false;
    }
};

const sendOtpEmail = async (email, otp) => {
    return await sendEmail(
        email,
        "OTP verification from Task Management Tool",
        `<p>Your OTP is <span style="color:brown">${otp}</span></p>`
    );
};

module.exports = {
    sendOtpEmail,
    sendEmail,
};