const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    const data = await resend.emails.send({
      from: "Gunpla Hub <onboarding@resend.dev>",
      to: options.email,
      subject: options.subject,
      html: options.html
    });
    console.log("Email sent successfully via Resend:", data);
    return data;
  } catch (error) {
    console.error("Resend send failed:", error);
    throw error;
  }
};

module.exports = sendEmail;