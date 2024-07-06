// utils/sendOtp.js
const nodemailer = require("nodemailer");

async function sendOtp(email, otp) {
    try {
        // Create a Nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
        });


        // Send the email
        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: `Email OTP - Ametheus Health`,
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Email OTP</title>
            </head>
            <body>
                <h1>New Email OTP</h1>
                <div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
                    <div style="margin:50px auto;width:70%;padding:20px 0">
                        <div style="border-bottom:1px solid #eee">
                        <a href="https://www.ametheushealth.com/" style="font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600">Assetorix</a>
                        </div>
                        <p style="font-size:1.1em">Hi,</p>
                        <p>Thank you for choosing Ametheus Health. Use the following OTP to update your Email. OTP is valid for next 15 minutes</p>
                        <h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${otp}</h2>
                        <p style="font-size:0.9em;">Regards,<br />Ametheus Health</p>
                        <hr style="border:none;border-top:1px solid #eee" />
                        <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
                        <p>Ametheus Health</p>
                        <p>Green Park, New Delhi</p>
                        <p>India</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        return { "status": true, "msg": info };
    } catch (error) {
        console.log(error);
        return { "status": false, "msg": error };
    }
}


module.exports = sendOtp;