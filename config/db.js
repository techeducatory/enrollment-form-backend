const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'course_enrollment',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const connectDB = async () => {
  try {
    await pool.getConnection();
    console.log('MySQL Database connected');
    
    // Check if tables exist, if not create them
    await initializeTables();
  } catch (error) {
    console.error('MySQL connection error:', error);
    process.exit(1);
  }
};

const initializeTables = async () => {
  try {
    // First check if tables exist
    const [tables] = await pool.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()`
    );

    const existingTables = tables.map(t => t.TABLE_NAME);

    // If tables don't exist, create them
    if (!existingTables.includes('enrollments')) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS enrollments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id VARCHAR(20) UNIQUE NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          email VARCHAR(100) NOT NULL,
          phone VARCHAR(15) NOT NULL,
          aadhar_number VARCHAR(12) NOT NULL,
          address TEXT NOT NULL,
          city VARCHAR(100) NOT NULL,
          district VARCHAR(100) NOT NULL,
          state VARCHAR(100) NOT NULL,
          pin_code VARCHAR(10) NOT NULL,
          course_name VARCHAR(255) NOT NULL,
          course_id VARCHAR(50) NOT NULL,
          course_fee DECIMAL(10, 2) NOT NULL,
          school_name VARCHAR(200),
          school_city VARCHAR(100),
          school_district VARCHAR(100),
          school_state VARCHAR(100),
          school_pin_code VARCHAR(10),
          father_name VARCHAR(100),
          father_occupation VARCHAR(100),
          father_phone VARCHAR(15),
          father_email VARCHAR(100),
          father_address TEXT,
          father_city VARCHAR(100),
          father_district VARCHAR(100),
          father_state VARCHAR(100),
          father_pin_code VARCHAR(10),
          mother_name VARCHAR(100),
          mother_occupation VARCHAR(100),
          mother_phone VARCHAR(15),
          mother_email VARCHAR(100),
          mother_address TEXT,
          mother_city VARCHAR(100),
          mother_district VARCHAR(100),
          mother_state VARCHAR(100),
          mother_pin_code VARCHAR(10),
          reference_source VARCHAR(50),
          photo_path VARCHAR(255),
          aadhar_pdf_path VARCHAR(255),
          enrollment_status ENUM('pending', 'payment_completed', 'completed') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id VARCHAR(20) NOT NULL,
          razorpay_order_id VARCHAR(255) NOT NULL,
          razorpay_payment_id VARCHAR(255),
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          status ENUM('created', 'attempted', 'completed', 'failed') DEFAULT 'created',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id VARCHAR(20) NOT NULL,
          referral_code VARCHAR(10) UNIQUE NOT NULL,
          times_used INT DEFAULT 0,
          status ENUM('active', 'inactive') DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS referral_uses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          referral_code VARCHAR(10) NOT NULL,
          referred_enrollment_id VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (referral_code) REFERENCES referrals(referral_code),
          FOREIGN KEY (referred_enrollment_id) REFERENCES enrollments(enrollment_id)
        )
      `);
    }

    // Create coupons table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_code VARCHAR(20) UNIQUE NOT NULL,
        referral_code VARCHAR(10) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        is_used TINYINT(1) DEFAULT 0,
        transaction_id VARCHAR(255),
        payment_link VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL DEFAULT NULL,
        otp VARCHAR(6),
        otp_expiry TIMESTAMP NULL DEFAULT NULL,
        FOREIGN KEY (referral_code) REFERENCES referrals(referral_code)
      )
    `);

    // Create pending_coupons table with improved schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_code VARCHAR(20) NOT NULL,
        enrollment_id VARCHAR(20) NOT NULL,
        verification_time DATETIME NOT NULL,
        status ENUM('pending', 'verified', 'expired', 'failed') DEFAULT 'pending',
        payment_id VARCHAR(100),
        attempts INT DEFAULT 0,
        last_attempt_at TIMESTAMP NULL DEFAULT NULL,
        validation_otp VARCHAR(6),
        otp_expiry TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (coupon_code) REFERENCES coupons(coupon_code),
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id),
        INDEX (coupon_code),
        INDEX (enrollment_id),
        INDEX (status)
      )
    `);

    // Update referral_uses table to include validation fields
    const [referralColumns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'referral_uses'
    `);
    
    const existingColumns = referralColumns.map(col => col.COLUMN_NAME);

    if (!existingColumns.includes('validation_status')) {
      await pool.query(`
        ALTER TABLE referral_uses 
        ADD COLUMN validation_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'
      `);
    }

    if (!existingColumns.includes('rejection_reason')) {
      await pool.query(`
        ALTER TABLE referral_uses 
        ADD COLUMN rejection_reason TEXT
      `);
    }

    // Create teacher_referrals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_referrals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(15) NOT NULL,
        type VARCHAR(100) NOT NULL,
        institution_name VARCHAR(200) NOT NULL,
        referral_code VARCHAR(10) UNIQUE NOT NULL,
        commission_per_referral DECIMAL(10, 2) DEFAULT 500.00,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create teacher_referral_uses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_referral_uses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        referral_code VARCHAR(10) NOT NULL,
        enrollment_id VARCHAR(20) NOT NULL,
        commission_amount DECIMAL(10, 2) NOT NULL,
        paid_status ENUM('pending', 'paid') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP NULL DEFAULT NULL,
        FOREIGN KEY (referral_code) REFERENCES teacher_referrals(referral_code),
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
      )
    `);

    // Create invoices table for invoice number tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id VARCHAR(20) NOT NULL,
      invoice_number INT NOT NULL UNIQUE,
      formatted_invoice_number VARCHAR(30) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
      )
    `);

    // After creating or if tables exist, run updates
    await updateTables();

    console.log('Database tables initialized and updated');
  } catch (error) {
    console.error('Error initializing tables:', error);
    throw error;
  }
};

const updateTables = async () => {
  try {
    // Check if column exists before adding it
    const addColumnIfNotExists = async (table, column, definition) => {
      const [columns] = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ? 
        AND COLUMN_NAME = ?`, [table, column]);
      
      if (columns.length === 0) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Added column ${column} to ${table}`);
      }
    };

    // Add any pending columns to pending_coupons table
    // await addColumnIfNotExists('pending_coupons', 'status', "ENUM('pending', 'verified', 'expired', 'failed') DEFAULT 'pending'");
    // await addColumnIfNotExists('pending_coupons', 'attempts', 'INT DEFAULT 0');
    // await addColumnIfNotExists('pending_coupons', 'last_attempt_at', 'TIMESTAMP NULL DEFAULT NULL');
    // await addColumnIfNotExists('pending_coupons', 'validation_otp', 'VARCHAR(6)');
    // await addColumnIfNotExists('pending_coupons', 'otp_expiry', 'TIMESTAMP NULL DEFAULT NULL');
    // await addColumnIfNotExists('pending_coupons', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    console.log('Database tables updated successfully');
  } catch (error) {
    console.error('Error updating tables:', error);
    throw error;
  }
};

/**
 * Returns the next formatted invoice number and inserts it for the given enrollment_id.
 * This function now accepts a connection parameter to use within an existing transaction.
 * If no connection is provided, it will use the pool (for standalone usage).
 */
const getNextInvoiceNumber = async (enrollmentId, connection = null) => {
  const conn = connection || pool;
  
  try {
    // Use FOR UPDATE to lock the row and prevent concurrent access
    const [rows] = await conn.query('SELECT MAX(invoice_number) as maxNo FROM invoices FOR UPDATE');
    const nextNo = (rows[0].maxNo || 0) + 1;
    
    // Format: EDU-YYYY-XXXXX (e.g., EDU-2024-00001)
    const year = new Date().getFullYear();
    const formattedInvoiceNumber = `EDU-${year}-${String(nextNo).padStart(5, '0')}`;
    
    // Insert the new invoice record (store both numeric and formatted invoice number)
    await conn.query(
      'INSERT INTO invoices (enrollment_id, invoice_number, formatted_invoice_number) VALUES (?, ?, ?)',
      [enrollmentId, nextNo, formattedInvoiceNumber]
    );
    
    return formattedInvoiceNumber;
  } catch (error) {
    console.error('Error in getNextInvoiceNumber:', error);
    throw error;
  }
};

module.exports = {
  connectDB,
  pool,
  getNextInvoiceNumber
};