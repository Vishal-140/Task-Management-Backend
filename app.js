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
const bcrypt = require("bcrypt");


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

// POST  --- /users/register
app.post("/users/register", async (req, res) => {
    try {
        const otpDoc = await OTP.findOne({
            email: email,
        }).sort("-createdAt ");

        if(!otpDoc){
            res.status(400);
            res.json({
                status: "fail",
                message: "Either OTP not send to email or OTP is expired",
            })
            return;
        }

        const {otp : hashedOtp} = otpDoc;
        const isOtpCorrect = await bcrypt.compare(otp.toString(), hashedOtp);

        if(!isOtpCorrect){
            res.status(401);
            res.json({
                status: "fail",
                message: "invalid OTP",
            })
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 14);

        const newUser = await User.create({
            email,
            password: hashedPassword,
        }); // put user data in database

        res.status(201);
        res.json({
            status: "success",
            data: {
                user: {
                    email: newUser.email,
                    fullName: newUser.fullName,
                },
            },
        });
    } catch (err) {
        console.log("--- Error in /POST users ---");
        console.log(err.name, err.code);
        console.log(err.message);
        if (err.name === "ValidationError") {
            // mistake of client that he has not sent the valid data
            res.status(400);
            res.json({
                status: "fail",
                message: "Data validation failed: " + err.message,
            });
        } else if (err.code === 11000) {
            // mistake of client that he is using the email which already registered
            res.status(400);
            res.json({
                status: "fail",
                message: "Email already exists!",
            });
        } else {
            // generic mistake by server
            res.status(500);
            res.json({
                status: "fail",
                message: "Internal Server Error",
            });
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
        // this is the case when isEmailSent is false
        res.status(500).json({
            status: "fail",
            message: "Email could not be sent! Please try again after 30 seconds!",
        });
        return;
    }

    // store the OTP in database
    // store it in secured way
    const newSalt = await bcrypt.genSalt(14); // rounds-x == iterations pow(2,x)
    const hashedOtp = await bcrypt.hash(otp.toString(), newSalt);

    await OTP.create({
        email,
        otp: hashedOtp,
    });
    // send the success response
    res.status(201);
    res.json({
        status: "success",
        message: `OTP sent to ${email}`,
    });
});


app.listen(PORT, () => {
    console.log(`--------- Server Started on PORT: ${PORT} ---------`);
});
