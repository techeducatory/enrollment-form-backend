const { pool } = require('../config/db');

exports.applyReferralCode = async (referralCode, enrollmentId, connection) => {
  try {
    // Check student referrals
    const [studentReferral] = await connection.query(
      `SELECT referral_code FROM referrals 
       WHERE referral_code = ? AND status = 'active'`,
      [referralCode]
    );

    if (studentReferral.length > 0) {
      await connection.query(
        `INSERT INTO referral_uses (referral_code, referred_enrollment_id, validation_status)
         VALUES (?, ?, 'approved')`,
        [referralCode, enrollmentId]
      );

      await connection.query(
        `UPDATE referrals SET times_used = times_used + 1
         WHERE referral_code = ?`,
        [referralCode]
      );
      return;
    }

    // Check teacher referrals
    const [teacherReferral] = await connection.query(
      `SELECT * FROM teacher_referrals 
       WHERE referral_code = ? AND status = 'active'`,
      [referralCode]
    );

    if (teacherReferral.length === 0) {
      throw new Error('Invalid or inactive referral code');
    }

    // Record teacher referral use
    await connection.query(
      `INSERT INTO teacher_referral_uses 
       (referral_code, enrollment_id, commission_amount)
       VALUES (?, ?, ?)`,
      [referralCode, enrollmentId, teacherReferral[0].commission_per_referral]
    );

  } catch (error) {
    console.error('Error applying referral code:', error);
    throw error;
  }
};

exports.validateReferralCode = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { referralCode, email, phone, aadharNumber } = req.body;

    // Check student referrals first
    const [studentReferral] = await connection.query(
      `SELECT r.referral_code, r.status,
              e.first_name, e.last_name
       FROM referrals r
       JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       WHERE r.referral_code = ? AND r.status = 'active'`,
      [referralCode]
    );

    if (studentReferral.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Valid student referral code',
        data: {
          referrerName: `${studentReferral[0].first_name} ${studentReferral[0].last_name}`,
          discountPerClass: '10% of course fee',
          referrerType: 'student'
        }
      });
    }

    // Check teacher referrals
    const [teacherReferral] = await connection.query(
      `SELECT * FROM teacher_referrals 
       WHERE referral_code = ? AND status = 'active'`,
      [referralCode]
    );

    if (teacherReferral.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Valid education partner referral code',
        data: {
          referrerName: teacherReferral[0].name,
          discountPerClass: '10%',
          referrerType: teacherReferral[0].type
        }
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Invalid or inactive referral code'
    });

  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate referral code',
      error: error.message
    });
  } finally {
    connection.release();
  }
};
