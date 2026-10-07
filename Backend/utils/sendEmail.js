const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      family: 4
    });

    const mailOptions = {
      from: `"Gunpla Hub" <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully: ", info.response);
    return info;
  } catch (error) {
    console.error("Nodemailer send failed:", error);
    throw error;
  }
};

module.exports = sendEmail;