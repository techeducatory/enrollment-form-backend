const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const fs = require('fs').promises;

dotenv.config();

// Configure the email transporter for cPanel SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // cPanel SMTP server
  port: process.env.SMTP_PORT, // Typically 465 for SSL or 587 for TLS
  secure: process.env.SMTP_SECURE === 'true', // Use SSL/TLS
  auth: {
    user: process.env.SMTP_USER, // SMTP username
    pass: process.env.SMTP_PASS  // SMTP password
  }
});

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email body in HTML format
 * @param {Array} attachments - List of attachments
 * @param {boolean} includeAdmin - Whether to include admin in CC
 */
exports.sendEmail = async (to, subject, html, attachments = [], includeAdmin = false) => {
  try {

    // const logoHtml = `
    //   <div style="text-align: center; margin-bottom: 20px;">
    //     <img 
    //       src="https://educatory.ac/images/educatory-logo.jpg" 
    //       alt="Educatory Logo" 
    //       style="width: 90%; max-width: 200px; height: auto;" 
    //     />
    //   </div>
    // `;

    // const finalHtml = `${logoHtml}${html}`;


    // Validate attachments
    const validAttachments = Array.isArray(attachments)
      ? attachments.map(att => ({
          ...att,
          contentDisposition: att.contentDisposition || 'attachment'
        }))
      : [];

    const mailOptions = {
      from: `Educatory <${process.env.SMTP_USER}>`,
      to,
      cc: includeAdmin ? 'academics@educatory.ac' : undefined,
      subject,
      html,
      attachments: validAttachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};
