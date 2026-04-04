import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendVerificationEmail = async (to: string, token: string) => {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: `"Support" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Verify your email address',
    text: `Please verify your email by clicking on the following link: ${verifyUrl}`,
    html: `<p>Please verify your email by clicking on the following link: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };

  await transporter.sendMail(mailOptions);
};

export const sendOTPEmail = async (to: string, otp: string) => {
  const mailOptions = {
    from: `"Support" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your Verification Code',
    text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
    html: `<p>Your verification code is: <strong>${otp}</strong>.</p><p>It will expire in 10 minutes.</p>`,
  };

  await transporter.sendMail(mailOptions);
};
