const { pool } = require('../config/db');
const { generateOTP } = require('../utils/couponGenerator');
const { sendEmail } = require('../utils/emailService');

exports.validateCoupon = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { couponCode, courseAmount } = req.body;

    // Check student coupons
    const [studentCoupon] = await connection.query(
      `SELECT c.*, sd.email, sd.first_name, sd.last_name, 'student' as source
       FROM coupons c
       JOIN student_details sd ON c.student_id = sd.id
       WHERE c.coupon_code = ? AND c.is_used = 0`,
      [couponCode]
    );

    // Check referral coupons if no student coupon is found
    const [referralCoupon] = await connection.query(
      `SELECT c.*, e.email, e.first_name, e.last_name, 'referral' as source
       FROM coupons c
       JOIN referrals r ON c.referral_code = r.referral_code
       JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       WHERE c.coupon_code = ? AND c.is_used = 0`,
      [couponCode]
    );

    const coupon = studentCoupon.length > 0 ? studentCoupon[0] : 
                   referralCoupon.length > 0 ? referralCoupon[0] : null;

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or already used coupon'
      });
    }

    let discountAmount = coupon.amount;
    let isAdjusted = false;
    console.log(`Coupon found: ${coupon.coupon_code}, Amount: ₹${discountAmount}`);

    // Check if final amount would be less than ₹1
    if (courseAmount - discountAmount < 1) {
      discountAmount = courseAmount - 1; // Adjust discount to leave ₹1
      isAdjusted = true;
    }

    // Generate and store OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60000); // 10 minutes

    await connection.query(
      `UPDATE coupons 
       SET otp = ?, otp_expiry = ?,
           amount = IF(? < amount, ?, amount)
       WHERE coupon_code = ?`,
      [otp, otpExpiry, discountAmount, discountAmount, couponCode]
    );

    // Send OTP email
    await sendEmail(
      coupon.email,
      'OTP for Coupon Validation',
      `<p>Dear ${coupon.first_name} ${coupon.last_name},</p>
       <p>Your OTP for validating coupon ${couponCode} is: <strong>${otp}</strong></p>
       <p>This OTP is valid for 10 minutes.</p>
       <p>Coupon Value: ₹${discountAmount}</p>
       ${isAdjusted ? '<p>Note: Coupon amount has been adjusted to maintain minimum course fee of ₹1</p>' : ''}
       <p>Best Regards,<br>Team Educatory</p>`
    );

    res.status(200).json({
      success: true,
      discountAmount,
      finalAmount: courseAmount - discountAmount,
      isAdjusted,
      message: 'OTP sent to registered email',
      couponType: coupon.source
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

exports.verifyOTP = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { otp, currentCoupon, appliedCoupons, courseAmount, enrollmentId } = req.body;
    
    // Only validate the current coupon being verified
    const [validCoupon] = await connection.query(
      `SELECT * FROM coupons 
       WHERE coupon_code = ? 
       AND otp = ? 
       AND otp_expiry > NOW()
       AND is_used = 0`,
      [currentCoupon.code, otp]
    );

    if (validCoupon.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Calculate total discount including previously applied coupons
    const allCoupons = [...appliedCoupons, validCoupon[0]];
    const totalDiscount = allCoupons.reduce((sum, coupon) => {
      return sum + parseFloat(coupon.amount);
    }, 0);

    // Ensure final amount is not less than ₹1
    const finalAmount = Math.max(1, courseAmount - totalDiscount);

    // Handle enrollment_id foreign key constraint
    if (enrollmentId) {
      try {
        // Check if enrollment_id exists in enrollments table
        const [existingEnrollment] = await connection.query(
          `SELECT enrollment_id FROM enrollments WHERE enrollment_id = ?`,
          [enrollmentId]
        );

        if (existingEnrollment.length > 0) {
          // Store verified coupons in pending_coupons table
          await connection.query(
            `INSERT INTO pending_coupons (coupon_code, enrollment_id, verification_time, status)
             VALUES (?, ?, NOW(), 'pending')
             ON DUPLICATE KEY UPDATE 
             verification_time = NOW(), 
             status = 'pending'`,
            [currentCoupon.code, enrollmentId]
          );
        } else {
          console.log(`Enrollment ID ${enrollmentId} does not exist yet. Storing coupon verification without enrollment reference.`);
          
          // Since enrollment_id cannot be null, use alternative verification method
          // Store verification directly in coupons table
          await connection.query(
            `UPDATE coupons 
             SET validation_otp = ?, 
                 otp_expiry = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
             WHERE coupon_code = ?`,
            [otp, currentCoupon.code]
          );
        }
      } catch (fkError) {
        console.log('Foreign key or null constraint error, using alternative verification method');
        
        // Store verification directly in coupons table as fallback
        await connection.query(
          `UPDATE coupons 
           SET validation_otp = ?, 
               otp_expiry = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
           WHERE coupon_code = ?`,
          [otp, currentCoupon.code]
        );
      }
    } else {
      // No enrollment ID provided, store verification without it
      await connection.query(
        `UPDATE coupons 
         SET validation_otp = ?, 
             otp_expiry = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
         WHERE coupon_code = ?`,
        [otp, currentCoupon.code]
      );
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      finalAmount,
      verifiedCoupon: {
        code: currentCoupon.code,
        amount: validCoupon[0].amount
      }
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Updated method to verify and mark coupons as used during payment
exports.markCouponsAsUsed = async (coupons, paymentId, enrollmentId, connection) => {
  // const connection = await pool.getConnection();
  try {
    // First, check for pending coupons
    const [pendingCoupons] = await connection.query(
      `SELECT * FROM pending_coupons 
       WHERE coupon_code IN (?)
       AND status = 'pending'`,
      [coupons.map(c => c.code)]
    );

    // If no pending coupons found, check for validation_otp verification
    if (pendingCoupons.length === 0) {
      const [verifiedCoupons] = await connection.query(
        `SELECT * FROM coupons 
         WHERE coupon_code IN (?)
         AND validation_otp IS NOT NULL
         AND otp_expiry > NOW()
         AND is_used = 0`,
        [coupons.map(c => c.code)]
      );

      if (verifiedCoupons.length !== coupons.length) {
        throw new Error('Some coupons were not properly verified');
      }
    } else if (pendingCoupons.length !== coupons.length) {
      // Check remaining coupons in validation_otp
      const pendingCodes = new Set(pendingCoupons.map(c => c.coupon_code));
      const remainingCodes = coupons.filter(c => !pendingCodes.has(c.code)).map(c => c.code);
      
      if (remainingCodes.length > 0) {
        const [verifiedCoupons] = await connection.query(
          `SELECT * FROM coupons 
           WHERE coupon_code IN (?)
           AND validation_otp IS NOT NULL
           AND otp_expiry > NOW()
           AND is_used = 0`,
          [remainingCodes]
        );

        if (verifiedCoupons.length !== remainingCodes.length) {
          throw new Error('Some coupons were not properly verified');
        }
      }
    }

    // Mark coupons as used
    await connection.query(
      `UPDATE coupons 
       SET is_used = 1, 
           used_at = NOW(),
           transaction_id = ?,
           validation_otp = NULL
       WHERE coupon_code IN (?)`,
      [paymentId, coupons.map(c => c.code)]
    );

    // Update pending_coupons status if they exist
    if (pendingCoupons.length > 0) {
      await connection.query(
        `UPDATE pending_coupons 
         SET status = 'verified',
             payment_id = ?,
             enrollment_id = COALESCE(enrollment_id, ?)
         WHERE coupon_code IN (?)`,
        [paymentId, enrollmentId, pendingCoupons.map(c => c.coupon_code)]
      );
    }

    // Insert pending_coupons for coupons that were verified via validation_otp
    const pendingCodes = new Set(pendingCoupons.map(c => c.coupon_code));
    const nonPendingCoupons = coupons.filter(c => !pendingCodes.has(c.code));
    
    if (nonPendingCoupons.length > 0) {
      const insertValues = nonPendingCoupons.map(c => 
        `('${c.code}', '${enrollmentId}', NOW(), 'verified', '${paymentId}')`
      ).join(',');
      
      await connection.query(
        `INSERT INTO pending_coupons (coupon_code, enrollment_id, verification_time, status, payment_id)
         VALUES ${insertValues}`
      );
    }

    return true;
  } catch (error) {
    console.error('Error marking coupons as used:', error);
    throw error;
  }
};

exports.notifyCouponUsage = async (couponCode, paymentId, paymentLink) => {
  const connection = await pool.getConnection();

  try {
    // Check both student and referral coupons
    const [coupon] = await connection.query(
      `SELECT 
        c.*, 
        COALESCE(e.email, sd.email) as email,
        COALESCE(e.first_name, sd.first_name) as first_name,
        COALESCE(e.last_name, sd.last_name) as last_name,
        CASE 
          WHEN sd.id IS NOT NULL THEN 'student'
          ELSE 'referral'
        END as source
       FROM coupons c
       LEFT JOIN referrals r ON c.referral_code = r.referral_code
       LEFT JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       LEFT JOIN student_details sd ON c.student_id = sd.id
       WHERE c.coupon_code = ?`,
      [couponCode]
    );

    if (coupon.length > 0) {
      await sendEmail(
        coupon[0].email,
        'Your Coupon Has Been Used',
        `<p>Dear ${coupon[0].first_name} ${coupon[0].last_name},</p>
         <p>Your ${coupon[0].source === 'student' ? 'student' : 'referral'} coupon (${couponCode}) has been successfully used.</p>
         <p>Transaction ID: ${paymentId}</p>
         <p>Amount: ₹${coupon[0].amount}</p>
         <p>You can view the payment details here: ${paymentLink}</p>
         <p>Best Regards,<br>Team Educatory</p>`
      );
    }
  } catch (error) {
    console.error('Error sending coupon usage notification:', error);
  } finally {
    connection.release();
  }
};

// Helper function to clean up expired verifications
exports.cleanupExpiredVerifications = async () => {
  const connection = await pool.getConnection();
  
  try {
    // Clean up expired OTPs
    await connection.query(
      `UPDATE coupons 
       SET otp = NULL, otp_expiry = NULL, validation_otp = NULL
       WHERE otp_expiry < NOW()`
    );

    // Clean up expired pending coupons
    await connection.query(
      `UPDATE pending_coupons 
       SET status = 'expired'
       WHERE verification_time < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
       AND status = 'pending'`
    );

    console.log('Cleaned up expired verifications');
  } catch (error) {
    console.error('Error cleaning up expired verifications:', error);
  } finally {
    connection.release();
  }
};