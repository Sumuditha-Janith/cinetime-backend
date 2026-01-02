import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendOTPEmail = async (to: string, otp: string): Promise<void> => {
  const mailOptions = {
    from: `"CINETIME" <${process.env.EMAIL_USER}>`,
    to,
    subject: "CINETIME - Email Verification OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2>Welcome to CINETIME 🎬</h2>
        <p>Your OTP for email verification is:</p>
        <h1 style="background: #1a202c; color: white; padding: 15px; text-align: center; border-radius: 8px;">
          ${otp}
        </h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <p style="color: #666;">© 2024 CINETIME. All rights reserved.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};