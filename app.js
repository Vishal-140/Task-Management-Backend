require("dotenv").config();
require("./config/dbConfig.js");
const PORT = process.env.PORT || 1814;
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const User = require("./models/userModel.js");
const { generateOTP } = require("./utils/otpHelpers.js");
const { sendOtpEmail } = require("./utils/emailHelpers.js");
const { checkAndSendReminders } = require("./utils/reminderHelper");
const OTP = require("./models/otpModel.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const Task = require("./models/taskModel.js");

const cron = require("node-cron");

cron.schedule("* * * * *", () => {
    console.log("---- ---- ---- running a task every minute ---- ---- ----");
    checkAndSendReminders();
});

const app = express();

app.use(morgan("dev"));
app.use(cookieParser());

app.use(
    cors({
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        origin: process.env.FRONTEND_URL,
    })
); // this code allows only the frontend with origin "FRONTEND_URL" to talk with backend and
// It also allows him to send and receive the cookies

app.use(express.json());

app.use((req, res, next) => {
    console.log("=> Request received -->", req.url);
    next();
});


app.get("/", (req, res) => {
    res.send("<h1>Server is working fine ...</h1>");
});

app.get("/users", (req, res) => {
    try {
        // we will complete it after sometime
    } catch (err) {
        console.log("Error in GET /users");
        console.log(err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal Server Error " + err.message,
        });
    }
});

app.post("/users/register", async (req, res) => {
    try {
        const { email, password, otp, fullName } = req.body; // this is from user request

        // check if the OTP is present in db with this email or not
        const otpDoc = await OTP.findOne({
            email: email,
        }).sort("-createdAt"); // https://mongoosejs.com/docs/api/query.html

        // check if the otp was sent to email or not
        if (!otpDoc) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Either OTP is not sent to the given email or it is expired! Please try again!",
            });
            return;
        }

        const { otp: hashedOtp } = otpDoc; // renaming otp to hashedOtp to avoid conflict in variable names

        // verify if the otp is correct
        const isOtpCorrect = await bcrypt.compare(otp.toString(), hashedOtp);
        if (!isOtpCorrect) {
            res.status(401);
            res.json({
                status: "fail",
                message: "Invalid OTP !",
            });
            return;
        }

        // store the password securely
        const hashedPassword = await bcrypt.hash(password, 14);

        const newUser = await User.create({
            email,
            password: hashedPassword,
            fullName,
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

app.post("/otps", async (req, res) => {
    // const { email } = req.query; // for backend testing
    const { email } = req.body;   // for frontend

    // validate if the user is sending email
    if (!email) {
        res.status(400).json({
            status: "fail",
            message: 'Missing required parameter: "email"',
        });
        return;
    }

    // create 4 digit OTP
    const otp = generateOTP();
    // send the OTP to email
    const isEmailSent = await sendOtpEmail(email, otp);
    // isEmailSent can be true or false
    if (!isEmailSent) {
        // this is the case when isEmailSent is false
        res.status(500).json({
            status: "fail",
            message: "Email could not be sent! Please try again after 30 seconds!",
        });
        return;
    }

    // SALTING + HASHING the OTP to save in database
    const newSalt = await bcrypt.genSalt(14); // rounds-x == iterations pow(2,x)
    const hashedOtp = await bcrypt.hash(otp.toString(), newSalt);

    // store the OTP In database
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

app.post("/users/login", async (req, res) => {
    try {
        const { email, password } = req.body; // user will send plain password

        if (!email || !password) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email and password is required!",
            });
        }

        // check if the email is of a registered user
        const currUser = await User.findOne({ email: email });

        if (!currUser) {
            res.status(400);
            res.json({
                status: "fail",
                message: "User is not registered!",
            });
            return;
        }

        // match the password if email ...
        const { password: hashedPassword, fullName, _id } = currUser; // currUser --> DB document
        const isPasswordCorrect = await bcrypt.compare(password, hashedPassword);

        // if password is incorrect
        if (!isPasswordCorrect) {
            res.status(401);
            res.json({
                status: "fail",
                message: "Invalid email or password!",
            });
            return;
        }

        // issue a jwt token for the validating the user requests in future
        const token = jwt.sign(
            {
                email,
                _id,
                fullName,
            }, // payload
            process.env.JWT_SECRET_KEY, // secret key
            {
                expiresIn: "1d",
            } // extra options if you want
        );

        // console.log(token);

        // res.cookie method adds a cookie to frontend in the format :: name, value
        // frontend should allow the backend to perform cookie operations
        // in the request use -> credentials: "include" (when you use fetch API)
        // in the cors options on backend mention -> credentials: true
        res.cookie("authorization", token, {
            httpOnly: true, // it cannot be accessed by JS code on client machine
            secure: true, // it will be only sent on https connections
            sameSite: "None", // currently our backend is on separate domain and frontend is on separate domain
            // in production, when you host BE and FE on same domain, make it "Strict"
        });

        res.status(200);
        res.json({
            status: "success",
            message: "User logged in",
            data: {
                user: {
                    email,
                    fullName,
                },
            },
        });

        // send success
    } catch (err) {
        console.log("Error in login", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal Server Error",
        });
    }
});



// middleware to authorize the user 

app.use(cookieParser()); // it reads the cookies and add them to req object :: req.cookies

app.use((req, res, next) => {
    try {
        const { authorization } = req.cookies;
        // we check if authorization key is present in request cookies or not
        if (!authorization) {
            res.status(401);
            res.json({
                status: "fail",
                message: "Authorization failed!",
            });
            return;
        }

        // if authorization cookie is present then verify the token
        jwt.verify(authorization, process.env.JWT_SECRET_KEY, (error, data) => {
            if (error) {
                // that means token is invalid (hacking attempt) or expired
                res.status(401);
                res.json({
                    status: "fail",
                    message: "Authorization failed!",
                });
            } else {
                req.currUser = data;
                next();
            }
        });
    } catch (err) {
        console.log("Error in validation middleware", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal Server Error",
        });
    }
});

// CREATEs a task
app.post("/tasks", async (req, res) => {
    try {
        // 1. get the data from request
        const taskInfo = req.body;
        const { email } = req.currUser;

        const newTask = await Task.create({
            ...taskInfo,
            assignor: email,
        });

        res.status(201); //created
        res.json({
            status: "success",
            data: {
                task: newTask,
            },
        });
    } catch (err) {
        console.log("Error in POST /tasks", err.message);
        if (err.name === "ValidationError") {
            res.status(400).json({ status: "fail", message: err.message });
        } else if (err.code === 11000) {
            res.status(400).json({ status: "fail", message: err.message });
        } else {
            res.status(500).json({ status: "fail", message: "Internal Server Error" });
        }
    }
});

// users/me
app.get("/users/me", (req, res) => {
    try {
        const { email, fullName } = req.currUser;
        res.status(200);
        res.json({
            status: "success",
            data: {
                user: {
                    email,
                    fullName,
                },
            },
        });
    } catch (err) {
        console.log("error is GET /users/me", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "INTERNAL SERVER ERROR",
        });
    }
});

// users/logout
app.get("/users/logout", (req, res) => {
    try {
        res.clearCookie("authorization"); // Clearing the cookie
        res.json({
            status: "success",
            message: "User is logged out!",
        });
    } catch (error) {
        console.error("Logout Error:", error);
        res.status(500).json({
            status: "error",
            message: "Something went wrong while logging out!",
        });
    }
});


app.get("/tasks", async (req, res) => {
    try {
        // we only need to send the tasks where either assignor is the current user or assignee is current user
        const taskList = await Task.find().or([{ assignor: req.currUser.email }, { assignee: req.currUser.email }]);
        res.status(200);
        res.json({
            status: "success",
            data: {
                tasks: taskList,
            },
        });
    } catch (err) {
        console.log("error is GET /users/me", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "INTERNAL SERVER ERROR",
        });
    }
});

// PATCH - UPDATE
app.patch('/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const { workTitle, assignee, priority, status, taskInfo } = req.body;
        
        // check task exists and get current task data
        const existingTask = await Task.findById(taskId);
        
        if (!existingTask) {
            return res.status(404).json({
                status: "fail",
                message: "Task ID does not exist!",
            });
        }

        // current user is authorized to modify this task
        if (existingTask.assignor !== req.currUser.email && existingTask.assignee !== req.currUser.email) {
            return res.status(403).json({
                status: "fail",
                message: "You are not authorized to modify this task",
            });
        }

        const result = await Task.findByIdAndUpdate(
            taskId,
            { workTitle, assignee, priority, status, taskInfo },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            status: "success",
            data: { task: result }
        });
    } catch (error) {
        console.log("Error in PATCH", error.message);

        if (error.name === "CastError") {
            return res.status(400).json({
                status: "fail",
                message: "Invalid parameter",
            });
        }

        return res.status(500).json({
            status: "fail",
            message: "Internal server error",
        });
    }
});

// DELETE
app.delete('/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        // task exists and get current task data
        const existingTask = await Task.findById(taskId);
        
        if (!existingTask) {
            return res.status(404).json({
                status: "fail",
                message: "Task ID does not exist!",
            });
        }

        // Only task assignor can delete the task
        if (existingTask.assignor !== req.currUser.email) {
            return res.status(403).json({
                status: "fail",
                message: "Only the task creator can delete this task",
            });
        }

        await Task.findByIdAndDelete(taskId);
        return res.status(204).send();
    } catch (error) {
        console.log(error.message);

        if (error.name === "CastError") {
            return res.status(400).json({
                status: "fail",
                message: "Invalid parameter",
            });
        }

        return res.status(500).json({
            status: "fail",
            message: "Internal server error",
        });
    }
});


app.listen(PORT, () => {
    console.log(`--------- Server Started on PORT: ${PORT} ---------`);
});
