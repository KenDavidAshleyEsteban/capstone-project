const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // Uses SSL/TLS for secure connection
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      // Prevents self-signed certificate rejection errors on cloud hosts
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: `"Gunpla Hub" <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.html
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};

module.exports = sendEmail;