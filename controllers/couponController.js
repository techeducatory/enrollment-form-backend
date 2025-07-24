const { pool } = require('../config/db');
const { generateOTP } = require('../utils/couponGenerator');
const { sendEmail } = require('../utils/emailService');

exports.validateCoupon = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { couponCode, courseAmount } = req.body;

    const [coupon] = await connection.query(
      `SELECT c.*, e.email, e.first_name, e.last_name
       FROM coupons c
       JOIN referrals r ON c.referral_code = r.referral_code
       JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       WHERE c.coupon_code = ? AND c.is_used = 0`,
      [couponCode]
    );

    if (coupon.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or already used coupon'
      });
    }

    let discountAmount = coupon[0].amount;
    let isAdjusted = false;

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
      coupon[0].email,
      'OTP for Onetime Use Lifetime Coupon Validation',
      `<p>Dear ${coupon[0].first_name} ${coupon[0].last_name},</p>
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
      message: 'OTP sent to registered email'
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
    const { otp, currentCoupon, appliedCoupons, courseAmount } = req.body;
    
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

    // Store verified coupons in a temporary table for payment processing
    await connection.query(
      `INSERT INTO pending_coupons (coupon_code, enrollment_id, verification_time)
       VALUES (?, ?, NOW())`,
      [currentCoupon.code, req.body.enrollmentId]
    );

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

// Add new method to verify and mark coupons as used during payment
exports.markCouponsAsUsed = async (coupons, paymentId, connection) => {
  try {
    // Get all pending coupons for the transaction
    const [pendingCoupons] = await connection.query(
      `SELECT * FROM pending_coupons 
       WHERE coupon_code IN (?)
       AND status = 'pending'`,
      [coupons.map(c => c.code)]
    );

    if (new Set(pendingCoupons.map(c => c.coupon_code)).size !== coupons.length) {
      throw new Error('Some coupons were not properly verified');
    }

    // Mark coupons as used
    await connection.query(
      `UPDATE coupons 
       SET is_used = 1, 
           used_at = NOW(),
           transaction_id = ?
       WHERE coupon_code IN (?)`,
      [paymentId, coupons.map(c => c.code)]
    );

    // Update pending_coupons status
    await connection.query(
      `UPDATE pending_coupons 
       SET status = 'verified',
           payment_id = ?
       WHERE coupon_code IN (?)`,
      [paymentId, coupons.map(c => c.code)]
    );

    return true;
  } catch (error) {
    throw error;
  }
};

exports.notifyCouponUsage = async (couponCode, paymentId, paymentLink) => {
  const connection = await pool.getConnection();

  try {
    const [coupon] = await connection.query(
      `SELECT c.*, e.email, e.first_name, e.last_name
       FROM coupons c
       JOIN referrals r ON c.referral_code = r.referral_code
       JOIN enrollments e ON r.enrollment_id = e.enrollment_id
       WHERE c.coupon_code = ?`,
      [couponCode]
    );

    if (coupon.length > 0) {
      await sendEmail(
        coupon[0].email,
        'Your Onetime Use Lifetime Coupon Has Been Used',
        `<p>Dear ${coupon[0].first_name} ${coupon[0].last_name},</p>
         <p>Your coupon (${couponCode}) has been successfully used.</p>
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
