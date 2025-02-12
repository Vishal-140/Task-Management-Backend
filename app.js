require("dotenv").config();
require("./config/dbConfig.js");
const PORT = process.env.PORT || 1814;
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const User = require("./models/userModel.js");
const { generateOTP } = require("./utils/otpHelpers.js");
const { sendOtpEmail } = require("./utils/emailHelpers.js");
const OTP = require("./models/otpModel.js");

const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log("request received --> ", req.url);
    next();
});

app.get("/", (req, res) => {
    res.send("<h1>Server is working fine ...</h1>");
});

app.use(morgan("dev"));

app.get("/users", async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json({ status: "success", data: users });
    } catch (err) {
        console.log("Error in GET /users", err.message);
        res.status(500).json({ status: "fail", message: "Internal Server Error " + err.message });
    }
});

// POST
app.post("/users", async (req, res) => {
    try {
        const userInfo = req.body;
        const newUser = await User.create(userInfo);
        res.status(201).json({
            status: "success",
            data: {
                user: {
                    email: newUser.email,
                    fullName: newUser.fullName,
                },
            },
        });
    } catch (err) {
        console.log("--- Error in /POST users ---", err.name, err.code, err.message);
        if (err.name === "ValidationError") {
            res.status(400).json({ status: "fail", message: "Data validation failed: " + err.message });
        } else if (err.code === 11000) {
            res.status(400).json({ status: "fail", message: "Email already exists!" });
        } else {
            res.status(500).json({ status: "fail", message: "Internal Server Error" });
        }
    }
});

// OTPS
app.post("/otps", async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ status: "fail", message: 'Missing required parameter: "email"' });
    }

    const otp = generateOTP();
    const isEmailSent = await sendOtpEmail(email, otp);

    if (!isEmailSent) {
        return res.status(500).json({ status: "fail", message: "Email could not be sent! Please try again after 30 seconds!" });
    }

    await OTP.create({ email, otp });
    res.status(201).json({ status: "success", message: `OTP sent to ${email}` });
});



app.listen(PORT, () => {
    console.log(`--------- Server Started on PORT: ${PORT} ---------`);
});
