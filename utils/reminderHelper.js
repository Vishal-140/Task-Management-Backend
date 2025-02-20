const Task = require("../models/taskModel.js");
const { sendEmail } = require("./emailHelpers.js");

const createReminderHtml = (task) => {
    return `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #2c3e50;">Task Deadline Reminder</h2>
            <div style="background-color: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px;">
                <p><strong>Task Title:</strong> <span style="font-size: 28px">${task.taskTitle}</span></p>
                <p><strong>Assignor:</strong> ${task.assignor || 'N/A'}</p>
                <p><strong>Assignee:</strong> ${task.assignee || 'N/A'}</p>
                <p><strong>Deadline:</strong> ${task.deadline.toLocaleString()}</p>
                <p><strong>Priority:</strong> 
                    <span style="color: ${task.priority === 'urgent' ? '#e74c3c' :
            task.priority === 'high' ? '#e67e22' :
                task.priority === 'normal' ? '#3498db' : '#7f8c8d'
        };">
                    ${task.priority.toUpperCase()}
                    </span>
                </p>
                <p><strong>Current Status:</strong> ${task.status}</p>
            </div>
            <p style="color: #7f8c8d;">Please take necessary action before the deadline.</p>
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="color: #95a5a6;">Best regards,<br>Task Management Tool</p>
            </div>
        </div>
    `;
};

const sendTaskReminder = async (task) => {
    try {
        const reminderHtml = createReminderHtml(task);
        const subject = `Task Reminder: "${task.taskTitle}" Deadline Approaching`;

        // Send to assignee
        const assigneeEmailSent = await sendEmail(task.assignee, subject, reminderHtml);
        // Send to assignor
        const assignorEmailSent = await sendEmail(task.assignor, subject, reminderHtml);

        if (assigneeEmailSent || assignorEmailSent) {
            await Task.findByIdAndUpdate(task._id, {
                reminderSent: true,
                lastReminderDate: new Date(),
            });
            console.log(`Reminder sent for task: ${task.taskTitle}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error sending task reminder:", error);
        return false;
    }
};

const checkAndSendReminders = async () => {
    try {
        const currentTime = new Date(); // Now
        const next24Hours = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
        const lastReminderThreshold = new Date(currentTime.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

        const tasks = await Task.find({
            status: { $nin: ['done', 'abandoned'] }, // Tasks that shouldn't receive reminders
            deadline: { $gte: currentTime, $lte: next24Hours }, // Tasks due within the next 24 hours
            $or: [
                { reminderSent: { $ne: true } }, // Tasks that haven't received a reminder
                { lastReminderDate: { $lte: lastReminderThreshold } } // Tasks that were reminded more than 12 hours ago
            ]
        });

        console.log(`Found ${tasks.length} tasks needing reminders`);

        for (const task of tasks) {
            const hoursUntilDeadline = (task.deadline - currentTime) / (1000 * 60 * 60); // Changed `now` to `currentTime`

            // Check based on priority
            let shouldSendReminder = false;
            if (task.priority === 'urgent' && hoursUntilDeadline <= 4) shouldSendReminder = true;
            else if (task.priority === 'high' && hoursUntilDeadline <= 12) shouldSendReminder = true;
            else if (task.priority === 'normal' && hoursUntilDeadline <= 24) shouldSendReminder = true;
            else if (task.priority === 'low' && hoursUntilDeadline <= 48) shouldSendReminder = true;

            if (shouldSendReminder) {
                await sendTaskReminder(task);
            }
        }
    } catch (error) {
        console.error("Error checking reminders:", error);
    }
};

module.exports = {
    checkAndSendReminders,
    sendTaskReminder,
};
