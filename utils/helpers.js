const { pool } = require('../config/db');

// Generate unique enrollment ID with format YYYYMMDDEDXXX
const generateEnrollmentId = async () => {
  const connection = await pool.getConnection();
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = dateStr + 'ED';

    // Get the current counter for today
    const [rows] = await connection.query(
      `SELECT COUNT(*) as count FROM enrollments 
       WHERE enrollment_id LIKE ?`,
      [dateStr + '%']  // Match by date part only
    );

    const counter = (rows[0].count + 1).toString().padStart(3, '0');
    return prefix + counter;
  } finally {
    connection.release();
  }
};

// Generate 6 character referral code
const generateReferralCode = async () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  const connection = await pool.getConnection();

  try {
    while (!isUnique) {
      code = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      // Check if code exists
      const [existing] = await connection.query(
        'SELECT referral_code FROM referrals WHERE referral_code = ?',
        [code]
      );

      if (existing.length === 0) {
        isUnique = true;
      }
    }
    return code;
  } finally {
    connection.release();
  }
};

// Generate coupon code with format EDU + timestamp + random string
const generateCouponCode = () => {
  const prefix = 'EDU';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

/**
 * Generate a unique teacher referral code
 * @returns {string} Referral code in format TCH-XXXXX
 */
const generateTeacherReferralCode = async () => {
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `T${random}`;
};

module.exports = {
  generateEnrollmentId,
  generateReferralCode,
  generateCouponCode,
  generateTeacherReferralCode
};