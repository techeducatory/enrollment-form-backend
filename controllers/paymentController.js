const { pool } = require('../config/db');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { sendEmail } = require('../utils/emailService');
const { markCouponsAsUsed, notifyCouponUsage } = require('./couponController');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create a Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency, receipt, notes } = req.body;
    
    const options = {
      amount: amount, // Use amount directly from frontend
      currency: currency || 'INR',
      receipt: receipt,
      notes: notes
    };
    
    const order = await razorpay.orders.create(options);
    
    await pool.query(
      `INSERT INTO payments (enrollment_id, razorpay_order_id, amount, currency) 
       VALUES (?, ?, ?, ?)`,
      [notes.enrollmentId, order.id, amount/100, currency || 'INR']
    );
    
    res.status(200).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order', 
      error: error.message 
    });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, enrollmentId, appliedCoupons, referralCode } = req.body;
    
    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    
    if (referralCode) {
      const referralController = require('./referralController');
      await referralController.applyReferralCode(referralCode, enrollmentId, connection);
    }
    
    // Mark coupons as used if any
    if (appliedCoupons && appliedCoupons.length > 0) {
      await markCouponsAsUsed(appliedCoupons, razorpay_payment_id, connection);
      
      // Notify users about coupon usage
      for (const coupon of appliedCoupons) {
        await notifyCouponUsage(
          coupon.code,
          razorpay_payment_id,
          `${process.env.FRONTEND_URL}/payment/${razorpay_payment_id}`
        );
      }
    }
    
    // Update payment status in database
    await connection.query(
      `UPDATE payments SET razorpay_payment_id = ?, status = 'completed' WHERE razorpay_order_id = ?`,
      [razorpay_payment_id, razorpay_order_id]
    );
    
    // Update enrollment status
    await connection.query(
      `UPDATE enrollments SET enrollment_status = 'payment_completed' WHERE enrollment_id = ?`,
      [enrollmentId]
    );

    await connection.commit();
    
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment', error: error.message });
  } finally {
    connection.release();
  }
};