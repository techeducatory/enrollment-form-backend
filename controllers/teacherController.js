const { pool } = require('../config/db');
const { generateTeacherReferralCode } = require('../utils/helpers');
const { sendEmail } = require('../utils/emailService');
const { generateTeacherReferralPDF } = require('../utils/teacherReferralPDF');
const fs = require('fs').promises;

exports.registerTeacher = async (req, res) => {
  const connection = await pool.getConnection();
  let pdfPath1 = null;
  let pdfPath2 = null;
  
  try {
    const { name, email, phone, type, institutionName } = req.body;
   
    // Generate unique referral code
    const referralCode = await generateTeacherReferralCode();

    // Insert teacher details
    await connection.query(
      `INSERT INTO teacher_referrals 
       (name, email, phone, type, institution_name, referral_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, phone, type, institutionName, referralCode]
    );

    // Generate PDF
    const teacherData = {
      name,
      type,
      institutionName,
      referralCode
    };
    
    pdfPath1 = await generateTeacherReferralPDF(teacherData, true);
    pdfPath2 = await generateTeacherReferralPDF(teacherData, false);

    // Send referral code via email with PDF
    const emailSubject = 'Educatory - Thank you for registering as a Mentor!';
    const emailBody = `
      <h2>Welcome to Educatory!</h2>
      <p>Dear ${name},</p>
      <p>Thank you for registering as a Mentor at Educatory.</p>
      <p>Your unique referral code is: <strong>${referralCode}</strong></p>
      <p>We've attached a shareable PDF document with all the details about enrollment process.</p>
      <p>Share this with deserving students only who you think may be worthy of 10% scholarship.</p>
      <p>Click <a href="https://register.educatory.ac/mentor-dashboard?referralCode=${referralCode}">here</a> to see the list of all the students enrolled at educatory recommended by you.</p>
      <p>Best Regards,<br> Team Educatory</p>
    `;

    const attachments = [{
      filename: 'Educatory_Scholarship.pdf',
      path: pdfPath2,
    },
    {
      filename: 'Educatory_Exclusive_Scholarship.pdf',
      path: pdfPath1,
    }];

    await sendEmail(email, emailSubject, emailBody, attachments);
    res.status(201).json({
      success: true,
      message: 'Registration successful. Referral code and PDF sent to your email.',
      data: {
        referralCode,
        type
      }
    });

  } catch (error) {
    console.error('Error registering teacher:', error);
    res.status(500).json({
      success: false,
      message: error.code === 'ER_DUP_ENTRY' ? 
        'Email already registered' : 
        'Registration failed'
    });
  } finally {
    if (pdfPath1) {
      try {
        await fs.unlink(pdfPath1); // Clean up the temporary PDF file
      } catch (err) {
        console.error('Error cleaning up PDF:', err);
      }
    }
    if (pdfPath2) {
      try {
        await fs.unlink(pdfPath2); // Clean up the temporary PDF file
      } catch (err) {
        console.error('Error cleaning up PDF:', err);
      }
    }
    connection.release();
  }
};

exports.getReferralStudents = async (req, res) => {
  const { referralCode } = req.query;
  
  if (!referralCode) {
    return res.status(400).json({
      success: false,
      message: 'Referral code is required'
    });
  }

  try {
    // First verify the referral code exists
    const [teacher] = await pool.query(
      'SELECT * FROM teacher_referrals WHERE referral_code = ?',
      [referralCode]
    );
    console.log('Teacher data:', referralCode, teacher);
    if (teacher.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }

    // Get all students referred by this code (only requested fields)
    const [students] = await pool.query(`
      SELECT 
        e.enrollment_id,
        e.first_name,
        e.last_name,
        e.course_name,
        e.enrollment_status,
        tru.created_at as referral_date
      FROM teacher_referral_uses tru
      JOIN enrollments e ON tru.enrollment_id = e.enrollment_id
      WHERE tru.referral_code = ?
      ORDER BY tru.created_at DESC
    `, [referralCode]);

    res.status(200).json({
      success: true,
      data: {
        teacher: teacher[0],
        students,
        totalReferrals: students.length
      }
    });
  } catch (error) {
    console.error('Error fetching referral students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch referral data'
    });
  }
};